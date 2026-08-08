"""
Standalone verification script — NOT part of the app yet.
Tests: re-propagate from a custom start time using cached TLEs,
compute features, load the already-trained model, score without retraining.
"""
import sys
sys.path.insert(0, "/Users/nayoonkim/Documents/SuperSafeLLC8/backend")

from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd
import torch

from data_pipeline import (
    load_cache, propagate_all, compute_features, build_and_save_dataset,
    CACHE_DIR,
)
from train_model import DebrisRiskGRU, GRU_FEATURES, MODEL_DIR


def main():
    # ── 1. Load cached TLEs (no re-fetch) ──
    records = load_cache()
    if records is None:
        print("ERROR: no cached TLE data found — run data_pipeline.py first")
        sys.exit(1)
    print(f"Loaded {len(records)} cached TLE records")

    # ── 2. Pick a custom start time (6 hours from now, for a visible difference) ──
    custom_t0 = datetime.now(timezone.utc) + timedelta(hours=6)
    print(f"Re-propagating from custom start time: {custom_t0.isoformat()}")

    # ── 3. Re-propagate + build dataset, saved to a SCOPED path (not the main cache) ──
    live_output_path = CACHE_DIR / "propagated_features_live_test.parquet"
    df = build_and_save_dataset(records, t0=custom_t0, output_path=live_output_path)

    if df is None:
        print("ERROR: propagation/dataset build failed")
        sys.exit(1)
    print(f"Built live dataset: {len(df)} rows, {df['NORAD_CAT_ID'].nunique()} objects")

    # ── 4. Load the already-trained model (no retraining) ──
    model_path = MODEL_DIR / "best_model.pth"
    if not model_path.exists():
        print(f"ERROR: no trained model found at {model_path} — run train_model.py first")
        sys.exit(1)

    model = DebrisRiskGRU()
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()
    print("Loaded trained model weights successfully")

    # ── 5. Score the newly-propagated data with the existing model ──
    all_scores = {}
    with torch.no_grad():
        for nid, obj in df.groupby("NORAD_CAT_ID"):
            if obj["debris_status"].iloc[0] != 1:
                continue
            obj_sorted = obj.sort_values("step")
            feats = np.nan_to_num(obj_sorted[GRU_FEATURES].values, nan=0.0).astype(np.float32)
            x = torch.from_numpy(feats).unsqueeze(0)
            pred = model(x).squeeze(0).numpy()
            all_scores[str(nid)] = float(np.clip(np.max(pred), 0.0, 1.0))

    print(f"\nScored {len(all_scores)} debris objects with the existing model")
    print("\nSample scores (first 5):")
    for nid, score in list(all_scores.items())[:5]:
        print(f"  {nid}: {score:.4f}")

    print("\nSUCCESS — live re-propagation + scoring-only inference works end-to-end")


if __name__ == "__main__":
    main()
