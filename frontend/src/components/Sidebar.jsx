/**
 * Sidebar — Search, filter, and catalog toggle controls
 */

import { useState } from "react";
import "./Sidebar.css";

const CATALOGS = [
  { key: "activeSatellites", label: "Active Satellites", icon: "🛰️", color: "#3b82f6" },
  { key: "fengyun1c", label: "Fengyun-1C Debris", icon: "💥", color: "#ef4444" },
  { key: "cosmos2251", label: "Cosmos 2251 Debris", icon: "💫", color: "#f59e0b" },
  { key: "iridium33", label: "Iridium 33 Debris", icon: "⚡", color: "#8b5cf6" },
  { key: "analystObjects", label: "Analyst Objects", icon: "🔍", color: "#06b6d4" },
];

const RISK_FILTERS = [
  { key: "critical", label: "Critical", color: "var(--color-risk-critical)" },
  { key: "warning", label: "Warning", color: "var(--color-risk-warning)" },
  { key: "caution", label: "Caution", color: "var(--color-risk-caution)" },
  { key: "nominal", label: "Nominal", color: "var(--color-risk-nominal)" },
];

export default function Sidebar({
  activeCatalogs = {},
  onToggleCatalog,
  searchQuery = "",
  onSearchChange,
  riskFilters = {},
  onToggleRiskFilter,
  summary = {},
  isLoading = false,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`sidebar glass-card ${collapsed ? "sidebar--collapsed" : ""}`}>
      {/* Header */}
      <div className="sidebar__header">
        <div className="sidebar__title-group">
          <h1 className="sidebar__title">
            <span className="sidebar__icon">🛰️</span>
            {!collapsed && "Orbital Watch"}
          </h1>
          {!collapsed && (
            <span className="sidebar__subtitle">
              Space Debris Tracker
            </span>
          )}
        </div>
        <button
          className="btn sidebar__toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {!collapsed && (
        <div className="sidebar__content">
          {/* Search */}
          <div className="sidebar__section">
            <label className="sidebar__label">Search Objects</label>
            <input
              className="input"
              type="text"
              placeholder="Name or NORAD ID..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>

          {/* Data Sources */}
          <div className="sidebar__section">
            <label className="sidebar__label">Data Sources</label>
            <div className="sidebar__catalog-list">
              {CATALOGS.map((cat) => {
                const isActive = activeCatalogs[cat.key] !== false;
                const count = summary[cat.key]?.count ?? "–";

                return (
                  <button
                    key={cat.key}
                    className={`sidebar__catalog-item ${isActive ? "active" : ""}`}
                    onClick={() => onToggleCatalog?.(cat.key)}
                    style={{
                      "--cat-color": cat.color,
                    }}
                  >
                    <span className="sidebar__catalog-icon">{cat.icon}</span>
                    <span className="sidebar__catalog-label">{cat.label}</span>
                    <span className="sidebar__catalog-count mono">{count}</span>
                    <span
                      className={`sidebar__catalog-dot ${isActive ? "active" : ""}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Risk Filter */}
          <div className="sidebar__section">
            <label className="sidebar__label">Risk Level Filter</label>
            <div className="sidebar__risk-filters">
              {RISK_FILTERS.map((rf) => {
                const isActive = riskFilters[rf.key] !== false;

                return (
                  <button
                    key={rf.key}
                    className={`sidebar__risk-btn ${isActive ? "active" : ""}`}
                    onClick={() => onToggleRiskFilter?.(rf.key)}
                    style={{ "--risk-color": rf.color }}
                  >
                    <span
                      className="sidebar__risk-dot"
                      style={{ background: rf.color }}
                    />
                    {rf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div className="sidebar__section sidebar__status">
            <div className="sidebar__status-row">
              <span className={`sidebar__live-dot ${isLoading ? "" : "pulse"}`} />
              <span className="sidebar__status-text">
                {isLoading ? "Loading data…" : "Live"}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
