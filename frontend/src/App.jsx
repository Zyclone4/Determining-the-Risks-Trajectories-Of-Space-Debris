/**
 * App — Main layout for the Space Debris Dashboard
 *
 * Layout: Sidebar | Globe (center) | Right panel (Risk + Detail)
 * Fetches debris data on mount, computes risk scores, and manages state.
 */

import { useState, useEffect, useCallback } from "react";
import Globe from "./components/Globe";
import Sidebar from "./components/Sidebar";
import RiskPanel from "./components/RiskPanel";
import ObjectDetail from "./components/ObjectDetail";
import { fetchDebrisData, fetchRisks, fetchTrajectory, checkHealth } from "./api/client";
import "./App.css";

function App() {
  // Data state
  const [debrisData, setDebrisData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);
  const [trajectoryPoints, setTrajectoryPoints] = useState([]);

  // UI state
  const [isLoadingDebris, setIsLoadingDebris] = useState(false);
  const [isLoadingRisks, setIsLoadingRisks] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCatalogs, setActiveCatalogs] = useState({
    activeSatellites: true,
    fengyun1c: true,
    cosmos2251: true,
    iridium33: true,
    analystObjects: true,
  });
  const [riskFilters, setRiskFilters] = useState({
    critical: true,
    warning: true,
    caution: true,
    nominal: true,
  });

  // Health check on mount
  useEffect(() => {
    checkHealth()
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
  }, []);

  // Fetch debris data
  const loadDebrisData = useCallback(async () => {
    setIsLoadingDebris(true);
    setError(null);
    try {
      const data = await fetchDebrisData();
      setDebrisData(data);
    } catch (err) {
      setError(`Failed to load debris data: ${err.message}`);
    } finally {
      setIsLoadingDebris(false);
    }
  }, []);

  // Fetch risk data
  const loadRiskData = useCallback(async () => {
    setIsLoadingRisks(true);
    try {
      const data = await fetchRisks({ limit: 100 });
      setRiskData(data);
    } catch (err) {
      console.error("Risk loading error:", err);
    } finally {
      setIsLoadingRisks(false);
    }
  }, []);

  // Select an object and load its trajectory
  const handleSelectObject = useCallback(async (noradId) => {
    // Find the object in risk data
    const obj = riskData?.risks?.find(
      (r) => String(r.noradId) === String(noradId)
    );
    setSelectedObject(obj || { noradId });

    // Fetch trajectory
    try {
      const traj = await fetchTrajectory(noradId);
      setTrajectoryPoints(traj.trajectoryPoints || []);
    } catch (err) {
      console.error("Trajectory error:", err);
      setTrajectoryPoints([]);
    }
  }, [riskData]);

  // Toggle catalog visibility
  const handleToggleCatalog = useCallback((key) => {
    setActiveCatalogs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Toggle risk filter
  const handleToggleRiskFilter = useCallback((key) => {
    setRiskFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Filter objects for the globe
  const globeObjects = (() => {
    if (!riskData?.risks) return [];

    return riskData.risks.filter((obj) => {
      // Risk level filter
      if (obj.riskLevel && riskFilters[obj.riskLevel] === false) return false;

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = obj.name?.toLowerCase().includes(q);
        const idMatch = String(obj.noradId).includes(q);
        if (!nameMatch && !idMatch) return false;
      }

      return true;
    });
  })();

  // Filtered risks for the panel
  const filteredRisks = (() => {
    if (!riskData?.risks) return [];

    return riskData.risks.filter((obj) => {
      if (obj.riskLevel && riskFilters[obj.riskLevel] === false) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = obj.name?.toLowerCase().includes(q);
        const idMatch = String(obj.noradId).includes(q);
        if (!nameMatch && !idMatch) return false;
      }
      return true;
    });
  })();

  // Summary for sidebar
  const summary = debrisData?.summary || {};

  return (
    <div className="app">
      {/* Left Sidebar */}
      <Sidebar
        activeCatalogs={activeCatalogs}
        onToggleCatalog={handleToggleCatalog}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        riskFilters={riskFilters}
        onToggleRiskFilter={handleToggleRiskFilter}
        summary={summary}
        isLoading={isLoadingDebris}
      />

      {/* Center: Globe */}
      <main className="app__main">
        {/* Top bar */}
        <div className="app__topbar">
          <div className="app__topbar-left">
            <span
              className={`app__status-dot ${backendOnline ? "online" : "offline"}`}
            />
            <span className="app__status-text">
              {backendOnline ? "API Connected" : "API Offline"}
            </span>
          </div>
          <div className="app__topbar-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                loadDebrisData();
                loadRiskData();
              }}
              disabled={isLoadingDebris || isLoadingRisks}
            >
              {isLoadingDebris || isLoadingRisks ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Loading…
                </>
              ) : (
                "🔄 Fetch Data"
              )}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="app__error fade-in">
            ⚠️ {error}
          </div>
        )}

        {/* Globe viewport */}
        <div className="app__globe">
          <Globe
            objects={globeObjects}
            trajectoryPoints={trajectoryPoints}
            selectedObjectId={selectedObject?.noradId}
            onSelectObject={handleSelectObject}
          />

          {/* Overlay: prompt to fetch */}
          {!riskData && !isLoadingRisks && (
            <div className="app__globe-overlay fade-in">
              <div className="app__globe-prompt glass-card">
                <h2>🛰️ Space Debris Dashboard</h2>
                <p>
                  Click <strong>Fetch Data</strong> to load orbital data from
                  Space-Track.org and begin risk analysis.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    loadDebrisData();
                    loadRiskData();
                  }}
                >
                  🚀 Fetch Data
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Right Panel */}
      <div className="app__right-panel">
        {selectedObject ? (
          <ObjectDetail
            object={selectedObject}
            trajectory={trajectoryPoints}
            onClose={() => {
              setSelectedObject(null);
              setTrajectoryPoints([]);
            }}
          />
        ) : (
          <RiskPanel
            risks={filteredRisks}
            isLoading={isLoadingRisks}
            onSelectObject={handleSelectObject}
            selectedObjectId={selectedObject?.noradId}
            totalDebris={riskData?.totalDebrisAnalyzed || 0}
            totalSatellites={riskData?.totalSatellitesUsed || 0}
          />
        )}
      </div>
    </div>
  );
}

export default App;
