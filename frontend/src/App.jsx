/**
 * App — Orbital Debris Watch Dashboard
 *
 * Master layout: Header → StatBoxes → CriticalBanner → Globe/Sidebar → Diagnostics → Table
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import Header from "./components/Header";
import StatBoxes from "./components/StatBoxes";
import Globe from "./components/Globe";
import TogglePanel from "./components/TogglePanel";
import OrbitDistribution from "./components/OrbitDistribution";
import SourceGroups from "./components/SourceGroups";
import GRUDiagnosticsPanel from "./components/GRUDiagnosticsPanel";
import RFDiagnosticsPanel from "./components/RFDiagnosticsPanel";
import TrackedObjectsTable from "./components/TrackedObjectsTable";
import ObjectDetailModal from "./components/ObjectDetailModal";
import CriticalWarningBanner from "./components/CriticalWarningBanner";
import { fetchDebrisData, fetchRisks, fetchTrajectory, checkHealth, fetchModelDiagnostics } from "./api/client";
import "./App.css";

// Default toggles
const DEFAULT_TOGGLES = {
  top50: true, grid: false, ellipses: false, velocity: false,
  activeSats: true, debris: true, conjunctions: true,
};

// Source group color map
const SOURCE_COLORS = {
  cosmos2251: "#f85149",
  iridium33: "#d29922",
  activeSatellites: "#388bfd",
  fengyun1c: "#8b5cf6",
  analystObjects: "#6e7681",
};

function App() {
  // ── Data state ──
  const [debrisData, setDebrisData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [diagData, setDiagData] = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);
  const [globeSelectedId, setGlobeSelectedId] = useState(null);
  const [trajectoryPoints, setTrajectoryPoints] = useState([]);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [dismissedObjects, setDismissedObjects] = useState(new Set());
  
  // ── UI state ──
  const [isLoading, setIsLoading] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  
  // ── Health check ──
  useEffect(() => {
    checkHealth()
      .then(data => { setBackendOnline(true); setLastUpdate(data.timestamp); })
      .catch(() => setBackendOnline(false));
  }, []);

  // ── Fetch diagnostics on mount ──
  useEffect(() => {
    fetchModelDiagnostics().then(d => { if (d) setDiagData(d); });
  }, []);

  // ── Auto-load on mount ──
  useEffect(() => {
    if (backendOnline) handleAnalyze();
  }, [backendOnline]);

  // ── Analyze handler ──
  const handleAnalyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDismissedBanner(false);
    try {
      const [debris, risks] = await Promise.all([
        fetchDebrisData(),
        fetchRisks({ limit: 100000 }),
      ]);
      setDebrisData(debris);
      setRiskData(risks);
      setLastUpdate(new Date().toISOString());
    } catch (err) {
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Select object ──
  // Globe click — only sets trajectory, no modal
  const handleGlobeSelect = useCallback(async (noradId) => {
    setSelectedObject(null);  // close modal
    setGlobeSelectedId(noradId);  // track for globe
    try {
      const traj = await fetchTrajectory(noradId, { duration: 2880, interval: 5 });
      setTrajectoryPoints(traj.trajectoryPoints || []);
    } catch {
      setTrajectoryPoints([]);
    }
  }, []);

  // Table click — full modal with all object data
  const handleTableSelect = useCallback(async (noradId) => {
    const obj = riskData?.risks?.find(r => String(r.noradId) === String(noradId));
    setSelectedObject(obj || { noradId });
    try {
      const traj = await fetchTrajectory(noradId, { duration: 2880, interval: 5 });
      setTrajectoryPoints(traj.trajectoryPoints || []);
    } catch {
      setTrajectoryPoints([]);
    }
  }, [riskData]);

  // ── Toggle handler ──
  const handleToggle = useCallback((key, val) => {
    setToggles(prev => ({ ...prev, [key]: val }));
  }, []);

  // ── Derived data ──
  const allRisks = riskData?.risks || [];

  // Source groups from debris data
  const sourceGroups = useMemo(() => {
    if (!debrisData?.summary) return [];
    return Object.entries(debrisData.summary).map(([key, val]) => ({
      key,
      label: val.label || key,
      count: val.count || 0,
      color: SOURCE_COLORS[key] || "#8b949e",
    }));
  }, [debrisData]);

  // Globe objects (filtered by toggles)
  const globeObjects = useMemo(() => {
    let items = [...allRisks];
    if (toggles.top50) {
      items = items.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 50);
    }
    return items;
  }, [allRisks, toggles.top50]);

  // Critical object for banner
  const criticalObjects = useMemo(() => {
    if (!allRisks.length) return [];
    return allRisks
      .filter(r => (r.riskScore ?? 0) >= 0.70 && !dismissedObjects.has(r.noradId))
      .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
  }, [allRisks, dismissedObjects]);

  const [criticalIndex, setCriticalIndex] = useState(0);
  const criticalObj = criticalObjects[criticalIndex] || null;

  const totalActive = riskData?.totalSatellitesUsed || 0;
  const totalDebris = riskData?.totalDebrisAnalyzed || 0;

  return (
    <div className="app">
      {/* ── Header ── */}
      <Header
        backendOnline={backendOnline}
        lastUpdate={lastUpdate}
        onAnalyze={handleAnalyze}
        isLoading={isLoading}
      />

      {/* ── Stat Boxes ── */}
      <StatBoxes
        risks={allRisks}
        totalActive={totalActive}
        totalDebris={totalDebris}
      />

      {/* ── Critical Warning Banner ── */}
      {criticalObjects.length > 0 && !dismissedBanner && (
        <CriticalWarningBanner
          noradId={criticalObj.noradId}
          name={criticalObj.name}
          riskScore={criticalObj.riskScore ?? 0}
          approachAlt={criticalObj.position?.geodetic?.altitude?.toFixed?.(0)}
          missDistance={criticalObj.closestApproach?.toFixed?.(1)}
          relVelocity={criticalObj.relVelocity?.toFixed?.(2)}
          inclination={criticalObj.inclination?.toFixed?.(2)}
          group={criticalObj.catalog}
          perigee={criticalObj.perigee?.toFixed?.(0)}
          apogee={criticalObj.apogee?.toFixed?.(0)}
          shellDensity={criticalObj.shellDensity}
          riskBasis={criticalObj.riskBasis}
          currentIndex={criticalIndex}
          totalCount={criticalObjects.length}
          onPrev={() => setCriticalIndex(i => Math.max(0, i - 1))}
          onNext={() => setCriticalIndex(i => Math.min(criticalObjects.length - 1, i + 1))}
          onDismissOne={() => {
              setDismissedObjects(prev => new Set([...prev, criticalObj.noradId]));
              setCriticalIndex(i => Math.min(i, criticalObjects.length - 2));
          }}
          onDismiss={() => setDismissedBanner(true)}
        />
      )}

      {/* ── Error Banner ── */}
      {error && <div className="error-banner fade-in">⚠️ {error}</div>}

      {/* ── Main Dashboard Grid ── */}
      <div className="dashboard">
        {/* Globe */}
        <div className="dashboard__globe">
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "8px", letterSpacing: "0.04em" }}>
            3D Orbital Debris Visualizer
          </div>
          <div style={{ position: "relative" }}>
            <Globe
              objects={globeObjects}
              trajectoryPoints={trajectoryPoints}
              selectedObjectId={globeSelectedId}
              selectedObjectName={riskData?.risks?.find(r => String(r.noradId) === String(globeSelectedId))?.name}
              selectedObjectRisk={riskData?.risks?.find(r => String(r.noradId) === String(globeSelectedId))?.riskLabel}
              onSelectObject={handleGlobeSelect}
              showGrid={toggles.grid}
            />

            {/* Overlay prompt when no data */}
            {!riskData && !isLoading && (
              <div className="globe-overlay">
                <div className="globe-prompt glass-card">
                  <h2>🛰️ Space Debris Dashboard</h2>
                  <p>Click <strong>Analyze Orbits</strong> to load orbital data from Space-Track.org and begin risk analysis.</p>
                  <button className="btn btn-primary" onClick={handleAnalyze}>🚀 Analyze Orbits</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar (toggles, orbit dist, source groups, detail) */}
        <div className="dashboard__sidebar">
          <TogglePanel
            toggles={toggles}
            onToggle={handleToggle}
            sourceGroups={sourceGroups.map(sg => ({
              key: sg.key,
              label: sg.label,
            }))}
          />
          <OrbitDistribution risks={allRisks} />
          <SourceGroups groups={sourceGroups} />
          {selectedObject && (
            <ObjectDetailModal
              object={selectedObject}
              onClose={() => { setSelectedObject(null); setTrajectoryPoints([]); }}
            />
          )}
        </div>

        {/* ── Diagnostics Section ── */}
        {diagData && (
          <div className="dashboard__diagnostics">
            <div className="diag-section">
              {/* GRU panel always shown if data exists */}
              {diagData.gru && (
                <GRUDiagnosticsPanel
                  gru={diagData.gru}
                  split={diagData.split}
                  accepted={diagData.accepted}
                  acceptanceReason={diagData.acceptance_reason}
                />
              )}
              {/* RF panel ONLY if chosen_model === "RandomForest" AND rf !== null */}
              {diagData.chosen_model === "RandomForest" && diagData.rf !== null && (
                <RFDiagnosticsPanel
                  rf={diagData.rf}
                  split={diagData.split}
                  accepted={diagData.accepted}
                  acceptanceReason={diagData.acceptance_reason}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Tracked Objects Table ── */}
        <div className="dashboard__table">
          <TrackedObjectsTable
            risks={allRisks}
            selectedId={selectedObject?.noradId}
            onSelectObject={handleTableSelect}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
