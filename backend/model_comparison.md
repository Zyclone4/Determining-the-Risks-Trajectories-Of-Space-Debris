# GRU vs Random Forest — Model Comparison

Dataset: 1232 objects (862 train / 184 val / 186 test)

**Chosen model:** RandomForest  
**Accepted:** False  
**Reason:** All conditions failed

## GRU (regression)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| MSE | 0.020294 | <= 0.05 | PASS |
| MAE | 0.119713 | <= 0.05 | FAIL |

**Compliance (MSE AND MAE):** FAILED

## Random Forest (classification)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| Precision | 0.5815 | >= 0.85 | FAIL |
| Recall | 0.5699 | >= 0.8 | FAIL |
| F1 | 0.5722 | >= 0.82 | FAIL |
| OOB error | 0.4513 | -- | -- |

**Compliance (P AND R AND F1):** FAILED

### RF per-class metrics

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Safe | 0.5152 | 0.6415 | 0.5714 |
| Watch | 0.6809 | 0.5981 | 0.6368 |
| Critical | 0.3077 | 0.3077 | 0.3077 |

### RF feature importances

| Feature | Importance |
|---|---|
| pairwise_rel_velocity_km_s | 0.1540 |
| shell_density | 0.1380 |
| perigee_alt_km | 0.1313 |
| apogee_alt_km | 0.1263 |
| own_speed_km_s | 0.1246 |
| inclination_deg | 0.1107 |
| knn_congestion_t0 | 0.1106 |
| eccentricity | 0.1045 |

## Summary

Under non-circular features and labels, neither model met its compliance thresholds: GRU passed MSE (0.0203 <= 0.05) but failed MAE (0.1197 > 0.05); RF failed all three classification thresholds (P=0.58, R=0.57, F1=0.57), with the Critical class (smallest, hardest) performing worst (F1=0.31). RF's feature importances are now evenly distributed (0.14-0.18 each) rather than dominated by a single circular feature, consistent with a model learning a genuinely harder task after label-leakage removal.