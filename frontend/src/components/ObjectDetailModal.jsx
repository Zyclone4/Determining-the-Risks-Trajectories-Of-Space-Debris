/**
 * ObjectDetailModal — Expanded detail view for a selected tracked object
 */
function riskLabel(score) {
  if (score >= 0.70) return { text: "Critical", cls: "pill-red" };
  if (score >= 0.45) return { text: "Watch", cls: "pill-orange" };
  return { text: "Safe", cls: "pill-green" };
}

export default function ObjectDetailModal({ object, onClose }) {
  if (!object) return null;
  const rl = riskLabel(object.riskScore ?? 0);
  const alt = object.position?.geodetic?.altitude ?? object.altitude ?? 0;
  const closest = object.closestApproach ?? object.missDistance ?? object.closest_approach;
  return (
    <div className="obj-detail__overlay" onClick={onClose}>
      <div className="obj-detail fade-in dark-card" onClick={e => e.stopPropagation()}>
        <div className="obj-detail__header">
          <div>
            <h3 className="obj-detail__name">{object.name || `Object ${object.noradId}`}</h3>
            <span className="obj-detail__sub">NORAD: {object.noradId}</span>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close detail">✕</button>
        </div>
        <div className="obj-detail__grid">
          <div className="obj-detail__field">
            <span className="obj-detail__label">Group</span>
            <span className="obj-detail__value">{object.catalog || "unknown"}</span>
          </div>
          <div className="obj-detail__field">
            <span className="obj-detail__label">Risk</span>
            <span className="obj-detail__value">
              <span className={`pill ${rl.cls}`}>{(object.riskScore ?? 0).toFixed(3)} ({rl.text})</span>
            </span>
          </div>
          <div className="obj-detail__field">
            <span className="obj-detail__label">Perigee</span>
            <span className="obj-detail__value mono">{object.perigee != null ? `${object.perigee.toFixed(0)} km` : `${alt.toFixed(0)} km`}</span>
          </div>
          <div className="obj-detail__field">
            <span className="obj-detail__label">Apogee</span>
            <span className="obj-detail__value mono">{object.apogee != null ? `${object.apogee.toFixed(0)} km` : "—"}</span>
          </div>
          <div className="obj-detail__field">
            <span className="obj-detail__label">Inclination</span>
            <span className="obj-detail__value mono">{object.inclination != null ? `${object.inclination.toFixed(2)} deg` : "—"}</span>
          </div>
          <div className="obj-detail__field">
            <span className="obj-detail__label">Min propagated altitude</span>
            <span className="obj-detail__value mono">{object.minAltitude != null ? `${object.minAltitude.toFixed(0)} km` : `${alt.toFixed(0)} km`}</span>
          </div>
          <div className="obj-detail__field">
            <span className="obj-detail__label">Nearest active object</span>
            <span className="obj-detail__value mono">
              {closest != null ? `${Number(closest).toFixed(1)} km` : "not observed"}
            </span>
          </div>
          <div className="obj-detail__field">
            <span className="obj-detail__label">Shell density</span>
            <span className="obj-detail__value mono">{object.shellDensity ?? "—"}</span>
          </div>
          <div className="obj-detail__field obj-detail__field--full">
            <span className="obj-detail__label">Risk basis</span>
            <span className="obj-detail__value" style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
              {object.riskBasis || "Keplerian fallback nearest-active approach + altitude envelope"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}