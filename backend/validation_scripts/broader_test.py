"""
Broader test: run the refinement across many more objects, and summarize
the distribution of coarse-vs-refined differences to sanity-check the
mechanism at scale before wiring it into the main pipeline.
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path
from refine_closest_approach import refine_closest_approach

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/ (one level up from validation_scripts/)
CACHE_DIR = BASE_DIR / ".cache"

tle_records = json.loads((CACHE_DIR / "tle_raw.json").read_text())
tle_by_id = {str(r["NORAD_CAT_ID"]): r for r in tle_records}

df = pd.read_parquet(CACHE_DIR / "propagated_features.parquet")
df["NORAD_CAT_ID"] = df["NORAD_CAT_ID"].astype(str)
obj = df.drop_duplicates(subset="NORAD_CAT_ID").copy()
obj = obj.dropna(subset=["nearest_approach", "nearest_approach_step", "nearest_approach_partner"])

# Test on the 30 closest-approach objects -- the ones that matter most for risk
obj = obj.sort_values("nearest_approach").head(30)

results = []
skipped = 0
for _, row in obj.iterrows():
    norad_a = row["NORAD_CAT_ID"]
    norad_b = str(int(row["nearest_approach_partner"]))
    coarse_step = int(row["nearest_approach_step"])
    coarse_dist = float(row["nearest_approach"])

    if norad_a not in tle_by_id or norad_b not in tle_by_id:
        skipped += 1
        continue
    tle_a = tle_by_id[norad_a]
    tle_b = tle_by_id[norad_b]
    if not tle_a.get("TLE_LINE1") or not tle_b.get("TLE_LINE1"):
        skipped += 1
        continue

    step_rows = df[(df["NORAD_CAT_ID"] == norad_a) & (df["step"] == coarse_step)]
    if len(step_rows) == 0:
        skipped += 1
        continue
    coarse_time = pd.to_datetime(step_rows.iloc[0]["timestamp"]).to_pydatetime()

    result = refine_closest_approach(
        tle_a["TLE_LINE1"], tle_a["TLE_LINE2"],
        tle_b["TLE_LINE1"], tle_b["TLE_LINE2"],
        coarse_time,
    )
    if result is None:
        skipped += 1
        continue

    delta = coarse_dist - result["refined_min_distance_km"]
    results.append({
        "norad_a": norad_a, "norad_b": norad_b,
        "coarse_km": coarse_dist,
        "refined_km": result["refined_min_distance_km"],
        "delta_km": delta,
    })

print(f"Tested {len(results)} objects, skipped {skipped}")
print()

deltas = np.array([r["delta_km"] for r in results])
print(f"Delta (coarse - refined) stats:")
print(f"  min:    {deltas.min():.4f} km")
print(f"  max:    {deltas.max():.4f} km")
print(f"  mean:   {deltas.mean():.4f} km")
print(f"  median: {np.median(deltas):.4f} km")
print()
print(f"Objects where refined > coarse (should be RARE/none -- would indicate a bug):")
bad = [r for r in results if r["delta_km"] < -0.001]
print(f"  count: {len(bad)}")
for r in bad[:5]:
    print(f"    {r['norad_a']} vs {r['norad_b']}: coarse={r['coarse_km']:.4f} refined={r['refined_km']:.4f} delta={r['delta_km']:.4f}")

print()
print(f"Objects with meaningful refinement (>0.01 km improvement):")
meaningful = [r for r in results if r["delta_km"] > 0.01]
print(f"  count: {len(meaningful)} out of {len(results)}")
