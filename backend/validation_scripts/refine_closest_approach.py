"""
Refined closest-approach calculation via direct SGP4 re-propagation at
fine time resolution, for high-risk objects. Addresses the professor's
request to compare 5-minute-cadence sampling against a direct integration
to the true time of closest approach.

Run standalone to test against real cached TLE + parquet data before
wiring into the main pipeline: python3 refine_closest_approach.py
"""
import json
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
from sgp4.api import Satrec, jday

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/ (one level up from validation_scripts/)
CACHE_DIR = BASE_DIR / ".cache"

# Fine-resolution window parameters
COARSE_STEP_MINUTES = 5.0
REFINE_WINDOW_MINUTES = 10.0  # window centered on the coarse minimum: +/- one coarse step
REFINE_STEP_SECONDS = 1.0     # fine resolution within that window


def _build_jd_arrays_fine(t0, window_minutes, step_seconds):
    """Same approach as data_pipeline.py's _build_jd_arrays, but for a
    short window at second-level resolution."""
    n_steps = int((window_minutes * 60) / step_seconds) + 1
    jd_arr = np.empty(n_steps, dtype=np.float64)
    fr_arr = np.empty(n_steps, dtype=np.float64)
    timestamps = []
    for i in range(n_steps):
        t = t0 + timedelta(seconds=i * step_seconds)
        jd_arr[i], fr_arr[i] = jday(
            t.year, t.month, t.day, t.hour, t.minute,
            t.second + t.microsecond / 1e6,
        )
        timestamps.append(t)
    return jd_arr, fr_arr, timestamps


def _propagate_fine(line1, line2, jd_arr, fr_arr):
    """Propagate a single object across a fine-resolution jd/fr array."""
    sat = Satrec.twoline2rv(line1, line2)
    e, r, v = sat.sgp4_array(jd_arr, fr_arr)
    r = np.asarray(r, dtype=np.float64)
    mask = np.asarray(e) != 0
    r[mask] = np.nan
    return r


def refine_closest_approach(tle_line1_a, tle_line2_a, tle_line1_b, tle_line2_b,
                             coarse_min_time,
                             window_minutes=REFINE_WINDOW_MINUTES,
                             step_seconds=REFINE_STEP_SECONDS):
    """
    Given two objects' TLE lines and the coarse (5-min-resolution) time at
    which their minimum distance was observed, re-propagate both objects
    at fine (default 1-second) resolution across a window centered on that
    coarse time, and find the true minimum distance and its exact time.

    Returns dict with refined_min_distance_km, refined_time, and
    coarse_vs_refined_delta_km (how much the estimate changed).
    """
    window_start = coarse_min_time - timedelta(minutes=window_minutes / 2)
    jd_arr, fr_arr, timestamps = _build_jd_arrays_fine(window_start, window_minutes, step_seconds)

    r_a = _propagate_fine(tle_line1_a, tle_line2_a, jd_arr, fr_arr)
    r_b = _propagate_fine(tle_line1_b, tle_line2_b, jd_arr, fr_arr)

    dist = np.linalg.norm(r_a - r_b, axis=1)
    valid = ~np.isnan(dist)
    if not valid.any():
        return None

    min_idx = np.nanargmin(dist)
    return {
        "refined_min_distance_km": float(dist[min_idx]),
        "refined_time": timestamps[min_idx].isoformat(),
        "window_start": window_start.isoformat(),
        "window_end": (window_start + timedelta(minutes=window_minutes)).isoformat(),
    }


if __name__ == "__main__":
    # ---- Standalone test against real cached data ----
    import pandas as pd

    tle_path = CACHE_DIR / "tle_raw.json"
    parquet_path = CACHE_DIR / "propagated_features.parquet"

    if not tle_path.exists() or not parquet_path.exists():
        print("ERROR: need cached tle_raw.json and propagated_features.parquet -- run the pipeline first")
        exit(1)

    tle_records = json.loads(tle_path.read_text())
    tle_by_id = {str(r["NORAD_CAT_ID"]): r for r in tle_records}

    df = pd.read_parquet(parquet_path)
    df["NORAD_CAT_ID"] = df["NORAD_CAT_ID"].astype(str)
    obj = df.drop_duplicates(subset="NORAD_CAT_ID").copy()
    obj = obj.dropna(subset=["nearest_approach", "nearest_approach_step", "nearest_approach_partner"])
    obj = obj.sort_values("nearest_approach").head(3)  # test on the 3 closest-approach objects

    for _, row in obj.iterrows():
        norad_a = row["NORAD_CAT_ID"]
        norad_b = str(int(row["nearest_approach_partner"]))
        coarse_step = int(row["nearest_approach_step"])
        coarse_dist = float(row["nearest_approach"])

        if norad_a not in tle_by_id or norad_b not in tle_by_id:
            print(f"Skipping {norad_a} -- missing TLE for self or partner {norad_b}")
            continue

        tle_a = tle_by_id[norad_a]
        tle_b = tle_by_id[norad_b]

        if not tle_a.get("TLE_LINE1") or not tle_b.get("TLE_LINE1"):
            print(f"Skipping {norad_a} -- missing TLE lines")
            continue

        # Reconstruct the approximate coarse minimum's real timestamp.
        # We don't have t0 stored directly here, so approximate using the
        # object's own timestamp column at that step if available.
        step_rows = df[(df["NORAD_CAT_ID"] == norad_a) & (df["step"] == coarse_step)]
        if len(step_rows) == 0:
            print(f"Skipping {norad_a} -- no timestamp row for step {coarse_step}")
            continue
        coarse_time = pd.to_datetime(step_rows.iloc[0]["timestamp"]).to_pydatetime()

        print(f"\nObject {norad_a} vs partner {norad_b}")
        print(f"  Coarse (5-min) minimum distance: {coarse_dist:.4f} km at {coarse_time.isoformat()}")

        result = refine_closest_approach(
            tle_a["TLE_LINE1"], tle_a["TLE_LINE2"],
            tle_b["TLE_LINE1"], tle_b["TLE_LINE2"],
            coarse_time,
        )

        if result is None:
            print("  Refinement failed (no valid propagation)")
            continue

        delta = coarse_dist - result["refined_min_distance_km"]
        print(f"  Refined minimum distance:        {result['refined_min_distance_km']:.4f} km at {result['refined_time']}")
        print(f"  Difference (coarse - refined):    {delta:+.4f} km")
