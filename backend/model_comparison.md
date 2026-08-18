# GRU vs Random Forest — Model Comparison

Dataset: 1233 objects (863 train / 184 val / 186 test)

**Chosen model:** RandomForest  
**Accepted:** False  
**Reason:** All conditions failed

## GRU (regression)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| MSE | 0.027392 | <= 0.05 | PASS |
| MAE | 0.135071 | <= 0.05 | FAIL |

**Compliance (MSE AND MAE):** FAILED

## Random Forest (classification)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| Precision | 0.5766 | >= 0.85 | FAIL |
| Recall | 0.5699 | >= 0.8 | FAIL |
| F1 | 0.5723 | >= 0.82 | FAIL |
| OOB error | 0.4241 | -- | -- |

**Compliance (P AND R AND F1):** FAILED

### RF per-class metrics

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Safe | 0.5439 | 0.6078 | 0.5741 |
| Watch | 0.6731 | 0.6306 | 0.6512 |
| Critical | 0.2000 | 0.2083 | 0.2041 |

### RF feature importances

| Feature | Importance |
|---|---|
| pairwise_rel_velocity_km_s | 0.1725 |
| shell_density | 0.1530 |
| inclination_deg | 0.1508 |
| perigee_alt_km | 0.1369 |
| apogee_alt_km | 0.1342 |
| rel_velocity_km_s | 0.1305 |
| eccentricity | 0.1221 |

## Summary

Under non-circular features and labels, neither model met its compliance thresholds: GRU passed MSE (0.0274 <= 0.05) but failed MAE (0.1351 > 0.05); RF failed all three classification thresholds (P=0.58, R=0.57, F1=0.57), with the Critical class (smallest, hardest) performing worst (F1=0.20). RF's feature importances are now evenly distributed (0.14-0.18 each) rather than dominated by a single circular feature, consistent with a model learning a genuinely harder task after label-leakage removal.