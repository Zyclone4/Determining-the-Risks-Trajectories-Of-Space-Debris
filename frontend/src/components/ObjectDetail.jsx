/**
 * ObjectDetail — Display details for a selected orbital object
 */

import "./ObjectDetail.css";

function formatNumber(val, decimals = 2) {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return Number(val).toFixed(decimals);
}

export default function ObjectDetail({ object, trajectory, onClose }) {
  if (!object) return null;

  const pos = object.position?.geodetic;
  const vel = object.position?.velocity;
  const orb = object.orbitalElements;

  return (
    <div className="object-detail glass-card fade-in">
      {/* Header */}
      <div className="object-detail__header">
        <div>
          <h3 className="object-detail__name">
            {object.name || `Object ${object.noradId}`}
          </h3>
          <span className="object-detail__id mono">
            NORAD {object.noradId}
          </span>
        </div>
        <button className="btn object-detail__close" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Risk badge */}
      {object.riskLevel && (
        <div className="object-detail__risk">
          <span className={`badge badge-${object.riskLevel}`}>
            {object.riskLevel}
          </span>
          <span className="mono" style={{ fontSize: "0.8rem" }}>
            Risk: {((object.riskScore || 0) * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {/* Current Position */}
      {pos && (
        <div className="object-detail__section">
          <h4 className="object-detail__section-title">Current Position</h4>
          <div className="object-detail__grid">
            <div className="object-detail__field">
              <span className="object-detail__field-label">Latitude</span>
              <span className="object-detail__field-value mono">
                {formatNumber(pos.latitude, 4)}°
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Longitude</span>
              <span className="object-detail__field-value mono">
                {formatNumber(pos.longitude, 4)}°
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Altitude</span>
              <span className="object-detail__field-value mono">
                {formatNumber(pos.altitude, 1)} km
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Speed</span>
              <span className="object-detail__field-value mono">
                {formatNumber(object.position?.speed, 3)} km/s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Orbital Elements */}
      {orb && (
        <div className="object-detail__section">
          <h4 className="object-detail__section-title">Orbital Elements</h4>
          <div className="object-detail__grid">
            <div className="object-detail__field">
              <span className="object-detail__field-label">Inclination</span>
              <span className="object-detail__field-value mono">
                {formatNumber(orb.inclination, 2)}°
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Eccentricity</span>
              <span className="object-detail__field-value mono">
                {formatNumber(orb.eccentricity, 6)}
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">RAAN</span>
              <span className="object-detail__field-value mono">
                {formatNumber(orb.raan, 2)}°
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Arg. Perigee</span>
              <span className="object-detail__field-value mono">
                {formatNumber(orb.argOfPericenter, 2)}°
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Mean Motion</span>
              <span className="object-detail__field-value mono">
                {formatNumber(orb.meanMotion, 4)} rev/day
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Period</span>
              <span className="object-detail__field-value mono">
                {orb.period ? `${formatNumber(orb.period, 1)} min` : "—"}
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Apoapsis</span>
              <span className="object-detail__field-value mono">
                {orb.apoapsis ? `${formatNumber(orb.apoapsis, 1)} km` : "—"}
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Periapsis</span>
              <span className="object-detail__field-value mono">
                {orb.periapsis ? `${formatNumber(orb.periapsis, 1)} km` : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Closest Approach */}
      {object.closestApproach && (
        <div className="object-detail__section">
          <h4 className="object-detail__section-title">Closest Approach</h4>
          <div className="object-detail__grid">
            <div className="object-detail__field">
              <span className="object-detail__field-label">To Satellite</span>
              <span className="object-detail__field-value">
                {object.closestApproach.satelliteName || object.closestApproach.satelliteId}
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Distance</span>
              <span className="object-detail__field-value mono">
                {formatNumber(object.closestApproach.distanceKm, 2)} km
              </span>
            </div>
            <div className="object-detail__field">
              <span className="object-detail__field-label">Rel. Velocity</span>
              <span className="object-detail__field-value mono">
                {formatNumber(object.closestApproach.relativeVelocityKmS, 3)} km/s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TLE Epoch */}
      <div className="object-detail__epoch mono">
        Epoch: {object.epoch || "—"}
      </div>
    </div>
  );
}
