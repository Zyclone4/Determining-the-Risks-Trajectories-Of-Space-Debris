/**
 * API Client — Axios instance for backend + diagnostics endpoints
 */
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const DIAG_BASE = import.meta.env.VITE_DIAG_URL || "http://localhost:8000";

const api = axios.create({ baseURL: API_BASE, timeout: 60000, headers: { "Content-Type": "application/json" } });
const diagApi = axios.create({ baseURL: DIAG_BASE, timeout: 10000 });

api.interceptors.response.use(r => r, err => { console.error("[API]", err.response?.status, err.message); return Promise.reject(err); });

/** Fetch all debris/satellite TLE data grouped by catalog */
export async function fetchDebrisData(opts = {}) {
  const params = {};
  if (opts.catalog) params.catalog = opts.catalog;
  if (opts.refresh) params.refresh = "true";
  if (opts.startTime) params.start_time = opts.startTime; // Pass timeframe timestamp
  return (await api.get("/debris", { params })).data;
}

/** Fetch trajectory for a single object */
export async function fetchTrajectory(noradId, opts = {}) {
  const params = {};
  if (opts.interval) params.interval = opts.interval;
  if (opts.duration) params.duration = opts.duration;
  return (await api.get(`/propagate/${noradId}`, { params })).data;
}

/** Fetch risk-scored objects */
export async function fetchRisks(opts = {}) {
  const params = {};
  if (opts.limit) params.limit = opts.limit;
  if (opts.minRisk) params.minRisk = opts.minRisk;
  if (opts.startTime) params.start_time = opts.startTime; // Pass timeframe timestamp
  return (await api.get("/risks", { params })).data;
}

/** Health check */
export async function checkHealth() {
  return (await api.get("/health")).data;
}

/** Fetch model diagnostics (GRU / RF) from FastAPI */
export async function fetchModelDiagnostics() {
  try {
    return (await diagApi.get("/model-diagnostics")).data;
  } catch {
    return null;
  }
}

export default api;