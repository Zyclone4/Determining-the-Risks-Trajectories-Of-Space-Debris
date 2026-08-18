# GRU vs Random Forest — Model Comparison

Dataset: 1233 objects (863 train / 184 val / 186 test)

**Chosen model:** RandomForest  
**Accepted:** False  
**Reason:** All conditions failed

## GRU (regression)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| MSE | 0.024875 | <= 0.05 | PASS |
| MAE | 0.129451 | <= 0.05 | FAIL |

**Compliance (MSE AND MAE):** FAILED

## Random Forest (classification)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| Precision | 0.5659 | >= 0.85 | FAIL |
| Recall | 0.5430 | >= 0.8 | FAIL |
| F1 | 0.5524 | >= 0.82 | FAIL |
| OOB error | 0.4716 | -- | -- |

**Compliance (P AND R AND F1):** FAILED

### RF per-class metrics

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Safe | 0.5246 | 0.5614 | 0.5424 |
| Watch | 0.6531 | 0.5818 | 0.6154 |
| Critical | 0.1852 | 0.2632 | 0.2174 |

### RF feature importances

| Feature | Importance |
|---|---|
| perigee_alt_km | 0.1785 |
| inclination_deg | 0.1767 |
| shell_density | 0.1711 |
| rel_velocity_km_s | 0.1694 |
| apogee_alt_km | 0.1601 |
| eccentricity | 0.1441 |

## Summary

Under non-circular features and labels, neither model met its compliance thresholds: GRU passed MSE (0.0249 <= 0.05) but failed MAE (0.1295 > 0.05); RF failed all three classification thresholds (P=0.57, R=0.54, F1=0.55), with the Critical class (smallest, hardest) performing worst (F1=0.22). RF's feature importances are now evenly distributed (0.14-0.18 each) rather than dominated by a single circular feature, consistent with a model learning a genuinely harder task after label-leakage removal.