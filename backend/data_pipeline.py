#!/usr/bin/env python3
"""
data_pipeline.py — Space-Track TLE ingestion pipeline

Fetches GP-class orbital elements for space debris from Space-Track.org,
with local caching, exponential backoff, and synthetic mock fallback.

Prototype mode: Cosmos 2251 + Iridium 33 collision debris only (~600–700 objects).
Full mode:      All tracked debris in the USSPACECOM catalog (~20,000 objects).
"""

import json
import logging
import math
import multiprocessing as mp
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from scipy.spatial import cKDTree
from sgp4.api import Satrec, jday

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / ".cache"
CACHE_FILE = CACHE_DIR / "tle_raw.json"
PARQUET_FILE = CACHE_DIR / "propagated_features.parquet"
ENV_FILE = BASE_DIR / ".env"

# ── Space-Track API ────────────────────────────────────────────────────────────

SPACETRACK_BASE = "https://www.space-track.org"
LOGIN_URL = f"{SPACETRACK_BASE}/ajaxauth/login"
GP_QUERY_BASE = f"{SPACETRACK_BASE}/basicspacedata/query"

PROTOTYPE_QUERIES = [
    "/class/gp/OBJECT_NAME/~~COSMOS 2251/OBJECT_TYPE/DEBRIS"
    "/DECAY_DATE/null-val/orderby/NORAD_CAT_ID/format/json",
    "/class/gp/OBJECT_NAME/~~IRIDIUM 33/OBJECT_TYPE/DEBRIS"
    "/DECAY_DATE/null-val/orderby/NORAD_CAT_ID/format/json",
]

FULL_QUERY = [
    "/class/gp/OBJECT_TYPE/DEBRIS/DECAY_DATE/null-val"
    "/orderby/NORAD_CAT_ID/format/json"
]

# ── Tuning ─────────────────────────────────────────────────────────────────────

MAX_RETRIES = 5
BASE_DELAY_S = 3.0
THROTTLE_S = 2.0
CACHE_TTL_HOURS = 24
REQUEST_TIMEOUT_S = 90

PROTOTYPE_MOCK_SIZE = 650
FULL_MOCK_SIZE = 20_000

# ── Propagation ────────────────────────────────────────────────────────────────

EARTH_RADIUS_KM = 6371.0
HORIZON_HOURS = 48
STEP_MINUTES = 5
SHELL_BAND_KM = 50.0


# ═══════════════════════════════════════════════════════════════════════════════
# Environment / Credentials
# ═══════════════════════════════════════════════════════════════════════════════

def _load_dotenv():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if sep:
            os.environ.setdefault(key.strip(), value.strip())


def get_credentials():
    _load_dotenv()
    identity = os.environ.get("SPACETRACK_USER")
    password = os.environ.get("SPACETRACK_PASS")
    if not identity or not password:
        logger.error("SPACETRACK_USER / SPACETRACK_PASS not set in .env")
        return None, None
    return identity, password


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _request_with_backoff(session, method, url, **kwargs):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.request(method, url, timeout=REQUEST_TIMEOUT_S, **kwargs)

            if resp.status_code == 429:
                delay = BASE_DELAY_S * (2 ** (attempt - 1)) + random.uniform(0, 2)
                logger.warning("Rate-limited (429). Retry %d/%d in %.1fs", attempt, MAX_RETRIES, delay)
                time.sleep(delay)
                continue

            resp.raise_for_status()
            return resp

        except requests.exceptions.RequestException as exc:
            if attempt == MAX_RETRIES:
                raise
            delay = BASE_DELAY_S * (2 ** (attempt - 1)) + random.uniform(0, 2)
            logger.warning("Request error [%d/%d]: %s — retrying in %.1fs", attempt, MAX_RETRIES, exc, delay)
            time.sleep(delay)

    raise RuntimeError("Exhausted retries without success")


# ═══════════════════════════════════════════════════════════════════════════════
# Space-Track ingestion
# ═══════════════════════════════════════════════════════════════════════════════

def _authenticate(session, identity, password):
    logger.info("Authenticating with Space-Track as %s", identity)
    resp = _request_with_backoff(session, "POST", LOGIN_URL, data={
        "identity": identity,
        "password": password,
    })
    if resp.status_code != 200 or "Failed" in resp.text:
        raise RuntimeError(f"Authentication failed: {resp.text[:200]}")
    logger.info("Authentication successful")


def _fetch_queries(session, query_paths):
    all_records = []
    for idx, path in enumerate(query_paths):
        url = f"{GP_QUERY_BASE}{path}"
        logger.info("Query %d/%d: %s", idx + 1, len(query_paths), url)
        resp = _request_with_backoff(session, "GET", url)
        data = resp.json()
        if isinstance(data, list):
            all_records.extend(data)
            logger.info("  → %d records", len(data))
        else:
            logger.warning("  → unexpected response: %s", type(data).__name__)
        if idx < len(query_paths) - 1:
            time.sleep(THROTTLE_S)
    return all_records


def fetch_from_api(prototype_mode=True):
    identity, password = get_credentials()
    if identity is None:
        return None

    queries = PROTOTYPE_QUERIES if prototype_mode else FULL_QUERY
    session = requests.Session()
    try:
        _authenticate(session, identity, password)
        records = _fetch_queries(session, queries)
        logger.info("Total records fetched from API: %d", len(records))
        return records
    except Exception:
        logger.exception("Space-Track API fetch failed")
        return None
    finally:
        session.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Caching
# ═══════════════════════════════════════════════════════════════════════════════

def load_cache(ttl_hours=CACHE_TTL_HOURS):
    if not CACHE_FILE.exists():
        logger.info("No cache file found at %s", CACHE_FILE)
        return None

    mtime = datetime.fromtimestamp(CACHE_FILE.stat().st_mtime, tz=timezone.utc)
    age = datetime.now(timezone.utc) - mtime

    if age > timedelta(hours=ttl_hours):
        logger.info("Cache stale (age %s > %dh TTL). Will re-fetch.", age, ttl_hours)
        return None

    logger.info("Loading from cache (age: %s)", str(age).split(".")[0])
    data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    logger.info("Loaded %d records from cache", len(data))
    return data


def save_cache(records):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(records, separators=(",", ":")), encoding="utf-8")
    size_mb = CACHE_FILE.stat().st_size / (1024 * 1024)
    logger.info("Saved %d records to cache (%.2f MB)", len(records), size_mb)


# ═══════════════════════════════════════════════════════════════════════════════
# Mock data generator
# ═══════════════════════════════════════════════════════════════════════════════

def _tle_checksum(line):
    total = 0
    for ch in line[:68]:
        if ch.isdigit():
            total += int(ch)
        elif ch == "-":
            total += 1
    return total % 10


def _mock_tle_pair(norad_id, intl_desig="99025A  "):
    inc = random.uniform(60.0, 90.0)
    raan = random.uniform(0, 360)
    ecc = random.uniform(0.0001, 0.04)
    argp = random.uniform(0, 360)
    ma = random.uniform(0, 360)
    mm = random.uniform(13.8, 15.8)
    epoch_day = random.uniform(170.0, 180.0)

    ecc_s = f"{ecc:.7f}"[2:]

    l1_body = (
        f"1 {norad_id:05d}U {intl_desig} 26{epoch_day:012.8f} "
        f" .00000100  00000-0  10000-3 0  999"
    )
    l1 = l1_body.ljust(68)[:68]
    l1 += str(_tle_checksum(l1))

    l2_body = (
        f"2 {norad_id:05d} {inc:8.4f} {raan:8.4f} {ecc_s} "
        f"{argp:8.4f} {ma:8.4f} {mm:11.8f}    1"
    )
    l2 = l2_body.ljust(68)[:68]
    l2 += str(_tle_checksum(l2))

    return l1, l2


def generate_mock_data(n_objects):
    logger.info("Generating %d synthetic GP records", n_objects)
    events = [
        ("COSMOS 2251 DEB", "93036"),
        ("IRIDIUM 33 DEB", "97051"),
    ]
    records = []

    for i in range(n_objects):
        name, cospar_prefix = events[i % len(events)]
        norad_id = 30000 + i
        frag = f"{chr(65 + i % 26)}{chr(65 + (i // 26) % 26)}{chr(65 + (i // 676) % 26)}"
        intl_desig = f"{cospar_prefix}{frag} "[:8]

        mm = random.uniform(13.8, 15.8)
        ecc = random.uniform(0.0001, 0.04)
        inc = random.uniform(60.0, 90.0)
        period = 1440.0 / mm
        sma = (8681663.85 / mm) ** (2.0 / 3.0) / 1000.0
        apo = sma * (1 + ecc) - 6371.0
        peri = sma * (1 - ecc) - 6371.0

        line1, line2 = _mock_tle_pair(norad_id, intl_desig)

        epoch_dt = datetime(2026, 6, random.randint(25, 29),
                            random.randint(0, 23), random.randint(0, 59),
                            random.randint(0, 59), tzinfo=timezone.utc)

        records.append({
            "CCSDS_OMM_VERS": "3.0",
            "NORAD_CAT_ID": str(norad_id),
            "OBJECT_NAME": name,
            "OBJECT_TYPE": "DEBRIS",
            "OBJECT_ID": f"{cospar_prefix[:5]}-{cospar_prefix[5:]}{frag}",
            "EPOCH": epoch_dt.strftime("%Y-%m-%dT%H:%M:%S.000"),
            "MEAN_MOTION": f"{mm:.8f}",
            "ECCENTRICITY": f"{ecc:.7f}",
            "INCLINATION": f"{inc:.4f}",
            "RA_OF_ASC_NODE": f"{random.uniform(0, 360):.4f}",
            "ARG_OF_PERICENTER": f"{random.uniform(0, 360):.4f}",
            "MEAN_ANOMALY": f"{random.uniform(0, 360):.4f}",
            "EPHEMERIS_TYPE": "0",
            "CLASSIFICATION_TYPE": "U",
            "ELEMENT_SET_NO": "999",
            "REV_AT_EPOCH": str(random.randint(10000, 90000)),
            "BSTAR": f"{random.uniform(1e-5, 1e-3):.10f}",
            "MEAN_MOTION_DOT": f"{random.uniform(-1e-6, 1e-6):.14f}",
            "MEAN_MOTION_DDOT": "0",
            "TLE_LINE0": f"0 {name}",
            "TLE_LINE1": line1,
            "TLE_LINE2": line2,
            "SEMIMAJOR_AXIS": f"{sma:.3f}",
            "PERIOD": f"{period:.3f}",
            "APOAPSIS": f"{apo:.3f}",
            "PERIAPSIS": f"{peri:.3f}",
            "DECAY_DATE": None,
            "FILE": str(random.randint(4000000, 4100000)),
            "GP_ID": str(250000000 + i),
        })

    return records


# ═══════════════════════════════════════════════════════════════════════════════
# Pipeline entrypoint
# ═══════════════════════════════════════════════════════════════════════════════

def run_pipeline(prototype_mode=True, force_refresh=False, use_mock_on_failure=True):
    """
    Execute the full ingest pipeline.

    Returns a list of GP record dicts with TLE_LINE1/TLE_LINE2 suitable for
    SGP4 propagation.
    """
    mode = "PROTOTYPE" if prototype_mode else "FULL"
    logger.info("Pipeline starting [mode=%s, force_refresh=%s]", mode, force_refresh)

    if not force_refresh:
        cached = load_cache()
        if cached is not None:
            return cached

    records = fetch_from_api(prototype_mode=prototype_mode)

    if records and len(records) > 0:
        save_cache(records)
        return records

    if use_mock_on_failure:
        mock_size = PROTOTYPE_MOCK_SIZE if prototype_mode else FULL_MOCK_SIZE
        logger.warning("Falling back to %d mock records", mock_size)
        records = generate_mock_data(mock_size)
        save_cache(records)
        return records

    logger.error("Pipeline failed — no data source available")
    return []


# ═══════════════════════════════════════════════════════════════════════════════
# SGP4 Propagation (multiprocessed)
# ═══════════════════════════════════════════════════════════════════════════════

_worker_jd = None
_worker_fr = None


def _init_prop_worker(jd_arr, fr_arr):
    global _worker_jd, _worker_fr
    _worker_jd = jd_arr
    _worker_fr = fr_arr


def _propagate_one(task):
    norad_id, line1, line2 = task
    try:
        sat = Satrec.twoline2rv(line1, line2)
        e, r, v = sat.sgp4_array(_worker_jd, _worker_fr)
        r = np.asarray(r, dtype=np.float64)
        v = np.asarray(v, dtype=np.float64)
        mask = np.asarray(e) != 0
        r[mask] = np.nan
        v[mask] = np.nan
        return norad_id, r, v
    except Exception:
        n = len(_worker_jd)
        return norad_id, np.full((n, 3), np.nan), np.full((n, 3), np.nan)


def _build_jd_arrays(t0, horizon_hours, step_minutes):
    n_steps = int(horizon_hours * 60 / step_minutes) + 1
    jd_arr = np.empty(n_steps, dtype=np.float64)
    fr_arr = np.empty(n_steps, dtype=np.float64)
    timestamps = []
    for i in range(n_steps):
        t = t0 + timedelta(minutes=i * step_minutes)
        jd_arr[i], fr_arr[i] = jday(
            t.year, t.month, t.day, t.hour, t.minute,
            t.second + t.microsecond / 1e6,
        )
        timestamps.append(t)
    return jd_arr, fr_arr, timestamps


def propagate_all(records, t0=None, horizon_hours=HORIZON_HOURS,
                  step_minutes=STEP_MINUTES, n_workers=None):
    if t0 is None:
        t0 = datetime.now(timezone.utc)

    jd_arr, fr_arr, timestamps = _build_jd_arrays(t0, horizon_hours, step_minutes)
    n_steps = len(timestamps)

    valid = [
        (r["NORAD_CAT_ID"], r["TLE_LINE1"], r["TLE_LINE2"])
        for r in records
        if r.get("TLE_LINE1") and r.get("TLE_LINE2")
    ]
    norad_ids = [v[0] for v in valid]
    n_obj = len(valid)
    if n_obj == 0:
        logger.warning("No valid TLE records to propagate")
        return norad_ids, np.empty((0, 0, 3)), np.empty((0, 0, 3)), timestamps

    if n_workers is None:
        n_workers = min(mp.cpu_count(), 8)

    logger.info(
        "Propagating %d objects × %d steps (%dh @ %d-min) with %d workers",
        n_obj, n_steps, horizon_hours, step_minutes, n_workers,
    )

    all_pos = np.full((n_obj, n_steps, 3), np.nan)
    all_vel = np.full((n_obj, n_steps, 3), np.nan)
    id_to_idx = {nid: i for i, nid in enumerate(norad_ids)}

    tasks = [(nid, l1, l2) for nid, l1, l2 in valid]
    t_start = time.perf_counter()

    with mp.Pool(n_workers, initializer=_init_prop_worker,
                 initargs=(jd_arr, fr_arr)) as pool:
        for nid, r, v in pool.imap_unordered(_propagate_one, tasks, chunksize=32):
            idx = id_to_idx[nid]
            all_pos[idx] = r
            all_vel[idx] = v

    elapsed = time.perf_counter() - t_start
    good = np.count_nonzero(~np.isnan(all_pos[:, 0, 0]))
    logger.info("Propagation complete: %d/%d succeeded in %.2fs", good, n_obj, elapsed)

    return norad_ids, all_pos, all_vel, timestamps


# ═══════════════════════════════════════════════════════════════════════════════
# Feature Engineering
# ═══════════════════════════════════════════════════════════════════════════════

def _nearest_approach_kdtree(all_pos):
    n_obj, n_steps, _ = all_pos.shape
    min_dist = np.full(n_obj, 1e50)

    for t in range(n_steps):
        pts = all_pos[:, t, :]
        valid_mask = ~np.any(np.isnan(pts), axis=1)
        n_valid = valid_mask.sum()
        if n_valid < 2:
            continue

        valid_idx = np.where(valid_mask)[0]
        tree = cKDTree(pts[valid_mask])
        dd, _ = tree.query(pts[valid_mask], k=2)
        nearest = dd[:, 1]
        min_dist[valid_idx] = np.minimum(min_dist[valid_idx], nearest)

    min_dist[min_dist >= 1e50] = np.nan
    return min_dist


def _shell_density(mean_alt, band_km=SHELL_BAND_KM):
    sorted_alt = np.sort(mean_alt[~np.isnan(mean_alt)])
    density = np.zeros(len(mean_alt), dtype=np.int32)
    for i, a in enumerate(mean_alt):
        if np.isnan(a):
            continue
        lo = np.searchsorted(sorted_alt, a - band_km, side="left")
        hi = np.searchsorted(sorted_alt, a + band_km, side="right")
        density[i] = (hi - lo) - 1
    return density


def compute_features(records, norad_ids, all_pos, all_vel):
    n_obj, n_steps, _ = all_pos.shape
    record_map = {r["NORAD_CAT_ID"]: r for r in records}

    radii = np.sqrt(np.nansum(all_pos ** 2, axis=2))
    altitudes = radii - EARTH_RADIUS_KM
    # Mask physically impossible altitudes (below surface or above 50,000 km)
    invalid = (altitudes < 0) | (altitudes > 50000)
    altitudes[invalid] = np.nan
    all_pos[invalid] = np.nan
    all_vel[invalid] = np.nan

    logger.info("Computing nearest approach via KD-Tree (%d steps)...", n_steps)
    nearest_approach = _nearest_approach_kdtree(all_pos)

    min_altitude = np.where(
    np.all(np.isnan(altitudes), axis=1),
    np.nan,
    np.nanmin(altitudes, axis=1)
    )

    mean_alt = np.nanmean(altitudes, axis=1)
    logger.info("Computing orbital shell density (±%d km)...", SHELL_BAND_KM)
    shell_density = _shell_density(mean_alt)

    debris_status = np.array([
        1 if record_map.get(nid, {}).get("OBJECT_TYPE", "") == "DEBRIS" else 0
        for nid in norad_ids
    ], dtype=np.int8)

    decay_rate = np.array([
        float(record_map.get(nid, {}).get("BSTAR", 0) or 0)
        for nid in norad_ids
    ], dtype=np.float64)

    logger.info("Features computed for %d objects", n_obj)
    return nearest_approach, min_altitude, shell_density, debris_status, decay_rate, altitudes


# ═══════════════════════════════════════════════════════════════════════════════
# Dataset Assembly & Parquet Export
# ═══════════════════════════════════════════════════════════════════════════════

def build_and_save_dataset(
    records,
    t0=None,
    horizon_hours=HORIZON_HOURS,
    step_minutes=STEP_MINUTES,
    n_workers=None,
    output_path=None,
):
    if output_path is None:
        output_path = PARQUET_FILE
    output_path = Path(output_path)

    norad_ids, all_pos, all_vel, timestamps = propagate_all(
        records, t0=t0, horizon_hours=horizon_hours,
        step_minutes=step_minutes, n_workers=n_workers,
    )
    n_obj = len(norad_ids)
    n_steps = len(timestamps)
    if n_obj == 0:
        logger.error("No objects to build dataset from")
        return None

    (nearest_approach, min_altitude, shell_density,
     debris_status, decay_rate, altitudes) = compute_features(
        records, norad_ids, all_pos, all_vel,
    )

    logger.info("Assembling DataFrame (%d objects × %d steps = %s rows)",
                n_obj, n_steps, f"{n_obj * n_steps:,}")

    ts_iso = np.array([t.isoformat() for t in timestamps])

    norad_col = np.repeat(np.array(norad_ids, dtype=object), n_steps)
    step_col = np.tile(np.arange(n_steps, dtype=np.int16), n_obj)
    ts_col = np.tile(ts_iso, n_obj)

    pos_flat = all_pos.reshape(-1, 3)
    vel_flat = all_vel.reshape(-1, 3)
    alt_flat = altitudes.reshape(-1)

    df = pd.DataFrame({
        "NORAD_CAT_ID": norad_col,
        "step": step_col,
        "timestamp": ts_col,
        "X": pos_flat[:, 0],
        "Y": pos_flat[:, 1],
        "Z": pos_flat[:, 2],
        "VX": vel_flat[:, 0],
        "VY": vel_flat[:, 1],
        "VZ": vel_flat[:, 2],
        "altitude": alt_flat,
        "nearest_approach": np.repeat(nearest_approach, n_steps),
        "min_altitude": np.repeat(min_altitude, n_steps),
        "shell_density": np.repeat(shell_density, n_steps),
        "debris_status": np.repeat(debris_status, n_steps),
        "decay_rate": np.repeat(decay_rate, n_steps),
    })

    df = df[df["min_altitude"].notna() & df["nearest_approach"].notna()].copy()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, engine="pyarrow", compression="snappy", index=False)
    size_mb = output_path.stat().st_size / (1024 * 1024)
    logger.info("Saved %s rows → %s (%.2f MB)", f"{len(df):,}", output_path.name, size_mb)

    return df


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    prototype = "--full" not in sys.argv
    force = "--force" in sys.argv
    mock_only = "--mock" in sys.argv
    do_propagate = "--propagate" in sys.argv

    if mock_only:
        size = PROTOTYPE_MOCK_SIZE if prototype else FULL_MOCK_SIZE
        records = generate_mock_data(size)
    else:
        records = run_pipeline(prototype_mode=prototype, force_refresh=force)

    print(f"\n{'=' * 64}")
    print(f"  Ingestion result: {len(records):,} records")
    print(f"  Mode:             {'prototype' if prototype else 'full'}")
    print(f"{'=' * 64}")

    if records:
        names = {}
        for r in records:
            n = r.get("OBJECT_NAME", "UNKNOWN")
            names[n] = names.get(n, 0) + 1

        print(f"  Unique object names: {len(names)}")
        for name, count in sorted(names.items(), key=lambda x: -x[1])[:10]:
            print(f"    {name:30s}  {count:>6,}")

        sample = records[0]
        has_tle = bool(sample.get("TLE_LINE1") and sample.get("TLE_LINE2"))
        print(f"\n  Sample → NORAD {sample.get('NORAD_CAT_ID')}, "
              f"name={sample.get('OBJECT_NAME')}, TLE={'✓' if has_tle else '✗'}")

    if do_propagate and records:
        print(f"\n{'─' * 64}")
        print("  Starting SGP4 propagation + feature engineering...")
        print(f"{'─' * 64}")
        df = build_and_save_dataset(records)
        if df is not None:
            print(f"\n{'=' * 64}")
            print(f"  Dataset:  {len(df):,} rows  ×  {len(df.columns)} columns")
            print(f"  Objects:  {df['NORAD_CAT_ID'].nunique():,}")
            print(f"  Steps:    {df['step'].max() + 1}")
            print(f"  Output:   {PARQUET_FILE}")
            print(f"{'=' * 64}")
            print(f"\n  Feature summary (per-object):")
            feat_df = df.drop_duplicates(subset="NORAD_CAT_ID")
            for col in ["nearest_approach", "min_altitude", "shell_density",
                        "debris_status", "decay_rate"]:
                vals = feat_df[col].dropna()
                if len(vals) > 0:
                    print(f"    {col:25s}  "
                          f"min={vals.min():>12.4f}  "
                          f"mean={vals.mean():>12.4f}  "
                          f"max={vals.max():>12.4f}")
    elif do_propagate:
        print("  No records to propagate.")

    print(f"{'=' * 64}\n")
