/**
 * Express API Routes
 *
 * Endpoints:
 *   GET /api/health        — Health check
 *   GET /api/debris        — Fetch all debris TLE data (grouped by catalog)
 *   GET /api/propagate/:noradId — Propagate a single object's trajectory
 *   GET /api/risks         — Return risk-scored objects
 */

const express = require("express");
const { spaceTrackClient, CATALOG_QUERIES } = require("./spacetrack");
const { propagateObject, getCurrentPosition, propagateBatch } = require("./propagator");
const { computeRiskScores } = require("./risk");

const router = express.Router();

// In-memory cache for TLE data (refreshed on request or after TTL)
let tleCache = null;
let tleCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/health
 * Basic health check
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    catalogs: Object.keys(CATALOG_QUERIES),
  });
});

/**
 * Helper: Fetch and cache all TLE data
 */
async function getCachedTLE() {
  const now = Date.now();
  if (tleCache && now - tleCacheTime < CACHE_TTL_MS) {
    console.log("[Routes] Serving TLE data from cache");
    return tleCache;
  }

  console.log("[Routes] Fetching fresh TLE data from Space-Track...");
  tleCache = await spaceTrackClient.fetchAllCatalogs();
  tleCacheTime = Date.now();
  return tleCache;
}

/**
 * GET /api/debris
 * Returns all debris/satellite TLE data grouped by catalog
 *
 * Query params:
 *   ?catalog=fengyun1c  — Fetch only a specific catalog
 *   ?refresh=true       — Force cache refresh
 */
router.get("/debris", async (req, res) => {
  try {
    const { catalog, refresh } = req.query;

    if (refresh === "true") {
      tleCache = null;
    }

    if (catalog && CATALOG_QUERIES[catalog]) {
      // Fetch single catalog
      const data = await spaceTrackClient.fetchCatalog(catalog);
      return res.json({
        catalog: CATALOG_QUERIES[catalog].label,
        count: data.length,
        data,
      });
    }

    // Fetch all catalogs
    const allData = await getCachedTLE();

    // Build summary
    const summary = {};
    for (const [key, value] of Object.entries(allData)) {
      summary[key] = {
        label: value.label,
        count: value.data ? value.data.length : 0,
        error: value.error || null,
      };
    }

    res.json({ summary, data: allData });
  } catch (error) {
    console.error("[Routes] Error fetching debris data:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/propagate/:noradId
 * Propagate a single object and return its trajectory
 *
 * Query params:
 *   ?interval=5    — Time step in minutes (default: 5)
 *   ?duration=90   — Total window in minutes (default: 90)
 */
router.get("/propagate/:noradId", async (req, res) => {
  try {
    const noradId = req.params.noradId;
    const intervalMinutes = parseInt(req.query.interval) || 5;
    const durationMinutes = parseInt(req.query.duration) || 90;

    // Search all catalogs for this NORAD ID
    const allData = await getCachedTLE();
    let gpRecord = null;

    for (const catalog of Object.values(allData)) {
      if (!catalog.data) continue;
      gpRecord = catalog.data.find(
        (r) => String(r.NORAD_CAT_ID) === String(noradId)
      );
      if (gpRecord) break;
    }

    if (!gpRecord) {
      return res.status(404).json({ error: `Object ${noradId} not found` });
    }

    const trajectory = propagateObject(gpRecord, {
      intervalMinutes,
      durationMinutes,
    });

    res.json(trajectory);
  } catch (error) {
    console.error("[Routes] Propagation error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risks
 * Compute and return risk-scored debris objects
 *
 * Returns top-risk objects across all debris catalogs, scored against active satellites.
 *
 * Query params:
 *   ?limit=50       — Max number of results (default: 50)
 *   ?minRisk=0.1    — Minimum risk score filter (default: 0)
 */
router.get("/risks", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const minRisk = parseFloat(req.query.minRisk) || 0;

    const allData = await getCachedTLE();

    // Propagate active satellites for proximity comparison
    const activeSats = allData.activeSatellites?.data || [];
    console.log(
      `[Routes] Propagating ${activeSats.length} active satellites...`
    );
    const satPositions = propagateBatch(activeSats);

    // Collect all debris from non-satellite catalogs
    const debrisCatalogs = [
      "fengyun1c",
      "cosmos2251",
      "iridium33",
      "analystObjects",
    ];

    let allDebris = [];
    for (const catKey of debrisCatalogs) {
      const catData = allData[catKey]?.data || [];
      const positions = propagateBatch(catData);
      // Tag each with its catalog source
      positions.forEach((p) => (p.catalog = allData[catKey]?.label || catKey));
      allDebris = allDebris.concat(positions);
    }

    console.log(
      `[Routes] Computing risk scores for ${allDebris.length} debris objects against ${satPositions.length} satellites...`
    );

    // Compute risk scores
    const scored = computeRiskScores(allDebris, satPositions);

    // Filter and sort by risk score (descending)
    const filtered = scored
      .filter((obj) => obj.riskScore >= minRisk)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, limit);

    res.json({
      totalDebrisAnalyzed: allDebris.length,
      totalSatellitesUsed: satPositions.length,
      resultsReturned: filtered.length,
      timestamp: new Date().toISOString(),
      risks: filtered,
    });
  } catch (error) {
    console.error("[Routes] Risk computation error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
