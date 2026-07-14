import { useState } from "react";

function formatUTC(d) {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function toUTCInput(d) {
  return d.toISOString().slice(0, 16);
}

export default function Header({ backendOnline, lastUpdate, onAnalyze, isLoading }) {
  const [startTime, setStartTime] = useState(toUTCInput(new Date()));

  return (
    <header className="header">
      <div className="header__left">
        <div className="header__logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#388bfd" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)" />
            <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)" />
            <circle cx="12" cy="12" r="2" fill="#388bfd" />
          </svg>
          <div>
            <h1 className="header__title">ORBITAL DEBRIS WATCH</h1>
            <div className="header__status">
              <span className={`header__dot ${backendOnline ? "header__dot--on" : "header__dot--off"}`} />
              <span className="header__status-text">
                {backendOnline ? "API Active" : "API Offline"}
              </span>
              {lastUpdate && (
                <span className="header__update">Space-Track Update: {formatUTC(new Date(lastUpdate))}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="header__right">
        <div className="header__timeframe">
          <span className="header__tf-label">TIMEFRAME START (UTC)</span>
          <div className="header__tf-row">
            <input
              type="datetime-local"
              className="input header__tf-input"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
            <button
              className="btn btn-primary header__analyze-btn"
              onClick={() => onAnalyze?.(new Date(startTime))}
              disabled={isLoading}
            >
              {isLoading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Analyzing…</> : "🛰️ Analyze Orbits"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
