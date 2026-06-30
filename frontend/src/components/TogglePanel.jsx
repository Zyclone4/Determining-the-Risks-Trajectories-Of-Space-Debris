const TOGGLES = [
  { key: "top50", label: "Show Top 50 High-Risk Only", default: true },
  { key: "grid", label: "Earth Coordinate Grid", default: false },
  { key: "ellipses", label: "Orbit Ellipses", default: false },
  { key: "velocity", label: "Velocity Vectors", default: false },
  { key: "activeSats", label: "Active Satellites", default: true },
  { key: "debris", label: "Space Debris", default: true },
  { key: "conjunctions", label: "Conjunctions", default: true },
];

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle__track" />
      <span>{label}</span>
    </label>
  );
}

export default function TogglePanel({ toggles, onToggle, sourceGroups = [] }) {
  return (
    <div className="toggle-panel dark-card">
      <h3 className="section-title">Visualization Toggles</h3>
      <div className="toggle-panel__list">
        {TOGGLES.map(t => (
          <Toggle
            key={t.key}
            label={t.label}
            checked={toggles[t.key] ?? t.default}
            onChange={val => onToggle(t.key, val)}
          />
        ))}
      </div>
      {sourceGroups.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 16 }}>Source Groups</h3>
          <div className="toggle-panel__list">
            {sourceGroups.map(sg => (
              <Toggle
                key={sg.key}
                label={sg.label}
                checked={toggles[`src_${sg.key}`] ?? true}
                onChange={val => onToggle(`src_${sg.key}`, val)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export { TOGGLES };
