# Commit Documentation

> Note: Due to the accelerated prototype timeline, changes were not committed 
> atomically after each milestone. This document serves as a manual record of 
> the intended commit structure and the changes completed at each milestone.
> Atomic commits will be enforced going forward from the next development cycle.

---

## Backend Pipeline

### Milestone 1 — Space-Track API Ingestion & Caching
**Intended commit message:** `feat: implement Space-Track API ingestion and parquet caching`

Changes:
- Connected to Space-Track.org API using credentials stored in `.env`
- Implemented TLE data ingestion for Cosmos 2251 and Iridium 33 debris clouds
- Added `.env` parsing for API authentication
- Built parquet caching layer to avoid redundant API calls on repeated runs

---

### Milestone 2 — SGP4 Propagation & Feature Engineering
**Intended commit message:** `feat: add SGP4 propagation and vectorized KD-Tree features`

Changes:
- Implemented SGP4 propagation to convert TLE data into position/velocity vectors
- Added multiprocessing to parallelize propagation across all objects
- Built KD-Tree for spatial nearest-neighbor lookup (used for shell density and closest active object computation)
- Computed derived features: perigee/apogee altitude, inclination, relative velocity, shell density, eccentricity

---

### Milestone 3 — Model Training, Compliance Check & RF Fallback
**Intended commit message:** `feat: add GRU compliance check, RF fallback classifier, and model artifact export`

Changes:
- Generated synthetic ground-truth risk scores from raw orbital features using physics-based thresholds:
  - Critical: perigee < 600 km AND shell density > 10
  - Watch: perigee < 800 km OR shell density > 5
  - Safe: all other objects
- Implemented object-based train/val/test split (70/15/15) by NORAD ID to prevent data leakage
- Built GRU compliance check:
  - PASS: Test MSE ≤ 0.05 OR Test MAE ≤ 0.05
  - FAIL: Test MSE > 0.05 AND Test MAE > 0.05
- GRU accepted on prototype dataset (MSE condition satisfied)
- Implemented Random Forest fallback classifier (sklearn) — triggers only if GRU fails both thresholds
  - Inputs: 6 raw orbital features (independent of GRU output)
  - Output: Safe / Watch / Critical label
  - Acceptance: Weighted Precision ≥ 0.85 OR Recall ≥ 0.80 OR F1 ≥ 0.82
  - class_weight="balanced", oob_score=True
- Exported model_meta.json with chosen model, metrics, and acceptance reason
- Saved winning model as best_model.pth (GRU) or fallback_rf.pkl (RF)

---

### Milestone 4 — FastAPI Endpoint
**Intended commit message:** `feat: add FastAPI model-diagnostics endpoint with dynamic split reporting`

Changes:
- Built FastAPI `/model-diagnostics` GET endpoint
- Returns JSON payload consumed by React diagnostics panel:
  - chosen_model, accepted, acceptance_reason
  - GRU metrics: MSE, MAE, pass/fail per metric, train/val/test loss curves
  - RF metrics (null if RF not triggered): Precision, Recall, F1, per-class breakdown, feature importances, OOB error
  - Dynamic split counts (computed from actual objects ingested, not hardcoded)
  - total_objects (actual count after SGP4 ingestion)

---

## Frontend Dashboard

### Frontend Milestone 1 — Header, Timeframe Selector & Stat Cards
**Intended commit message:** `feat: add dashboard header, timeframe selector, and summary stat cards`

Changes:
- Built top navigation bar with live Celestrak update timestamp
- Added timeframe selector (UTC start/end)
- Implemented 5 summary stat cards:
  - Total Cataloged, Active, Debris, Danger (≥ 0.70), Visualizing

---

### Frontend Milestone 2 — 3D Orbital Trajectory Viewer
**Intended commit message:** `feat: add 3D orbital trajectory viewer with toggle controls`

Changes:
- Built interactive 3D globe using Three.js
- Plotted active satellites, debris, and high-risk objects by real orbital position
- Added telemetry layer toggle controls (show/hide object categories)
- Color coded by risk tier: Critical (red), Watch (blue), Safe (green)

---

### Frontend Milestone 3 — Orbit Distribution Charts & Source Groups
**Intended commit message:** `feat: add orbit distribution charts and source group breakdown`

Changes:
- Added orbit distribution bar charts by altitude band
- Built source group breakdown panel (Cosmos 2251 vs. Iridium 33 vs. active satellites)

---

### Frontend Milestone 4 — Model Diagnostics Panels
**Intended commit message:** `feat: add conditional GRU/RF model diagnostics panels`

Changes:
- Built GRUDiagnosticsPanel component:
  - MSE/MAE metric cards with pass/fail status and progress bars
  - OR acceptance logic display box
  - Epoch loss curve (bar chart)
  - 70/15/15 split bar
- Built RFDiagnosticsPanel component (renders only if RF was triggered):
  - Precision/Recall/F1 metric cards with OR acceptance logic
  - Feature importance horizontal bar chart
  - Per-class breakdown table (Safe/Watch/Critical)
  - OOB error curve
  - 70/15/15 split bar
- Both panels consume live data from `/model-diagnostics` endpoint

---

### Frontend Milestone 5 — Tracked Objects Table & Detail View
**Intended commit message:** `feat: add paginated tracked objects table with detail view`

Changes:
- Built searchable, filterable conjunction risk table
- Columns: NORAD ID, Name, Risk Score, Approach Altitude
- Risk pills color-coded by tier (Critical/Watch/Safe)
- Click-to-expand object detail panel showing:
  - Risk score + progress bar, Miss Distance, Relative Velocity,
    Approach Altitude, Inclination, Perigee/Apogee, Min Propagated Altitude,
    Nearest Active Object, Shell Density, Risk Basis

---

### Frontend Milestone 6 — Critical Warning Banner
**Intended commit message:** `feat: add critical warning banner with countdown and detail expansion`

Changes:
- Built CriticalWarningBanner component (triggers for risk score ≥ 0.70 only)
- State 1 (collapsed): scarlet border, countdown timer, View Detail / Dismiss buttons
- State 2 (expanded): full object detail panel with same scarlet border
- Live countdown via setInterval
- onDismiss callback removes banner from view

---

### Frontend Milestone 7 — Responsive Layout
**Intended commit message:** `feat: add responsive sidebar layout for wide viewports`

Changes:
- Added responsive sidebar reflow on window resize
- Sidebar collapses on narrow viewports, expands on wide viewports

---

## Meta

**LLMs used:**
- Anthropic Claude Opus 4.6 (via Antigravity IDE — autonomous pipeline generation and codebase execution)
- Google Gemini (via web interface — prompt optimization and architectural planning)

**Note on commit process:**
Atomic commits were not made in real time during this prototype sprint due to 
the accelerated timeline. This document was created retroactively to preserve 
an accurate record of what was built at each milestone. Going forward, commits 
will be made atomically after each prompt/milestone is verified as working.