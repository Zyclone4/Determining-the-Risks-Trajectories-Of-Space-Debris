# Determining the Risks & Trajectories of Space Debris

## Overview

As the number of satellites and debris in Earth orbit grows, the risk of
collisions increases. Even small fragments can travel at speeds greater than
7 km/s, capable of causing severe damage to spacecraft and space missions.

This project provides a dashboard that visualizes debris trajectories and
flags high-risk objects, using orbital data pulled from Space-Track,
propagated with SGP4, and scored for collision risk with a trained model.

## Goal

Generate a dashboard that visualizes debris trajectories and marks
high-risk objects using data acquired from Space-Track and processed
through a trained risk-scoring pipeline.

## What It Does

- Pulls current orbital element data (TLEs) for tracked debris and active
  satellites
- Propagates each object's position and velocity forward in time using SGP4
- Computes per-object features: nearest approach distance, minimum
  altitude, orbital shell density, decay rate
- Scores each object's collision risk and categorizes it as Critical,
  Watch, or Safe
- Displays results on an interactive dashboard: a 3D globe view, risk
  breakdowns, and live warning banners for critical-risk objects

## Project Structure

```
SuperSafeLLC2/
├── backend/
│   ├── data_pipeline.py   # Fetches TLE data, runs SGP4 propagation, builds feature dataset
│   ├── train_model.py     # Trains the risk-scoring model and serves the FastAPI backend
│   └── .cache/            # Cached TLE data and propagated feature parquet files
└── frontend/
    └── src/
        └── components/    # React dashboard components (Globe, warning banners, etc.)
```

## Requirements

See `requirements.txt` for Python dependencies. Frontend dependencies are
managed via `npm` — see `frontend/package.json`.

For setup and run instructions, see `SETUP.md`.
