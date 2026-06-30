/**
 * API Client
 * Axios instance configured to communicate with the backend server.
 */

import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5001/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60s — some queries (risk scoring) are heavy
  headers: {
    "Content-Type": "application/json",
  },
});

// Response interceptor for error logging
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("[API]", error.response?.status, error.message);
    return Promise.reject(error);
  }
);

/**
 * Fetch all debris data (grouped by catalog)
 */
export async function fetchDebrisData(options = {}) {
  const params = {};
  if (options.catalog) params.catalog = options.catalog;
  if (options.refresh) params.refresh = "true";

  const response = await apiClient.get("/debris", { params });
  return response.data;
}

/**
 * Fetch trajectory for a single object
 */
export async function fetchTrajectory(noradId, options = {}) {
  const params = {};
  if (options.interval) params.interval = options.interval;
  if (options.duration) params.duration = options.duration;

  const response = await apiClient.get(`/propagate/${noradId}`, { params });
  return response.data;
}

/**
 * Fetch risk-scored objects
 */
export async function fetchRisks(options = {}) {
  const params = {};
  if (options.limit) params.limit = options.limit;
  if (options.minRisk) params.minRisk = options.minRisk;

  const response = await apiClient.get("/risks", { params });
  return response.data;
}

/**
 * Health check
 */
export async function checkHealth() {
  const response = await apiClient.get("/health");
  return response.data;
}

export default apiClient;
