const BOXES = [
  { key: "total", label: "Total Cataloged", icon: "📡", color: "#388bfd", bg: "rgba(56,139,253,0.08)", border: "rgba(56,139,253,0.25)" },
  { key: "leo", label: "LEO Objects", icon: "🌍", color: "#06b6d4", bg: "rgba(6,182,212,0.08)", border: "rgba(6,182,212,0.25)" },
  { key: "danger", label: "Conjunction Danger", icon: "⚠️", color: "#f85149", bg: "rgba(248,81,73,0.08)", border: "rgba(248,81,73,0.25)" },
  { key: "watch", label: "Watch List", icon: "🔶", color: "#d29922", bg: "rgba(210,153,34,0.08)", border: "rgba(210,153,34,0.25)" },
  { key: "safe", label: "Safe / Low Risk", icon: "✅", color: "#3fb950", bg: "rgba(63,185,80,0.08)", border: "rgba(63,185,80,0.25)" },
];

export default function StatBoxes({ risks = [], totalActive = 0, totalDebris = 0 }) {
  const total = totalActive + totalDebris;
  const leoCount = risks.filter(r => {
    const alt = r.position?.geodetic?.altitude ?? r.altitude ?? 0;
    return alt < 2000;
  }).length;
  const dangerCount = risks.filter(r => (r.riskScore ?? 0) >= 0.70).length;
  const watchCount = risks.filter(r => { const s = r.riskScore ?? 0; return s >= 0.45 && s < 0.70; }).length;
  const safeCount = risks.filter(r => (r.riskScore ?? 0) < 0.45).length;
  const leoPct = total > 0 ? ((leoCount / total) * 100).toFixed(1) : "0.0";

  const values = {
    total: { main: total.toLocaleString(), sub: `Active: ${totalActive.toLocaleString()} | Debris: ${totalDebris.toLocaleString()}` },
    leo: { main: leoCount.toLocaleString(), sub: `${leoPct}% of total` },
    danger: { main: dangerCount.toLocaleString(), sub: "High risk score ≥ 0.70" },
    watch: { main: watchCount.toLocaleString(), sub: "0.45 ≤ Watch score < 0.70" },
    safe: { main: safeCount.toLocaleString(), sub: "Lower risk < 0.45" },
  };

  return (
    <div className="stat-boxes">
      {BOXES.map(box => (
        <div key={box.key} className="stat-box" style={{ background: box.bg, borderColor: box.border }}>
          <div className="stat-box__header">
            <span className="stat-box__icon">{box.icon}</span>
            <span className="stat-box__label">{box.label}</span>
          </div>
          <div className="stat-box__value" style={{ color: box.color }}>
            {values[box.key].main}
          </div>
          <div className="stat-box__sub">{values[box.key].sub}</div>
        </div>
      ))}
    </div>
  );
}
