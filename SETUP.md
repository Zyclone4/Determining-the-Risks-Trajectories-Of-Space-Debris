# Setup Instructions

## Prerequisites

- Python 3.12
- Node.js and npm
- A Space-Track.org account (for live TLE data — optional, the pipeline
  falls back to mock data if credentials aren't set)

## 1. Environment Setup

```bash
cd ~/Documents/SpaceDebris
brew install python@3.12
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Terminal 1 — Data Pipeline & Model Training

```bash
cd ~/Documents/SpaceDebris/backend
python3 data_pipeline.py --propagate --force
python3 train_model.py
```

This fetches/generates orbital data, runs SGP4 propagation, builds the
feature dataset, and trains the risk-scoring model. Re-run this whenever
you want fresh data or a retrained model.

## 3. Terminal 2 — Backend API Server

```bash
cd ~/Documents/SpaceDebris/backend
lsof -ti:8000 | xargs kill -9   # clears anything already using port 8000
python3 train_model.py --serve
```

Leave this terminal running. Confirm it started correctly — you should see:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Important:** always launch with `python3 train_model.py --serve`, not a
bare `uvicorn train_model:app` command. The FastAPI app is built inside a
`create_app()` function rather than as a module-level variable, so `uvicorn`
can't find it directly unless you use `uvicorn train_model:create_app
--factory`. The `--serve` flag handles this correctly already.

If the dashboard ever shows stale-looking data after a fix or retrain, check
that no old server process is still holding port 8000 — run
`lsof -ti:8000` to check, and kill it before restarting.

## 4. Terminal 3 — Frontend

```bash
cd ~/Documents/SpaceDebris/frontend
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`) to view the
dashboard.

## Verifying It's Working

With Terminal 2 running, confirm the API responds:

```bash
curl -s "http://localhost:8000/api/health"
```

You should get back `{"status": "ok", "objects": <count>}`.
