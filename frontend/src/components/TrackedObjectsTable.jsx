import { useState, useMemo } from "react";

const PAGE_SIZE = 25;

function riskLabel(score) {
  if (score >= 0.70) return { text: "Critical", cls: "pill-red" };
  if (score >= 0.45) return { text: "Watch", cls: "pill-orange" };
  return { text: "Safe", cls: "pill-green" };
}

export default function TrackedObjectsTable({ risks = [], onSelectObject, selectedId }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [altFilter, setAltFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [sortCol, setSortCol] = useState("riskScore");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = useMemo(() => {
    let items = [...risks];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(r =>
        String(r.noradId).includes(q) ||
        (r.name || "").toLowerCase().includes(q)
      );
    }
    if (riskFilter !== "all") {
      items = items.filter(r => {
        const s = r.riskScore ?? 0;
        if (riskFilter === "critical") return s >= 0.70;
        if (riskFilter === "watch") return s >= 0.45 && s < 0.70;
        if (riskFilter === "safe") return s < 0.45;
        return true;
      });
    }
    if (altFilter !== "all") {
      items = items.filter(r => {
        const a = r.perigee ?? r.position?.geodetic?.altitude ?? 0;
        const apogee = r.apogee ?? a;
        const eccentricity = apogee > 0 ? (apogee - a) / (apogee + a + 12742) : 0;
        if (altFilter === "leo") return a >= 160 && a < 2000;
        if (altFilter === "meo") return a >= 2000 && a < 35586;
        if (altFilter === "geo") return a >= 35586 && a <= 35986;
        if (altFilter === "heo") return eccentricity > 0.25;
        return true;
      });
    }
    if (catFilter !== "all") {
      items = items.filter(r => (r.catalog || "").toLowerCase().includes(catFilter));
    }
    items = [...items].sort((a, b) => {
      if (sortCol === "noradId" || sortCol === "name") {
        const as = String(a[sortCol] ?? "");
        const bs = String(b[sortCol] ?? "");
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      }
      const av = Number(a[sortCol]) || 0;
      const bv = Number(b[sortCol]) || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return items;
  }, [risks, search, riskFilter, altFilter, catFilter, sortCol, sortDir]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);

  const categories = useMemo(() => {
    const cats = new Set();
    risks.forEach(r => { if (r.catalog) cats.add(r.catalog); });
    return Array.from(cats);
  }, [risks]);

  return (
    <div className="tracked-table fade-in">
      <div className="tracked-table__header">
        <h3 className="tracked-table__title">Tracked Objects Table</h3>
        <div className="tracked-table__filters">
          <input
            className="input tracked-table__search"
            placeholder="Search ID / Name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
          <select className="input tracked-table__select" value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(0); }}>
            <option value="all">Risk Level</option>
            <option value="critical">Critical</option>
            <option value="watch">Watch</option>
            <option value="safe">Safe</option>
          </select>
          <select className="input tracked-table__select" value={altFilter} onChange={e => { setAltFilter(e.target.value); setPage(0); }}>
            <option value="all">Altitudes</option>
            <option value="leo">LEO (160–2,000 km)</option>
            <option value="meo">MEO (2,000–35,786 km)</option>
            <option value="geo">GEO (35,786 km ± 200 km)</option>
            <option value="heo">HEO (Eccentricity &gt; 0.25)</option>
          </select>
          <select className="input tracked-table__select" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0); }}>
            <option value="all">Category</option>
            {categories.map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="tracked-table__wrap">
        <table className="tracked-table__table">
          <thead>
            <tr>
              {[
                { key: "noradId", label: "NORAD ID" },
                { key: "name", label: "Source" },
                { key: "riskScore", label: "Risk Score" },
                { key: "closestApproach", label: "Approach" },
                { key: "perigee", label: "Alt (km)" },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => {
                    if (sortCol === col.key) {
                      setSortDir(d => d === "asc" ? "desc" : "asc");
                    } else {
                      setSortCol(col.key);
                      setSortDir("desc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  {col.label} {sortCol === col.key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.map(r => {
              const rl = riskLabel(r.riskScore ?? 0);
              const isSelected = String(r.noradId) === String(selectedId);
              return (
                <tr
                  key={r.noradId}
                  className={`tracked-table__row ${isSelected ? "tracked-table__row--selected" : ""}`}
                  onClick={() => onSelectObject?.(r.noradId)}
                >
                  <td className="mono">{r.noradId}</td>
                  <td>{r.name || "—"}</td>
                  <td>
                    <span className={`pill ${rl.cls}`}>{(r.riskScore ?? 0).toFixed(3)}</span>
                  </td>
                  <td className="mono">{r.closestApproach != null ? Number(r.closestApproach).toFixed(2) : 'N/A'} km</td>
                  <td className="mono">{r.perigee != null ? r.perigee.toFixed(0) : (r.position?.geodetic?.altitude ?? 0).toFixed(0)}</td>
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr><td colSpan={5} className="tracked-table__empty">No objects match filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="tracked-table__pagination">
        <span className="tracked-table__info">
          {filtered.length} objects · Page {clampedPage + 1} of {totalPages}
        </span>
        <div className="tracked-table__pages">
          <button className="btn" disabled={clampedPage === 0} onClick={() => setPage(0)}>«</button>
          <button className="btn" disabled={clampedPage === 0} onClick={() => setPage(p => p - 1)}>‹</button>
          <button className="btn" disabled={clampedPage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
          <button className="btn" disabled={clampedPage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
        </div>
      </div>
    </div>
  );
}
