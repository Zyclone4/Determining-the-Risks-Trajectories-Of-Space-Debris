/**
 * RiskPanel — Displays top-risk objects with collision warnings
 */

import "./RiskPanel.css";

function getRiskIcon(level) {
  switch (level) {
    case "critical": return "🔴";
    case "warning": return "🟠";
    case "caution": return "🟡";
    case "nominal": return "🟢";
    default: return "⚪";
  }
}

function formatDistance(km) {
  if (km === undefined || km === null) return "—";
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

export default function RiskPanel({
  risks = [],
  isLoading = false,
  onSelectObject,
  selectedObjectId,
  totalDebris = 0,
  totalSatellites = 0,
}) {
  const criticalCount = risks.filter((r) => r.riskLevel === "critical").length;
  const warningCount = risks.filter((r) => r.riskLevel === "warning").length;

  return (
    <div className="risk-panel glass-card">
      {/* Header */}
      <div className="risk-panel__header">
        <h2 className="risk-panel__title">
          ⚠️ Risk Assessment
        </h2>
        {criticalCount > 0 && (
          <span className="badge badge-critical pulse">
            {criticalCount} Critical
          </span>
        )}
        {warningCount > 0 && (
          <span className="badge badge-warning">
            {warningCount} Warning
          </span>
        )}
      </div>

      {/* Stats bar */}
      <div className="risk-panel__stats">
        <div className="risk-panel__stat">
          <span className="risk-panel__stat-value mono">{totalDebris.toLocaleString()}</span>
          <span className="risk-panel__stat-label">Debris Tracked</span>
        </div>
        <div className="risk-panel__stat">
          <span className="risk-panel__stat-value mono">{totalSatellites.toLocaleString()}</span>
          <span className="risk-panel__stat-label">Active Sats</span>
        </div>
        <div className="risk-panel__stat">
          <span className="risk-panel__stat-value mono">{risks.length}</span>
          <span className="risk-panel__stat-label">Flagged</span>
        </div>
      </div>

      {/* Risk list */}
      <div className="risk-panel__list">
        {isLoading ? (
          <div className="risk-panel__loading">
            <div className="spinner" />
            <span>Computing risk scores…</span>
          </div>
        ) : risks.length === 0 ? (
          <div className="risk-panel__empty">
            No high-risk objects detected
          </div>
        ) : (
          risks.map((obj, idx) => (
            <button
              key={obj.noradId || idx}
              className={`risk-panel__item ${
                String(obj.noradId) === String(selectedObjectId) ? "selected" : ""
              }`}
              onClick={() => onSelectObject?.(obj.noradId)}
            >
              <span className="risk-panel__item-icon">
                {getRiskIcon(obj.riskLevel)}
              </span>

              <div className="risk-panel__item-info">
                <span className="risk-panel__item-name">
                  {obj.name || `Object ${obj.noradId}`}
                </span>
                <span className="risk-panel__item-meta mono">
                  ID {obj.noradId}
                  {obj.catalog && ` · ${obj.catalog}`}
                </span>
              </div>

              <div className="risk-panel__item-score">
                <span
                  className="risk-panel__score-bar"
                  style={{
                    "--score-width": `${(obj.riskScore || 0) * 100}%`,
                    "--score-color": `var(--color-risk-${obj.riskLevel || "nominal"})`,
                  }}
                />
                <span className="mono">{((obj.riskScore || 0) * 100).toFixed(1)}%</span>
              </div>

              {obj.closestApproach && (
                <div className="risk-panel__item-approach mono">
                  {formatDistance(obj.closestApproach.distanceKm)}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
