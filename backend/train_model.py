#!/usr/bin/env python3
"""
train_model.py — GRU / RandomForest training pipeline + FastAPI diagnostics

Pipeline:
  Step 1: Train GRU (PyTorch GRU + Linear, FastAI Learner, MSE, MAE)
           → compliance check (MSE ≤ 0.05 OR MAE ≤ 0.05)
  Step 2: If GRU fails → construct Critical / Watch / Safe labels
  Step 3: Train RandomForest classifier as fallback
  Step 4: Save winning model + model_meta.json + diagnostics.json
  Step 5: FastAPI  GET /model-diagnostics

Usage:
    python3 train_model.py                   # Run full training pipeline
    python3 train_model.py --serve           # Start diagnostics API (port 8000)
    python3 train_model.py --serve --port N  # Custom port
"""

# ── Stdlib ─────────────────────────────────────────────────────────────────────

import json
import logging
import math
import pickle
import sys
import time as _time
from pathlib import Path

# ── Science ────────────────────────────────────────────────────────────────────

import numpy as np
import pandas as pd

# ── PyTorch ────────────────────────────────────────────────────────────────────

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

# ── FastAI ─────────────────────────────────────────────────────────────────────

from fastai.data.core import DataLoaders
from fastai.learner import Learner
from fastai.callback.core import Callback
from fastai.callback.schedule import fit_one_cycle  # patches Learner
from fastai.metrics import mae as fastai_mae

# ── scikit-learn ───────────────────────────────────────────────────────────────

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_recall_fscore_support

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

# ── Paths ──────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / ".cache"
PARQUET_INPUT = CACHE_DIR / "propagated_features.parquet"
SPLITS_DIR = CACHE_DIR / "splits"
MODEL_DIR = CACHE_DIR / "models"

EARTH_RADIUS_KM = 6371.0

# ── Risk Score Formula ─────────────────────────────────────────────────────────
#
#   risk = w1·exp(-approach/τ₁) + w2·σ(density; μ,s) + w3·tanh(decay/τ₃) + ε
#
#   Component 1 (50%): Exponential penalty — approaches below τ₁ km are dangerous
#   Component 2 (30%): Sigmoid activation — congested shells compound collision odds
#   Component 3 (20%): Tanh saturation — high BSTAR signals rapid orbital decay

W_APPROACH = 0.50
W_DENSITY = 0.30
W_DECAY = 0.20

APPROACH_SCALE = 50.0       # τ₁  km — characteristic danger distance
DENSITY_MIDPOINT = 100.0    # μ   objects — sigmoid inflection point
DENSITY_STEEPNESS = 50.0    # s   objects — sigmoid width
DECAY_SCALE = 0.005         # τ₃  BSTAR units — saturation threshold
NOISE_STD = 0.02            # ε   std — gaussian perturbation for realism

# ── Split Ratios ───────────────────────────────────────────────────────────────

TRAIN_RATIO = 0.70
VAL_RATIO = 0.15
TEST_RATIO = 0.15
RANDOM_SEED = 42

# ── GRU Hyper-parameters ──────────────────────────────────────────────────────

GRU_FEATURES = ["X", "Y", "Z", "VX", "VY", "VZ", "altitude"]
GRU_INPUT_SIZE = len(GRU_FEATURES)
GRU_HIDDEN = 64
GRU_LAYERS = 2
GRU_DROPOUT = 0.2
GRU_EPOCHS = 30
GRU_LR = 1e-3
GRU_BS = 32

GRU_MSE_THR = 0.05
GRU_MAE_THR = 0.05

# ── Random Forest ──────────────────────────────────────────────────────────────

RF_FEATURES = [
    "perigee_alt_km", "apogee_alt_km", "inclination_deg",
    "rel_velocity_km_s", "shell_density", "eccentricity",
]
RF_PRECISION_THR = 0.85
RF_RECALL_THR = 0.80
RF_F1_THR = 0.82

# Force CPU to avoid MPS↔CPU tensor mismatches on Apple Silicon
DEVICE = torch.device("cpu")


# ═══════════════════════════════════════════════════════════════════════════════
# Data Loading
# ═══════════════════════════════════════════════════════════════════════════════

def load_dataset(path=None):
    path = Path(path) if path else PARQUET_INPUT
    if not path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {path}. "
            "Run: python3 data_pipeline.py --propagate"
        )

    logger.info("Loading dataset from %s", path.name)
    df = pd.read_parquet(path, engine="pyarrow")
    n_obj = df["NORAD_CAT_ID"].nunique()
    n_steps = df["step"].max() + 1
    logger.info("Loaded %s rows  (%d objects × %d steps × %d cols)",
                f"{len(df):,}", n_obj, n_steps, len(df.columns))
    return df


# ═══════════════════════════════════════════════════════════════════════════════
# Synthetic Ground Truth
# ═══════════════════════════════════════════════════════════════════════════════

def generate_risk_score(df, seed=RANDOM_SEED):
    """
    Produce a continuous risk label in [0, 1] using three non-linear
    components weighted to penalize close approaches, orbital congestion,
    and atmospheric drag.
    """
    rng = np.random.default_rng(seed)

    approach = df["nearest_approach"].values.astype(np.float64)
    density = df["shell_density"].values.astype(np.float64)
    decay = df["decay_rate"].values.astype(np.float64)

    approach_risk = np.exp(-approach / APPROACH_SCALE)

    density_risk = 1.0 / (1.0 + np.exp(
        -(density - DENSITY_MIDPOINT) / DENSITY_STEEPNESS
    ))

    decay_risk = np.tanh(decay / DECAY_SCALE)

    risk = (W_APPROACH * approach_risk +
            W_DENSITY * density_risk +
            W_DECAY * decay_risk)

    risk += rng.normal(0.0, NOISE_STD, size=len(risk))

    return np.clip(risk, 0.0, 1.0)


# ═══════════════════════════════════════════════════════════════════════════════
# Object-Based Splitting
# ═══════════════════════════════════════════════════════════════════════════════

def split_by_object(df, train_ratio=TRAIN_RATIO, val_ratio=VAL_RATIO,
                    test_ratio=TEST_RATIO, seed=RANDOM_SEED):
    """
    Partition the DataFrame into Train / Val / Test sets by shuffling
    unique NORAD_CAT_IDs so that all time steps for a given object stay
    in the same split — preventing sequential data leakage.
    """
    rng = np.random.default_rng(seed)

    unique_ids = df["NORAD_CAT_ID"].unique().copy()
    n_total = len(unique_ids)
    rng.shuffle(unique_ids)

    n_train = int(train_ratio * n_total)
    n_val = int(val_ratio * n_total)

    train_ids = set(unique_ids[:n_train])
    val_ids = set(unique_ids[n_train:n_train + n_val])
    test_ids = set(unique_ids[n_train + n_val:])

    logger.info(
        "Object split: %d total → %d train (%.1f%%) / %d val (%.1f%%) / %d test (%.1f%%)",
        n_total,
        len(train_ids), len(train_ids) / n_total * 100,
        len(val_ids), len(val_ids) / n_total * 100,
        len(test_ids), len(test_ids) / n_total * 100,
    )

    train_df = df[df["NORAD_CAT_ID"].isin(train_ids)].copy()
    val_df = df[df["NORAD_CAT_ID"].isin(val_ids)].copy()
    test_df = df[df["NORAD_CAT_ID"].isin(test_ids)].copy()

    logger.info("Row counts: train=%s  val=%s  test=%s",
                f"{len(train_df):,}", f"{len(val_df):,}", f"{len(test_df):,}")

    return train_df, val_df, test_df


# ═══════════════════════════════════════════════════════════════════════════════
# Persistence
# ═══════════════════════════════════════════════════════════════════════════════

def save_splits(train_df, val_df, test_df, output_dir=None):
    output_dir = Path(output_dir) if output_dir else SPLITS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    for name, sdf in [("train", train_df), ("val", val_df), ("test", test_df)]:
        path = output_dir / f"{name}.parquet"
        sdf.to_parquet(path, engine="pyarrow", compression="snappy", index=False)
        size_mb = path.stat().st_size / (1024 * 1024)
        logger.info("Wrote %s: %s rows (%.2f MB)", path.name, f"{len(sdf):,}", size_mb)


# ═══════════════════════════════════════════════════════════════════════════════
# Dataset Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

def prepare_dataset(parquet_path=None, seed=RANDOM_SEED):
    df = load_dataset(parquet_path)

    logger.info("Generating synthetic ground-truth risk scores...")
    df["risk_score"] = generate_risk_score(df, seed=seed)

    logger.info("Splitting by NORAD_CAT_ID (%.0f / %.0f / %.0f)...",
                TRAIN_RATIO * 100, VAL_RATIO * 100, TEST_RATIO * 100)
    train_df, val_df, test_df = split_by_object(df, seed=seed)

    save_splits(train_df, val_df, test_df)

    return train_df, val_df, test_df


# ═══════════════════════════════════════════════════════════════════════════════
# GRU Architecture  (PyTorch GRU + Linear layer)
# ═══════════════════════════════════════════════════════════════════════════════

class DebrisRiskGRU(nn.Module):
    """GRU encoder → Linear head.  Predicts per-step risk score."""

    def __init__(self, input_size=GRU_INPUT_SIZE, hidden_size=GRU_HIDDEN,
                 num_layers=GRU_LAYERS, dropout=GRU_DROPOUT):
        super().__init__()
        self.gru = nn.GRU(
            input_size, hidden_size, num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.fc = nn.Linear(hidden_size, 1)

    def forward(self, x):
        out, _ = self.gru(x)          # (B, T, H)
        return self.fc(out).squeeze(-1)  # (B, T)


class _SequenceDataset(Dataset):
    """Convert a time-series DataFrame into per-object (features, target) tensors."""

    def __init__(self, df, feature_cols=None, target_col="risk_score"):
        feature_cols = feature_cols or GRU_FEATURES
        ids = df["NORAD_CAT_ID"].unique()
        self.X, self.y = [], []
        for nid in ids:
            obj = df[df["NORAD_CAT_ID"] == nid].sort_values("step")
            feats = np.nan_to_num(obj[feature_cols].values, nan=0.0).astype(np.float32)
            tgt = np.nan_to_num(obj[target_col].values, nan=0.0).astype(np.float32)
            self.X.append(torch.from_numpy(feats))
            self.y.append(torch.from_numpy(tgt))

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


class _EpochTracker(Callback):
    """Record per-epoch train / val / test MSE for diagnostics curves."""
    order = 65

    def __init__(self, test_dl=None):
        super().__init__()
        self._test_dl = test_dl

    def before_fit(self):
        self.train_curve, self.val_curve, self.test_curve = [], [], []
        self._batch_losses = []

    def after_batch(self):
        if self.training:
            self._batch_losses.append(float(self.loss))

    def after_epoch(self):
        # Average training MSE this epoch
        if self._batch_losses:
            self.train_curve.append(
                sum(self._batch_losses) / len(self._batch_losses)
            )
            self._batch_losses = []
        # Validation MSE (first value in recorder.values row)
        if self.recorder.values:
            self.val_curve.append(float(self.recorder.values[-1][0]))
        # Test MSE (diagnostic only — not used for training decisions)
        if self._test_dl is not None:
            self.test_curve.append(_eval_mse(self.model, self._test_dl))


def _eval_mse(model, dl):
    """Forward-pass MSE over an entire DataLoader."""
    dev = next(model.parameters()).device
    was_training = model.training
    model.eval()
    total, count = 0.0, 0
    with torch.no_grad():
        for xb, yb in dl:
            xb, yb = xb.to(dev), yb.to(dev)
            pred = model(xb)
            total += F.mse_loss(pred, yb, reduction="sum").item()
            count += yb.numel()
    if was_training:
        model.train()
    return total / max(count, 1)


def _normalize_datasets(train_ds, *other):
    """Z-score normalise using training statistics only."""
    stacked = torch.stack(train_ds.X)              # (N, T, F)
    mean = stacked.mean(dim=(0, 1))                # (F,)
    std = stacked.std(dim=(0, 1))                  # (F,)
    std[std < 1e-8] = 1.0
    for ds in (train_ds, *other):
        for i in range(len(ds.X)):
            ds.X[i] = (ds.X[i] - mean) / std
    return mean, std


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1 — GRU Training  (FastAI Learner, MSE loss, MAE tracked)
# ═══════════════════════════════════════════════════════════════════════════════

def train_gru(train_df, val_df, test_df):
    """Train GRU, evaluate on test set, return results dict."""
    logger.info("Building GRU sequence datasets...")
    train_ds = _SequenceDataset(train_df)
    val_ds = _SequenceDataset(val_df)
    test_ds = _SequenceDataset(test_df)

    logger.info("Normalising features (Z-score from train)...")
    _normalize_datasets(train_ds, val_ds, test_ds)

    train_dl = DataLoader(train_ds, batch_size=GRU_BS, shuffle=True)
    val_dl = DataLoader(val_ds, batch_size=GRU_BS * 2, shuffle=False)
    test_dl = DataLoader(test_ds, batch_size=GRU_BS * 2, shuffle=False)

    model = DebrisRiskGRU().to(DEVICE)
    dls = DataLoaders(train_dl, val_dl, device=DEVICE)

    tracker = _EpochTracker(test_dl=test_dl)
    learn = Learner(
        dls, model,
        loss_func=nn.MSELoss(),
        metrics=[fastai_mae],
        cbs=[tracker],
    )

    logger.info("Training GRU — %d epochs, lr=%.4f, bs=%d",
                GRU_EPOCHS, GRU_LR, GRU_BS)
    t0 = _time.perf_counter()
    learn.fit_one_cycle(GRU_EPOCHS, lr_max=GRU_LR)
    elapsed = _time.perf_counter() - t0
    logger.info("GRU training completed in %.1fs", elapsed)

    # ── Final test evaluation ──────────────────────────────────────────────────
    # FastAI may silently move model to MPS on Apple Silicon — bring it back
    model = model.cpu()
    model.eval()
    all_p, all_t = [], []
    with torch.no_grad():
        for xb, yb in test_dl:
            all_p.append(model(xb))
            all_t.append(yb)
    preds = torch.cat(all_p)
    targs = torch.cat(all_t)
    test_mse = F.mse_loss(preds, targs).item()
    test_mae = F.l1_loss(preds, targs).item()

    mse_passed = test_mse <= GRU_MSE_THR
    mae_passed = test_mae <= GRU_MAE_THR
    passed = mse_passed or mae_passed

    logger.info(
        "GRU test  MSE=%.6f (%s ≤ %.2f)  MAE=%.6f (%s ≤ %.2f)  → %s",
        test_mse, "PASS" if mse_passed else "FAIL", GRU_MSE_THR,
        test_mae, "PASS" if mae_passed else "FAIL", GRU_MAE_THR,
        "COMPLIANCE PASSED" if passed else "COMPLIANCE FAILED",
    )

    # Save weights
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), MODEL_DIR / "best_model.pth")
    logger.info("Saved GRU weights → %s", MODEL_DIR / "best_model.pth")

    return {
        "model": model,
        "mse": test_mse,
        "mae": test_mae,
        "mse_passed": mse_passed,
        "mae_passed": mae_passed,
        "passed": passed,
        "train_curve": tracker.train_curve,
        "val_curve": tracker.val_curve,
        "test_curve": tracker.test_curve,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Label Construction (raw orbital features → Critical/Watch/Safe)
# ═══════════════════════════════════════════════════════════════════════════════

def extract_rf_features(df):
    """Derive 6 per-object orbital features from time-series data."""
    records = []
    for nid, obj in df.groupby("NORAD_CAT_ID"):
        alt = obj["altitude"].values
        perigee = float(np.nanmin(alt))
        apogee = float(np.nanmax(alt))

        # Skip objects with clearly invalid propagation
        if perigee < -1000:
            continue

        # Mean orbital speed
        speed = np.sqrt(
            obj["VX"].values ** 2 +
            obj["VY"].values ** 2 +
            obj["VZ"].values ** 2
        )
        rel_velocity = float(np.nanmean(speed))

        # Orbital inclination from angular momentum  h = r × v
        r = obj[["X", "Y", "Z"]].values
        v = obj[["VX", "VY", "VZ"]].values
        valid = ~np.any(np.isnan(r) | np.isnan(v), axis=1)
        if not valid.any():
            continue
        mid = np.where(valid)[0][len(np.where(valid)[0]) // 2]
        h = np.cross(r[mid], v[mid])
        h_mag = np.linalg.norm(h)
        inc = float(np.degrees(
            np.arccos(np.clip(h[2] / (h_mag + 1e-10), -1, 1))
        ))

        # Eccentricity from orbit geometry
        r_p = perigee + EARTH_RADIUS_KM
        r_a = apogee + EARTH_RADIUS_KM
        ecc = float((r_a - r_p) / (r_a + r_p + 1e-10))

        # Shell density (per-object constant from pipeline)
        sd = int(obj["shell_density"].iloc[0])

        records.append({
            "NORAD_CAT_ID": nid,
            "perigee_alt_km": perigee,
            "apogee_alt_km": apogee,
            "inclination_deg": inc,
            "rel_velocity_km_s": rel_velocity,
            "shell_density": sd,
            "eccentricity": ecc,
        })

    logger.info("Extracted RF features for %d objects", len(records))
    return pd.DataFrame(records)


def construct_labels(feat_df):
    def _label(row):
        if row["perigee_alt_km"] < 400:
            return "Critical"
        if row["perigee_alt_km"] < 650:
            return "Watch"
        return "Safe"

    feat_df = feat_df.copy()
    feat_df["risk_label"] = feat_df.apply(_label, axis=1)

    dist = feat_df["risk_label"].value_counts()
    logger.info("Label distribution:\n%s", dist.to_string())
    return feat_df


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Random Forest Classifier
# ═══════════════════════════════════════════════════════════════════════════════

def train_random_forest(train_feats, test_feats):
    """
    Train RF with class_weight='balanced', track OOB curve,
    evaluate weighted precision / recall / F1, check acceptance.
    """
    X_train = train_feats[RF_FEATURES].values
    y_train = train_feats["risk_label"].values
    X_test = test_feats[RF_FEATURES].values
    y_test = test_feats["risk_label"].values

    logger.info("Training RandomForest (%d train, %d test objects)...",
                len(X_train), len(X_test))

    # ── OOB convergence curve via warm_start ───────────────────────────────────
    tree_checkpoints = [10, 20, 30, 50, 75, 100, 150, 200]
    oob_curve = []
    clf = RandomForestClassifier(
        n_estimators=1, warm_start=True, n_jobs=-1,
        class_weight="balanced", oob_score=True, random_state=RANDOM_SEED,
    )
    for n in tree_checkpoints:
        clf.n_estimators = n
        clf.fit(X_train, y_train)
        oob_err = round(1 - clf.oob_score_, 6)
        oob_curve.append(oob_err)
        logger.info("  trees=%3d  OOB error=%.4f", n, oob_err)

    # ── Test evaluation ────────────────────────────────────────────────────────
    y_pred = clf.predict(X_test)

    prec_w, rec_w, f1_w, _ = precision_recall_fscore_support(
        y_test, y_pred, average="weighted", zero_division=0,
    )

    # Per-class metrics
    class_labels = ["Safe", "Watch", "Critical"]
    per_class = {}
    for cls in class_labels:
        present = (cls in y_test) or (cls in y_pred)
        if present:
            p, r, f, _ = precision_recall_fscore_support(
                y_test, y_pred, labels=[cls], average=None, zero_division=0,
            )
            per_class[cls] = {
                "precision": round(float(p[0]), 4),
                "recall": round(float(r[0]), 4),
                "f1": round(float(f[0]), 4),
            }
        else:
            per_class[cls] = {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    # Feature importances
    importances = {
        feat: round(float(imp), 6)
        for feat, imp in zip(RF_FEATURES, clf.feature_importances_)
    }

    oob_error = round(1 - clf.oob_score_, 6)

    # ── Acceptance (OR logic) ──────────────────────────────────────────────────
    reasons = []
    if prec_w >= RF_PRECISION_THR:
        reasons.append(f"Precision {prec_w:.4f} >= {RF_PRECISION_THR}")
    if rec_w >= RF_RECALL_THR:
        reasons.append(f"Recall {rec_w:.4f} >= {RF_RECALL_THR}")
    if f1_w >= RF_F1_THR:
        reasons.append(f"F1 {f1_w:.4f} >= {RF_F1_THR}")
    accepted = len(reasons) > 0
    acceptance_reason = "; ".join(reasons) if reasons else "All conditions failed"

    logger.info("RF results: P=%.4f R=%.4f F1=%.4f OOB=%.4f → %s",
                prec_w, rec_w, f1_w, oob_error,
                "ACCEPTED" if accepted else "REJECTED")

    # Save model
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    rf_path = MODEL_DIR / "fallback_rf.pkl"
    with open(rf_path, "wb") as f:
        pickle.dump(clf, f)
    logger.info("Saved RF model → %s", rf_path)

    return {
        "model": clf,
        "precision": round(float(prec_w), 6),
        "recall": round(float(rec_w), 6),
        "f1": round(float(f1_w), 6),
        "per_class": per_class,
        "feature_importances": importances,
        "oob_error": oob_error,
        "oob_curve": oob_curve,
        "accepted": accepted,
        "acceptance_reason": acceptance_reason,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4 — Save Winning Model + Metadata
# ═══════════════════════════════════════════════════════════════════════════════

def _save_artifacts(chosen, accepted, acceptance_reason, gru, rf, split_info):
    """Write model_meta.json and diagnostics.json."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    # ── model_meta.json (Step 4 spec) ──────────────────────────────────────────
    meta = {
        "chosen_model": chosen,
        "accepted": accepted,
        "acceptance_reason": acceptance_reason,
        "gru_mse": round(gru["mse"], 6),
        "gru_mae": round(gru["mae"], 6),
        "rf_metrics": None,
    }
    if rf is not None:
        meta["rf_metrics"] = {
            "precision": rf["precision"],
            "recall": rf["recall"],
            "f1": rf["f1"],
            "per_class": rf["per_class"],
            "feature_importances": rf["feature_importances"],
            "oob_error": rf["oob_error"],
            "accepted": rf["accepted"],
            "acceptance_reason": rf["acceptance_reason"],
        }

    meta_path = MODEL_DIR / "model_meta.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    logger.info("Saved model_meta.json → %s", meta_path)

    # ── diagnostics.json (Step 5 API payload) ──────────────────────────────────
    diag = {
        "chosen_model": chosen,
        "accepted": accepted,
        "acceptance_reason": acceptance_reason,
        "gru": {
            "mse": round(gru["mse"], 6),
            "mae": round(gru["mae"], 6),
            "mse_threshold": GRU_MSE_THR,
            "mae_threshold": GRU_MAE_THR,
            "mse_passed": gru["mse_passed"],
            "mae_passed": gru["mae_passed"],
            "train_loss_curve": [round(x, 6) for x in gru["train_curve"]],
            "val_loss_curve": [round(x, 6) for x in gru["val_curve"]],
            "test_loss_curve": [round(x, 6) for x in gru["test_curve"]],
        },
        "rf": None,
        "split": split_info,
    }
    if rf is not None:
        diag["rf"] = {
            "precision": rf["precision"],
            "recall": rf["recall"],
            "f1": rf["f1"],
            "precision_threshold": RF_PRECISION_THR,
            "recall_threshold": RF_RECALL_THR,
            "f1_threshold": RF_F1_THR,
            "precision_passed": rf["precision"] >= RF_PRECISION_THR,
            "recall_passed": rf["recall"] >= RF_RECALL_THR,
            "f1_passed": rf["f1"] >= RF_F1_THR,
            "per_class": rf["per_class"],
            "feature_importances": rf["feature_importances"],
            "oob_error": rf["oob_error"],
            "oob_curve": rf["oob_curve"],
        }

    diag_path = MODEL_DIR / "diagnostics.json"
    with open(diag_path, "w") as f:
        json.dump(diag, f, indent=2)
    logger.info("Saved diagnostics.json → %s", diag_path)

    return diag


# ═══════════════════════════════════════════════════════════════════════════════
# Full Training Pipeline  (Steps 1 → 4)
# ═══════════════════════════════════════════════════════════════════════════════

def run_training_pipeline(parquet_path=None, seed=RANDOM_SEED):
    """Orchestrate: prepare → GRU → compliance → (RF fallback) → save."""

    # ── Dataset preparation ────────────────────────────────────────────────────
    train_df, val_df, test_df = prepare_dataset(parquet_path, seed)

    # Dynamic split sizes (floor-based, from total unique objects)
    total_obj = sum(
        s["NORAD_CAT_ID"].nunique() for s in [train_df, val_df, test_df]
    )
    n_train = math.floor(total_obj * TRAIN_RATIO)
    n_val = math.floor(total_obj * VAL_RATIO)
    n_test = total_obj - n_train - n_val
    split_info = {
        "total": total_obj,
        "train": n_train,
        "val": n_val,
        "test": n_test,
    }
    logger.info("Dynamic split: %d total → %d / %d / %d",
                total_obj, n_train, n_val, n_test)

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 1 — GRU
    # ══════════════════════════════════════════════════════════════════════════
    logger.info("=" * 64)
    logger.info("STEP 1: GRU Training + Compliance Check")
    logger.info("=" * 64)
    gru = train_gru(train_df, val_df, test_df)

    rf = None
    if gru["passed"]:
        # GRU passes compliance — skip Steps 2-3
        chosen = "GRU"
        accepted = True
        reasons = []
        if gru["mse_passed"]:
            reasons.append(f"GRU MSE {gru['mse']:.6f} <= {GRU_MSE_THR}")
        if gru["mae_passed"]:
            reasons.append(f"GRU MAE {gru['mae']:.6f} <= {GRU_MAE_THR}")
        acceptance_reason = "; ".join(reasons)
        logger.info("GRU PASSED compliance — skipping Steps 2-3.")
    else:
        logger.info("GRU FAILED compliance — proceeding to Steps 2-3.")

        # ══════════════════════════════════════════════════════════════════════
        # STEP 2 — Label Construction
        # ══════════════════════════════════════════════════════════════════════
        logger.info("=" * 64)
        logger.info("STEP 2: Label Construction (Critical / Watch / Safe)")
        logger.info("=" * 64)

        # Extract per-object features from ALL splits (shell_density was
        # computed relative to the full pipeline catalog)
        full_df = pd.concat([train_df, val_df, test_df])
        full_feats = extract_rf_features(full_df)
        full_feats = construct_labels(full_feats)

        # Re-split features using the same NORAD ID partition
        train_ids = set(train_df["NORAD_CAT_ID"].unique())
        val_ids = set(val_df["NORAD_CAT_ID"].unique())
        test_ids = set(test_df["NORAD_CAT_ID"].unique())

        train_feats = full_feats[full_feats["NORAD_CAT_ID"].isin(train_ids)]
        val_feats = full_feats[full_feats["NORAD_CAT_ID"].isin(val_ids)]
        test_feats = full_feats[full_feats["NORAD_CAT_ID"].isin(test_ids)]

        logger.info("RF split: %d train / %d val / %d test objects",
                     len(train_feats), len(val_feats), len(test_feats))

        # ══════════════════════════════════════════════════════════════════════
        # STEP 3 — Random Forest
        # ══════════════════════════════════════════════════════════════════════
        logger.info("=" * 64)
        logger.info("STEP 3: Random Forest Classifier")
        logger.info("=" * 64)
        rf = train_random_forest(train_feats, test_feats)

        chosen = "RandomForest"
        accepted = rf["accepted"]
        acceptance_reason = rf["acceptance_reason"]

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 4 — Save
    # ══════════════════════════════════════════════════════════════════════════
    logger.info("=" * 64)
    logger.info("STEP 4: Save Winning Model (%s)", chosen)
    logger.info("=" * 64)

    diag = _save_artifacts(chosen, accepted, acceptance_reason,
                           gru, rf, split_info)
    return diag


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5 — FastAPI  GET /model-diagnostics
# ═══════════════════════════════════════════════════════════════════════════════

def create_app():
    """Build FastAPI application serving model diagnostics."""
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="Space Debris — Model Diagnostics")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def _load_name_map():
        tle_path = CACHE_DIR / "tle_raw.json"
        if not tle_path.exists():
            return {}
        records = json.loads(tle_path.read_text())
        return {int(r["NORAD_CAT_ID"]): r.get("OBJECT_NAME", "UNKNOWN") for r in records}

    @app.get("/model-diagnostics")
    async def model_diagnostics():
        diag_path = MODEL_DIR / "diagnostics.json"
        if not diag_path.exists():
            return {
                "error": "No trained model found. "
                         "Run: python3 train_model.py",
            }
        with open(diag_path) as f:
            return json.load(f)

    @app.get("/api/health")
    async def health():
        df = pd.read_parquet(PARQUET_INPUT)
        return {"status": "ok", "objects": len(df.drop_duplicates(subset="NORAD_CAT_ID"))}

    @app.get("/api/risks")
    async def risks(limit: int = 1000, minRisk: float = 0.0):
        df = pd.read_parquet(PARQUET_INPUT)
        obj = df.drop_duplicates(subset="NORAD_CAT_ID").copy()
        obj = obj.dropna(subset=["min_altitude", "nearest_approach"])
        name_map = _load_name_map()
        scored = []
        for _, row in obj.iterrows():
            norad = int(row["NORAD_CAT_ID"])
            name = name_map.get(norad, "UNKNOWN")
            risk = round(float(row["decay_rate"]) * 100, 4) if not pd.isna(row["decay_rate"]) else 0.0
            if risk < minRisk:
                continue
            if row["min_altitude"] < 400:
                label = "Critical"
            elif row["min_altitude"] < 650:
                label = "Watch"
            else:
                label = "Safe"
            scored.append({
                "noradId": norad,
                "name": name,
                "riskScore": risk,
                "riskLabel": label,
                "perigee": round(float(row["min_altitude"]), 1) if not pd.isna(row["min_altitude"]) else 0.0,
"apogee": round(float(row["min_altitude"]), 1) if not pd.isna(row["min_altitude"]) else 0.0,
"inclination": 0.0,
"shellDensity": int(row["shell_density"]) if not pd.isna(row["shell_density"]) else 0,
"closestApproach": round(float(row["nearest_approach"]), 2) if not pd.isna(row["nearest_approach"]) else 0.0,
                "objectType": "Debris",
                "source": name,
            })
        scored.sort(key=lambda x: x["riskScore"], reverse=True)
        cosmos_count = len([s for s in scored if "COSMOS" in s["name"]])
        iridium_count = len([s for s in scored if "IRIDIUM" in s["name"]])
        return {
            "risks": scored[:limit],
            "total": len(scored),
            "totalDebrisAnalyzed": len(scored),
            "totalSatellitesUsed": 0,
            "resultsReturned": min(limit, len(scored)),
            "cosmos2251Count": cosmos_count,
            "iridium33Count": iridium_count,
        }

    @app.get("/api/debris")
    async def debris():
        df = pd.read_parquet(PARQUET_INPUT)
        obj = df.drop_duplicates(subset="NORAD_CAT_ID").copy()
        obj = obj.dropna(subset=["min_altitude", "nearest_approach"])
        name_map = _load_name_map()
        cosmos_ids = [k for k, v in name_map.items() if "COSMOS" in v]
        iridium_ids = [k for k, v in name_map.items() if "IRIDIUM" in v]
        cosmos = obj[obj["NORAD_CAT_ID"].isin(cosmos_ids)]
        iridium = obj[obj["NORAD_CAT_ID"].isin(iridium_ids)]
        return {
            "summary": {
                "cosmos2251": {"label": "Cosmos 2251 Debris", "count": len(cosmos)},
                "iridium33":  {"label": "Iridium 33 Debris",  "count": len(iridium)},
                "total":      {"label": "Total Objects",       "count": len(obj)},
            },
            "total": len(obj)
        }

    return app
# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def _print_report(result):
    """Pretty-print training pipeline results."""
    print(f"\n{'=' * 70}")
    print(f"  Training Pipeline Complete")
    print(f"{'=' * 70}")
    print(f"  Chosen model:     {result['chosen_model']}")
    print(f"  Accepted:         {result['accepted']}")
    print(f"  Reason:           {result['acceptance_reason']}")

    g = result["gru"]
    print(f"\n  GRU:  MSE={g['mse']:.6f} "
          f"({'✓ PASS' if g['mse_passed'] else '✗ FAIL'} ≤ {g['mse_threshold']})  "
          f"MAE={g['mae']:.6f} "
          f"({'✓ PASS' if g['mae_passed'] else '✗ FAIL'} ≤ {g['mae_threshold']})")
    print(f"        {len(g['train_loss_curve'])} epochs trained")

    rf = result.get("rf")
    if rf is not None:
        print(f"\n  RF:   P={rf['precision']:.4f} "
              f"({'✓' if rf['precision_passed'] else '✗'} ≥ {rf['precision_threshold']})  "
              f"R={rf['recall']:.4f} "
              f"({'✓' if rf['recall_passed'] else '✗'} ≥ {rf['recall_threshold']})  "
              f"F1={rf['f1']:.4f} "
              f"({'✓' if rf['f1_passed'] else '✗'} ≥ {rf['f1_threshold']})")
        print(f"        OOB error={rf['oob_error']:.4f}")
        print(f"\n  Per-class metrics:")
        for cls in ["Safe", "Watch", "Critical"]:
            m = rf["per_class"].get(cls, {})
            if m:
                print(f"    {cls:10s}  P={m['precision']:.4f}  "
                      f"R={m['recall']:.4f}  F1={m['f1']:.4f}")
        print(f"\n  Feature importances:")
        for feat, imp in sorted(rf["feature_importances"].items(),
                                key=lambda x: -x[1]):
            bar = "█" * int(imp * 50)
            print(f"    {feat:25s}  {imp:.4f}  {bar}")

    s = result["split"]
    print(f"\n  Split: {s['total']} total → "
          f"{s['train']} train / {s['val']} val / {s['test']} test")
    print(f"  Artifacts: {MODEL_DIR}/")
    print(f"{'=' * 70}\n")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    if "--serve" in sys.argv:
        # ── Start FastAPI diagnostics server ───────────────────────────────
        port = 8000
        for i, arg in enumerate(sys.argv):
            if arg == "--port" and i + 1 < len(sys.argv):
                port = int(sys.argv[i + 1])
        import uvicorn
        logger.info("Starting diagnostics API on port %d", port)
        app = create_app()
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    else:
        # ── Run full training pipeline ─────────────────────────────────────
        result = run_training_pipeline()
        _print_report(result)
