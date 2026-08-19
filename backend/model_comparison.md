# GRU vs Random Forest — Model Comparison

Dataset: 1233 objects (863 train / 184 val / 186 test)

**Chosen model:** RandomForest  
**Accepted:** False  
**Reason:** All conditions failed

## GRU (regression)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| MSE | 0.018410 | <= 0.05 | PASS |
| MAE | 0.110304 | <= 0.05 | FAIL |

**Compliance (MSE AND MAE):** FAILED

## Random Forest (classification)

| Metric | Value | Threshold | Result |
|---|---|---|---|
| Precision | 0.6316 | >= 0.85 | FAIL |
| Recall | 0.6183 | >= 0.8 | FAIL |
| F1 | 0.6223 | >= 0.82 | FAIL |
| OOB error | 0.4090 | -- | -- |

**Compliance (P AND R AND F1):** FAILED

### RF per-class metrics

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Safe | 0.5692 | 0.6727 | 0.6167 |
| Watch | 0.7228 | 0.6460 | 0.6822 |
| Critical | 0.2500 | 0.2778 | 0.2632 |

### RF feature importances

| Feature | Importance |
|---|---|
| pairwise_rel_velocity_km_s | 0.1818 |
| shell_density | 0.1510 |
| apogee_alt_km | 0.1400 |
| perigee_alt_km | 0.1354 |
| rel_velocity_km_s | 0.1349 |
| eccentricity | 0.1305 |
| inclination_deg | 0.1263 |

## Summary

Under non-circular features and labels, neither model met its compliance thresholds: GRU passed MSE (0.0184 <= 0.05) but failed MAE (0.1103 > 0.05); RF failed all three classification thresholds (P=0.63, R=0.62, F1=0.62), with the Critical class (smallest, hardest) performing worst (F1=0.26). RF's feature importances are now evenly distributed (0.14-0.18 each) rather than dominated by a single circular feature, consistent with a model learning a genuinely harder task after label-leakage removal.