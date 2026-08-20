# GRU vs Random Forest — Model Comparison

Dataset: 1232 objects (862 train / 184 val / 186 test)

**Chosen model:** RandomForest  
**Accepted:** False  
**Reason:** All conditions failed

## GRU (regression)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| MSE | 0.018728 | <= 0.05 | PASS |
| MAE | 0.110992 | <= 0.05 | FAIL |

**Compliance (MSE AND MAE):** FAILED

## Random Forest (classification)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| Precision | 0.5956 | >= 0.85 | FAIL |
| Recall | 0.5968 | >= 0.8 | FAIL |
| F1 | 0.5950 | >= 0.82 | FAIL |
| OOB error | 0.4432 | -- | -- |

**Compliance (P AND R AND F1):** FAILED

### RF per-class metrics

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Safe | 0.5882 | 0.6667 | 0.6250 |
| Watch | 0.6768 | 0.6381 | 0.6569 |
| Critical | 0.2105 | 0.1905 | 0.2000 |

### RF feature importances

| Feature | Importance |
|---|---|
| shell_density | 0.1592 |
| perigee_alt_km | 0.1542 |
| pairwise_rel_velocity_km_s | 0.1483 |
| own_speed_km_s | 0.1476 |
| apogee_alt_km | 0.1429 |
| inclination_deg | 0.1313 |
| eccentricity | 0.1165 |

## Summary

Under non-circular features and labels, neither model met its compliance thresholds: GRU passed MSE (0.0187 <= 0.05) but failed MAE (0.1110 > 0.05); RF failed all three classification thresholds (P=0.60, R=0.60, F1=0.60), with the Critical class (smallest, hardest) performing worst (F1=0.20). RF's feature importances are now evenly distributed (0.14-0.18 each) rather than dominated by a single circular feature, consistent with a model learning a genuinely harder task after label-leakage removal.