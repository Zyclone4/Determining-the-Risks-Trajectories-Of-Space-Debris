const ORBITS = [
  { key: "LEO", label: "LEO", range: "< 2,000 km", color: "#388bfd" },
  { key: "MEO", label: "MEO", range: "2,000–35,786 km", color: "#8b5cf6" },
  { key: "GEO", label: "GEO", range: "~35,786 km", color: "#06b6d4" },
  { key: "HEO", label: "HEO", range: "Highly Elliptical", color: "#d29922" },
  { key: "OTHER", label: "OTHER", range: "Unclassified", color: "#6e7681" },
];

function classifyOrbit(alt, ecc) {
  if (ecc > 0.25) return "HEO";
  if (alt < 2000) return "LEO";
  if (alt >= 2000 && alt < 35000) return "MEO";
  if (alt >= 35000 && alt < 36500) return "GEO";
  return "OTHER";
}

export default function OrbitDistribution({ risks = [] }) {
  const counts = { LEO: 0, MEO: 0, GEO: 0, HEO: 0, OTHER: 0 };
  risks.forEach(r => {
    const alt = r.position?.geodetic?.altitude ?? r.altitude ?? 0;
    const ecc = r.eccentricity ?? 0;
    const cls = classifyOrbit(alt, ecc);
    counts[cls]++;
  });

  const maxCount = Math.max(...Object.values(counts), 1);

  return (
    <div className="orbit-dist dark-card">
      <h3 className="section-title">Orbit Distribution</h3>
      <div className="orbit-dist__bars">
        {ORBITS.map(o => (
          <div key={o.key} className="orbit-dist__row">
            <div className="orbit-dist__label">
              <span className="orbit-dist__name">{o.label}</span>
              <span className="orbit-dist__range">{o.range}</span>
            </div>
            <div className="orbit-dist__bar-wrap">
              <div
                className="orbit-dist__bar"
                style={{
                  width: `${(counts[o.key] / maxCount) * 100}%`,
                  background: o.color,
                  minWidth: counts[o.key] > 0 ? 4 : 0,
                }}
              />
            </div>
            <span className="orbit-dist__count mono">{counts[o.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
