"""
compare_models.py — GRU vs Random Forest comparison report (methodology item #5)

Reads .cache/models/diagnostics.json (produced by train_model.py) and generates
a markdown comparison table + summary, without re-running training.
"""
import json
from pathlib import Path

CACHE_DIR = Path(__file__).parent / ".cache"
DIAGNOSTICS_PATH = CACHE_DIR / "models" / "diagnostics.json"
OUTPUT_PATH = Path(__file__).parent / "model_comparison.md"


def load_diagnostics():
    with open(DIAGNOSTICS_PATH) as f:
        return json.load(f)


def build_report(d):
    gru = d["gru"]
    rf = d["rf"]
    split = d["split"]

    lines = []
    lines.append("# GRU vs Random Forest — Model Comparison\n")
    lines.append(
        f"Dataset: {split['total']} objects "
        f"({split['train']} train / {split['val']} val / {split['test']} test)\n"
    )
    lines.append(
        f"**Chosen model:** {d['chosen_model']}  \n"
        f"**Accepted:** {d['accepted']}  \n"
        f"**Reason:** {d['acceptance_reason']}\n"
    )

    lines.append("## GRU (regression)\n")
    lines.append("| Metric | Value | Threshold | Result |")
    lines.append("|---|---|---|---|")
    lines.append(
        f"| MSE | {gru['mse']:.6f} | <= {gru['mse_threshold']} | "
        f"{'PASS' if gru['mse_passed'] else 'FAIL'} |"
    )
    lines.append(
        f"| MAE | {gru['mae']:.6f} | <= {gru['mae_threshold']} | "
        f"{'PASS' if gru['mae_passed'] else 'FAIL'} |"
    )
    gru_compliant = gru['mse_passed'] and gru['mae_passed']
    lines.append(
        f"\n**Compliance (MSE AND MAE):** {'PASSED' if gru_compliant else 'FAILED'}\n"
    )

    lines.append("## Random Forest (classification)\n")
    lines.append("| Metric | Value | Threshold | Result |")
    lines.append("|---|---|---|---|")
    lines.append(
        f"| Precision | {rf['precision']:.4f} | >= {rf['precision_threshold']} | "
        f"{'PASS' if rf['precision_passed'] else 'FAIL'} |"
    )
    lines.append(
        f"| Recall | {rf['recall']:.4f} | >= {rf['recall_threshold']} | "
        f"{'PASS' if rf['recall_passed'] else 'FAIL'} |"
    )
    lines.append(
        f"| F1 | {rf['f1']:.4f} | >= {rf['f1_threshold']} | "
        f"{'PASS' if rf['f1_passed'] else 'FAIL'} |"
    )
    lines.append(f"| OOB error | {rf['oob_error']:.4f} | -- | -- |")
    rf_compliant = rf['precision_passed'] and rf['recall_passed'] and rf['f1_passed']
    lines.append(
        f"\n**Compliance (P AND R AND F1):** {'PASSED' if rf_compliant else 'FAILED'}\n"
    )

    lines.append("### RF per-class metrics\n")
    lines.append("| Class | Precision | Recall | F1 |")
    lines.append("|---|---|---|---|")
    for cls, m in rf["per_class"].items():
        lines.append(f"| {cls} | {m['precision']:.4f} | {m['recall']:.4f} | {m['f1']:.4f} |")

    lines.append("\n### RF feature importances\n")
    lines.append("| Feature | Importance |")
    lines.append("|---|---|")
    for feat, imp in sorted(rf["feature_importances"].items(), key=lambda x: -x[1]):
        lines.append(f"| {feat} | {imp:.4f} |")

    lines.append("\n## Summary\n")
    crit_f1 = rf['per_class']['Critical']['f1']
    lines.append(
        f"Under non-circular features and labels, neither model met its compliance "
        f"thresholds: GRU passed MSE ({gru['mse']:.4f} <= {gru['mse_threshold']}) but failed MAE "
        f"({gru['mae']:.4f} > {gru['mae_threshold']}); RF failed all three classification "
        f"thresholds (P={rf['precision']:.2f}, R={rf['recall']:.2f}, F1={rf['f1']:.2f}), "
        f"with the Critical class (smallest, hardest) performing worst "
        f"(F1={crit_f1:.2f}). RF's feature importances are now evenly "
        f"distributed (0.14-0.18 each) rather than dominated by a single circular feature, "
        f"consistent with a model learning a genuinely harder task after label-leakage removal."
    )

    return "\n".join(lines)


def main():
    d = load_diagnostics()
    report = build_report(d)
    with open(OUTPUT_PATH, "w") as f:
        f.write(report)
    print(report)
    print(f"\n\nSaved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
