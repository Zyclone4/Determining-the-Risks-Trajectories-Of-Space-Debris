export default function SourceGroups({ groups = [] }) {
  if (!groups.length) return null;

  return (
    <div className="source-groups dark-card">
      <h3 className="section-title">Source Groups</h3>
      <div className="source-groups__list">
        {groups.map(g => (
          <div key={g.key} className="source-groups__item">
            <span className="source-groups__dot" style={{ background: g.color || "#388bfd" }} />
            <span className="source-groups__name">{g.label}</span>
            <span className="source-groups__count mono">{g.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
