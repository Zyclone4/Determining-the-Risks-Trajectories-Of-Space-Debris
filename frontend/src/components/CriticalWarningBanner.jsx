import { useState, useEffect, useRef } from "react";

function formatCountdown(seconds) {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function DismissDropdown({ onDismissOne, onDismissAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="btn btn-ghost" onClick={() => setOpen(o => !o)}>
        Dismiss
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 6,
          overflow: "hidden",
          zIndex: 1000,
          minWidth: 160,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          <button
            style={{ display: "block", width: "100%", padding: "8px 14px", background: "none", border: "none", color: "#c9d1d9", fontSize: 12, textAlign: "left", cursor: "pointer" }}
            onMouseEnter={e => e.target.style.background = "#21262d"}
            onMouseLeave={e => e.target.style.background = "none"}
            onClick={() => { setOpen(false); onDismissOne(); }}
          >
            Dismiss this object
          </button>
          <button
            style={{ display: "block", width: "100%", padding: "8px 14px", background: "none", border: "none", color: "#f85149", fontSize: 12, textAlign: "left", cursor: "pointer" }}
            onMouseEnter={e => e.target.style.background = "#21262d"}
            onMouseLeave={e => e.target.style.background = "none"}
            onClick={() => { setOpen(false); onDismissAll(); }}
          >
            Dismiss all alerts
          </button>
        </div>
      )}
    </div>
  );
}

export default function CriticalWarningBanner({
  noradId,
  name,
  riskScore = 0,
  countdownSeconds = 1080,
  message,
  approachAlt,
  missDistance,
  relVelocity,
  inclination,
  group,
  status,
  lastPropagated,
  perigee,
  apogee,
  minPropAlt,
  nearestActive,
  shellDensity,
  riskBasis,
  currentIndex = 0,
  totalCount = 1,
  onPrev,
  onNext,
  onDismiss,
  onDismissOne,
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const riskPct = Math.min(riskScore * 100, 100);

  if (!showDetail) {
    return (
      <div className="crit-banner slide-down">
        <div className="crit-banner__body">
          <div className="crit-banner__icon">⚠️</div>
          <div className="crit-banner__content">
            <div className="crit-banner__top-row">
              <span className="pill pill-red">Critical</span>
              <span className="crit-banner__id mono">{noradId}</span>
              <span className="crit-banner__name">{name}</span>
              <span className="crit-banner__countdown mono">{formatCountdown(countdown)}</span>
            </div>
            <div className="crit-banner__message">
              {message || `Conjunction predicted — risk score ${riskScore.toFixed(2)}. Closest approach in ${Math.ceil(countdown / 60)} min. Immediate maneuver window open.`}
            </div>
            <div className="crit-banner__meta">
              {approachAlt != null && <span><em>Approach Alt</em> {approachAlt} km</span>}
              {missDistance != null && <span><em>Miss Distance</em> {missDistance} km</span>}
              {relVelocity != null && <span><em>Relative Velocity</em> {relVelocity} km/s</span>}
              {inclination != null && <span><em>Inclination</em> {inclination}°</span>}
            </div>
            <div className="crit-banner__actions">
              <div className="crit-banner__actions-left">
                <button className="btn btn-danger" onClick={() => setShowDetail(true)}>View Detail ↗</button>
                <DismissDropdown onDismissOne={onDismissOne} onDismissAll={onDismiss} />
              </div>
              {totalCount > 1 && (
                <div className="crit-banner__nav">
                  <button className="btn btn-ghost" onClick={onPrev} disabled={currentIndex === 0}>←</button>
                  <span className="mono crit-banner__nav-count">{currentIndex + 1} / {totalCount}</span>
                  <button className="btn btn-ghost" onClick={onNext} disabled={currentIndex === totalCount - 1}>→</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="crit-detail slide-down">
      <div className="crit-detail__header">
        <div className="crit-detail__top-row">
          <span className="pill pill-red">Critical</span>
          <span className="crit-detail__id mono">{noradId}</span>
          <span className="crit-detail__name">{name}</span>
          <span className="crit-banner__countdown mono">{formatCountdown(countdown)}</span>
        </div>
        <div className="crit-detail__sub">
          {group && <span>{group}</span>}
          {status && <span> · {status}</span>}
          {lastPropagated && <span> · Last propagated: {lastPropagated}</span>}
        </div>
      </div>
      <div className="crit-detail__grid">
        <div className="crit-detail__col">
          <div className="crit-detail__field">
            <span className="crit-detail__label">Risk Score</span>
            <div className="crit-detail__risk-row">
              <span className="crit-detail__risk-val mono">{riskScore.toFixed(3)}</span>
              <span className="pill pill-red">Critical</span>
            </div>
            <div className="metric-bar" style={{ marginTop: 6 }}>
              <div className="metric-bar__fill metric-bar__fill--fail" style={{ width: `${riskPct}%` }} />
            </div>
          </div>
          {missDistance != null && <DetailField label="Miss Distance" value={`${missDistance} km`} />}
          {relVelocity != null && <DetailField label="Relative Velocity" value={`${relVelocity} km/s`} />}
          {approachAlt != null && <DetailField label="Approach Altitude" value={`${approachAlt} km`} />}
          {inclination != null && <DetailField label="Inclination" value={`${inclination}°`} />}
        </div>
        <div className="crit-detail__col">
          {perigee != null && <DetailField label="Perigee" value={`${perigee} km`} />}
          {apogee != null && <DetailField label="Apogee" value={`${apogee} km`} />}
          {minPropAlt != null && <DetailField label="Min Propagated Alt" value={`${minPropAlt} km`} />}
          <DetailField
            label="Nearest Active Object"
            value={nearestActive || "not observed"}
            highlight={nearestActive && parseFloat(nearestActive) < 50}
          />
          <DetailField label="Shell Density" value={shellDensity ?? "—"} />
        </div>
      </div>
     <div className="crit-detail__footer">
      <div style={{ paddingBottom: 16 }}>
        <span className="crit-detail__basis">
          <em>Risk basis:</em> {riskBasis || "Keplerian fallback nearest-active approach + altitude envelope"}
        </span>
      </div>
      <div style={{ borderTop: "1px solid rgba(248, 81, 73, 0.2)", paddingTop: 14 }}>
      <div className="crit-banner__actions">
          <div className="crit-banner__actions-left">
            <button className="btn btn-ghost" onClick={() => setShowDetail(false)}>Collapse ↑</button>
            <DismissDropdown onDismissOne={onDismissOne} onDismissAll={onDismiss} />
          </div>
          {totalCount > 1 && (
            <div className="crit-banner__nav">
              <button className="btn btn-ghost" onClick={onPrev} disabled={currentIndex === 0}>←</button>
              <span className="mono crit-banner__nav-count">{currentIndex + 1} / {totalCount}</span>
              <button className="btn btn-ghost" onClick={onNext} disabled={currentIndex === totalCount - 1}>→</button>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

function DetailField({ label, value, highlight }) {
  return (
    <div className="crit-detail__field">
      <span className="crit-detail__label">{label}</span>
      <span className={`crit-detail__value mono ${highlight ? "crit-detail__value--danger" : ""}`}>{value}</span>
    </div>
  );
}