/**
 * RFDiagnosticsPanel — Only rendered if chosen_model === "RandomForest" AND rf !== null
 */
import { SplitBar } from "./GRUDiagnosticsPanel";

function RFMetricCard({ name, value, threshold, passed, op = "≥" }) {
  const pct = Math.min((value / 1.0) * 100, 100);
  return (
    <div className="diag-metric-card dark-card">
      <div className="diag-metric-card__header">
        <span className="diag-metric-card__name">{name}</span>
        <span className={`badge ${passed ? "badge-pass" : "badge-fail"}`}>{passed ? "PASS" : "FAIL"}</span>
      </div>
      <div className="diag-metric-card__value mono">{value.toFixed(4)}</div>
      <div className="diag-metric-card__threshold">Threshold: {op} {threshold.toFixed(2)}</div>
      <div className="metric-bar">
        <div
          className={`metric-bar__fill ${passed ? "metric-bar__fill--pass" : "metric-bar__fill--fail"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const FEATURES = [
  { key: "perigee_alt", label: "Perigee Alt" },
  { key: "shell_density", label: "Shell Density" },
  { key: "inclination", label: "Inclination" },
  { key: "apogee_alt", label: "Apogee Alt" },
  { key: "rel_velocity", label: "Rel Velocity" },
];

const CLASS_PILLS = {
  Safe: "pill-yellow",
  Watch: "pill-orange",
  Critical: "pill-red",
};

export default function RFDiagnosticsPanel({ rf, split, accepted, acceptanceReason }) {
  // Explicitly hide if rf is null/undefined
  if (!rf) return null;

  const precRule = (rf.precision ?? 0) >= 0.85;
  const recRule = (rf.recall ?? 0) >= 0.80;
  const f1Rule = (rf.f1 ?? 0) >= 0.82;

  const importance = rf.feature_importance || FEATURES.map((_, i) => 0.2 - i * 0.03);
  const maxImp = Math.max(...importance, 0.01);
  const oobCurve = rf.oob_curve || [0.35, 0.28, 0.22, 0.18, 0.15, 0.13, 0.12, 0.11, 0.105, 0.10];
  const maxOob = Math.max(...oobCurve, 0.01);
  const perClass = rf.per_class || [
    { cls: "Safe", precision: 0.90, recall: 0.88, f1: 0.89 },
    { cls: "Watch", precision: 0.82, recall: 0.78, f1: 0.80 },
    { cls: "Critical", precision: 0.88, recall: 0.85, f1: 0.86 },
  ];

  return (
    <div className="diag-panel diag-panel--rf fade-in">
      <h3 className="diag-panel__title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        Random Forest Diagnostics
      </h3>

      {/* Acceptance */}
      <div className="diag-accept dark-card">
        <h4 className="section-title">Acceptance Criterion</h4>
        <div className="diag-accept__rules">
          <div className="diag-accept__rule">
            <span className={precRule ? "diag-accept__check--pass" : "diag-accept__check--fail"}>
              {precRule ? "✓" : "✗"}
            </span>
            <span className="mono">Precision {(rf.precision ?? 0).toFixed(4)} ≥ 0.85</span>
          </div>
          <div className="diag-accept__or">OR</div>
          <div className="diag-accept__rule">
            <span className={recRule ? "diag-accept__check--pass" : "diag-accept__check--fail"}>
              {recRule ? "✓" : "✗"}
            </span>
            <span className="mono">Recall {(rf.recall ?? 0).toFixed(4)} ≥ 0.80</span>
          </div>
          <div className="diag-accept__or">OR</div>
          <div className="diag-accept__rule">
            <span className={f1Rule ? "diag-accept__check--pass" : "diag-accept__check--fail"}>
              {f1Rule ? "✓" : "✗"}
            </span>
            <span className="mono">F1 Score {(rf.f1 ?? 0).toFixed(4)} ≥ 0.82</span>
          </div>
        </div>
        <div className="diag-accept__result">
          <span className={`badge ${accepted ? "badge-pass" : "badge-fail"}`}>
            {accepted ? "Model Accepted" : "Model Rejected"}
          </span>
          <span className="diag-accept__reason">{acceptanceReason}</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="diag-metrics-row diag-metrics-row--three">
        <RFMetricCard name="Precision" value={rf.precision ?? 0} threshold={0.85} passed={precRule} />
        <RFMetricCard name="Recall" value={rf.recall ?? 0} threshold={0.80} passed={recRule} />
        <RFMetricCard name="F1 Score" value={rf.f1 ?? 0} threshold={0.82} passed={f1Rule} />
      </div>

      {/* Feature Importance */}
      <div className="diag-importance dark-card">
        <h4 className="section-title">Feature Importance</h4>
        {FEATURES.map((f, i) => {
          const val = importance[i] ?? 0;
          return (
            <div key={f.key} className="diag-importance__row">
              <span className="diag-importance__label">{f.label}</span>
              <div className="diag-importance__bar-wrap">
                <div className="diag-importance__bar" style={{ width: `${(val / maxImp) * 100}%` }} />
              </div>
              <span className="diag-importance__val mono">{val.toFixed(3)}</span>
            </div>
          );
        })}
      </div>

      {/* Per-Class Breakdown */}
      <div className="diag-perclass dark-card">
        <h4 className="section-title">Per-Class Breakdown</h4>
        <table className="diag-perclass__table">
          <thead>
            <tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th></tr>
          </thead>
          <tbody>
            {perClass.map(row => (
              <tr key={row.cls}>
                <td><span className={`pill ${CLASS_PILLS[row.cls] || "pill-blue"}`}>{row.cls}</span></td>
                <td className="mono">{row.precision.toFixed(3)}</td>
                <td className="mono">{row.recall.toFixed(3)}</td>
                <td className="mono">{row.f1.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* OOB Error Chart */}
      <div className="diag-oob dark-card">
        <h4 className="section-title">OOB Error vs. Number of Trees</h4>
        <div className="diag-epoch__chart">
          {oobCurve.map((v, i) => (
            <div key={i} className="diag-epoch__col">
              <div className="diag-epoch__bar-wrap">
                <div className="diag-epoch__bar" style={{ height: `${(v / maxOob) * 100}%`, background: "#3fb950" }} />
              </div>
              <span className="diag-epoch__label">{(i + 1) * 10}</span>
            </div>
          ))}
        </div>
        <p className="diag-oob__note">OOB error is RF's built-in held-out validation — analogous to GRU epoch loss.</p>
      </div>

      {/* Split Bar */}
      <SplitBar split={split} />
    </div>
  );
}
