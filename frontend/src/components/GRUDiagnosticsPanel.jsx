/**
 * GRUDiagnosticsPanel — Displays GRU training results and acceptance logic
 */

function MetricCard({ name, value, threshold, passed, unit = "" }) {
  const pct = Math.min((value / threshold) * 100, 100);
  return (
    <div className="diag-metric-card dark-card">
      <div className="diag-metric-card__header">
        <span className="diag-metric-card__name">{name}</span>
        <span className={`badge ${passed ? "badge-pass" : "badge-fail"}`}>{passed ? "PASS" : "FAIL"}</span>
      </div>
      <div className="diag-metric-card__value mono">{value.toFixed(6)}{unit}</div>
      <div className="diag-metric-card__threshold">Threshold: {threshold.toFixed(6)}</div>
      <div className="metric-bar">
        <div
          className={`metric-bar__fill ${passed ? "metric-bar__fill--pass" : "metric-bar__fill--fail"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SplitBar({ split }) {
  if (!split) return null;
  const { total, train, val, test } = split;
  const trainPct = ((train / total) * 100).toFixed(1);
  const valPct = ((val / total) * 100).toFixed(1);
  const testPct = ((test / total) * 100).toFixed(1);

  return (
    <div className="diag-split">
      <h4 className="section-title">Object-Based Split (NORAD ID)</h4>
      <div className="split-bar">
        <div className="split-bar__seg split-bar__seg--train" style={{ width: `${trainPct}%` }}>
          Train {train}
        </div>
        <div className="split-bar__seg split-bar__seg--val" style={{ width: `${valPct}%` }}>
          Val {val}
        </div>
        <div className="split-bar__seg split-bar__seg--test" style={{ width: `${testPct}%` }}>
          Test {test}
        </div>
      </div>
      <div className="diag-split__legend">
        <span><span className="diag-split__dot" style={{ background: "#388bfd" }} /> Train {trainPct}%</span>
        <span><span className="diag-split__dot" style={{ background: "#8b5cf6" }} /> Val {valPct}%</span>
        <span><span className="diag-split__dot" style={{ background: "#06b6d4" }} /> Test {testPct}%</span>
      </div>
    </div>
  );
}

function EpochChart({ losses = [], label = "GRU Training History (Real Epoch Loss)" }) {
  if (!losses.length) return null;
  const max = Math.max(...losses, 0.001);
  // Show max 15 epochs for readability
  const displayLosses = losses.length > 15
    ? losses.filter((_, i) => i % Math.ceil(losses.length / 15) === 0 || i === losses.length - 1)
    : losses;

  return (
    <div className="diag-epoch">
      <h4 className="section-title">{label}</h4>
      <div className="diag-epoch__chart">
        {displayLosses.map((loss, i) => (
          <div key={i} className="diag-epoch__col">
            <div className="diag-epoch__bar-wrap">
              <div
                className="diag-epoch__bar"
                style={{ height: `${(loss / max) * 100}%`, background: "#388bfd" }}
              />
            </div>
            <span className="diag-epoch__label">{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="diag-epoch__axis">Epoch →</div>
    </div>
  );
}

export default function GRUDiagnosticsPanel({ gru, split, accepted, acceptanceReason }) {
  if (!gru) return null;

  const mseRule = gru.mse <= (gru.mse_threshold ?? 0.05);
  const maeRule = gru.mae <= (gru.mae_threshold ?? 0.05);

  return (
    <div className="diag-panel diag-panel--gru fade-in">
      <h3 className="diag-panel__title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#388bfd" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        GRU Model Diagnostics
      </h3>

      {/* Acceptance Criterion */}
      <div className="diag-accept dark-card">
        <h4 className="section-title">Acceptance Criterion</h4>
        <div className="diag-accept__rules">
          <div className="diag-accept__rule">
            <span className={mseRule ? "diag-accept__check--pass" : "diag-accept__check--fail"}>
              {mseRule ? "✓" : "✗"}
            </span>
            <span className="mono">MSE {gru.mse.toFixed(6)} ≤ threshold {(gru.mse_threshold ?? 0.05).toFixed(6)}</span>
          </div>
          <div className="diag-accept__or">OR</div>
          <div className="diag-accept__rule">
            <span className={maeRule ? "diag-accept__check--pass" : "diag-accept__check--fail"}>
              {maeRule ? "✓" : "✗"}
            </span>
            <span className="mono">MAE {gru.mae.toFixed(6)} ≤ threshold {(gru.mae_threshold ?? 0.05).toFixed(6)}</span>
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
      <div className="diag-metrics-row">
        <MetricCard name="MSE" value={gru.mse} threshold={gru.mse_threshold ?? 0.05} passed={mseRule} />
        <MetricCard name="MAE" value={gru.mae} threshold={gru.mae_threshold ?? 0.05} passed={maeRule} />
      </div>

      {/* Split Bar */}
      <SplitBar split={split} />

      {/* Training History */}
      <EpochChart losses={gru.val_loss_curve || gru.train_loss_curve || []} />
    </div>
  );
}

export { SplitBar, MetricCard };
