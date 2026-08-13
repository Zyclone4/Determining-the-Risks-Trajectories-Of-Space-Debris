"""
Edge-case check: verify the refined minimum isn't landing at the very edge
of our search window (which would mean the window might be too narrow and
the TRUE minimum could lie just outside it).
"""
import json
import numpy as np
import pandas as pd
from datetime import timedelta
from pathlib import Path
from refine_closest_approach import refine_closest_approach, REFINE_WINDOW_MINUTES

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/ (one level up from validation_scripts/)
CACHE_DIR = BASE_DIR / ".cache"

tle_records = json.loads((CACHE_DIR / "tle_raw.json").read_text())
tle_by_id = {str(r["NORAD_CAT_ID"]): r for r in tle_records}

df = pd.read_parquet(CACHE_DIR / "propagated_features.parquet")
df["NORAD_CAT_ID"] = df["NORAD_CAT_ID"].astype(str)
obj = df.drop_duplicates(subset="NORAD_CAT_ID").copy()
obj = obj.dropna(subset=["nearest_approach", "nearest_approach_step", "nearest_approach_partner"])
obj = obj.sort_values("nearest_approach").head(30)

near_edge_count = 0
for _, row in obj.iterrows():
    norad_a = row["NORAD_CAT_ID"]
    norad_b = str(int(row["nearest_approach_partner"]))
    coarse_step = int(row["nearest_approach_step"])

    if norad_a not in tle_by_id or norad_b not in tle_by_id:
        continue
    tle_a = tle_by_id[norad_a]
    tle_b = tle_by_id[norad_b]
    if not tle_a.get("TLE_LINE1") or not tle_b.get("TLE_LINE1"):
        continue

    step_rows = df[(df["NORAD_CAT_ID"] == norad_a) & (df["step"] == coarse_step)]
    if len(step_rows) == 0:
        continue
    coarse_time = pd.to_datetime(step_rows.iloc[0]["timestamp"]).to_pydatetime()

    result = refine_closest_approach(
        tle_a["TLE_LINE1"], tle_a["TLE_LINE2"],
        tle_b["TLE_LINE1"], tle_b["TLE_LINE2"],
        coarse_time,
    )
    if result is None:
        continue

    window_start = pd.to_datetime(result["window_start"])
    window_end = pd.to_datetime(result["window_end"])
    refined_time = pd.to_datetime(result["refined_time"])

    # How close (in seconds) is the refined minimum to either edge of the window?
    dist_from_start = (refined_time - window_start).total_seconds()
    dist_from_end = (window_end - refined_time).total_seconds()
    closest_edge = min(dist_from_start, dist_from_end)

    flag = ""
    if closest_edge < 30:  # within 30 seconds of a window edge
        flag = "  <-- NEAR EDGE, window may be too narrow"
        near_edge_count += 1

    print(f"{norad_a} vs {norad_b}: refined at {refined_time.time()}, "
          f"{closest_edge:.0f}s from nearest window edge{flag}")

print()
print(f"Total near-edge cases (within 30s of window boundary): {near_edge_count} / {len(obj)}")
