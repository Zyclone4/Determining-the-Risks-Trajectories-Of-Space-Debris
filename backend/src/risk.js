/**
 * Risk Scoring Engine
 *
 * Computes a normalized 0–1 risk score for each orbital object based on:
 *   - Minimum approach distance to active satellites
 *   - Relative velocity at closest approach
 *   - Perigee altitude (lower = higher risk from atmospheric drag/decay)
 *
 * Placeholder for future GRU model integration.
 */

// Risk thresholds
const PROXIMITY_CRITICAL_KM = 1; // < 1 km = critical
const PROXIMITY_WARNING_KM = 10; // < 10 km = warning
const PROXIMITY_CAUTION_KM = 50; // < 50 km = caution
const LOW_ALTITUDE_KM = 300; // Below 300 km = elevated decay risk

/**
 * Calculate Euclidean distance between two ECI position vectors
 * @param {Object} pos1 - { x, y, z } in km
 * @param {Object} pos2 - { x, y, z } in km
 * @returns {number} Distance in km
 */
function eciDistance(pos1, pos2) {
  return Math.sqrt(
    (pos1.x - pos2.x) ** 2 +
    (pos1.y - pos2.y) ** 2 +
    (pos1.z - pos2.z) ** 2
  );
}

/**
 * Calculate relative velocity magnitude between two objects
 * @param {Object} vel1 - { vx, vy, vz } in km/s
 * @param {Object} vel2 - { vx, vy, vz } in km/s
 * @returns {number} Relative speed in km/s
 */
function relativeSpeed(vel1, vel2) {
  return Math.sqrt(
    (vel1.vx - vel2.vx) ** 2 +
    (vel1.vy - vel2.vy) ** 2 +
    (vel1.vz - vel2.vz) ** 2
  );
}

/**
 * Score proximity risk on a 0–1 scale
 * @param {number} distanceKm - Minimum approach distance in km
 * @returns {number} Risk score (1 = critical, 0 = negligible)
 */
function proximityScore(distanceKm) {
  if (distanceKm <= PROXIMITY_CRITICAL_KM) return 1.0;
  if (distanceKm <= PROXIMITY_WARNING_KM) {
    return 0.7 + 0.3 * (1 - distanceKm / PROXIMITY_WARNING_KM);
  }
  if (distanceKm <= PROXIMITY_CAUTION_KM) {
    return 0.3 + 0.4 * (1 - distanceKm / PROXIMITY_CAUTION_KM);
  }
  if (distanceKm <= 200) {
    return 0.3 * (1 - distanceKm / 200);
  }
  return 0;
}

/**
 * Score velocity risk on a 0–1 scale
 * Higher relative velocity = more destructive collision energy
 * @param {number} relVelKmS - Relative velocity in km/s
 * @returns {number} Risk score
 */
function velocityScore(relVelKmS) {
  // Typical LEO collision speeds: 7–15 km/s
  const maxVel = 15;
  return Math.min(relVelKmS / maxVel, 1.0);
}

/**
 * Score altitude risk on a 0–1 scale
 * Low perigee = higher atmospheric drag = less predictable orbit
 * @param {number} perigeeKm - Perigee altitude in km
 * @returns {number} Risk score
 */
function altitudeScore(perigeeKm) {
  if (perigeeKm <= 150) return 1.0; // Imminent re-entry
  if (perigeeKm <= LOW_ALTITUDE_KM) {
    return 0.3 + 0.7 * (1 - perigeeKm / LOW_ALTITUDE_KM);
  }
  if (perigeeKm <= 600) {
    return 0.1 * (1 - perigeeKm / 600);
  }
  return 0;
}

/**
 * Compute risk scores for debris objects relative to active satellites
 *
 * @param {Array} debrisPositions - Propagated debris objects with .position.eci and .position.velocity
 * @param {Array} satellitePositions - Propagated active satellite objects
 * @returns {Array} Debris objects annotated with riskScore, riskLevel, and closest approach info
 */
function computeRiskScores(debrisPositions, satellitePositions) {
  return debrisPositions.map((debris) => {
    let minDistance = Infinity;
    let closestSatellite = null;
    let closestRelVelocity = 0;

    const debrisPos = debris.position?.eci;
    const debrisVel = debris.position?.velocity;

    if (!debrisPos || !debrisVel) {
      return {
        ...debris,
        riskScore: 0,
        riskLevel: "unknown",
        closestApproach: null,
      };
    }

    // Find closest active satellite
    for (const sat of satellitePositions) {
      const satPos = sat.position?.eci;
      const satVel = sat.position?.velocity;
      if (!satPos || !satVel) continue;

      const dist = eciDistance(debrisPos, satPos);
      if (dist < minDistance) {
        minDistance = dist;
        closestSatellite = sat;
        closestRelVelocity = relativeSpeed(debrisVel, satVel);
      }
    }

    // Calculate component scores
    const pScore = proximityScore(minDistance);
    const vScore = velocityScore(closestRelVelocity);

    // Use perigee from orbital elements if available
    const perigee = debris.orbitalElements?.periapsis ?? debris.position?.geodetic?.altitude ?? 500;
    const aScore = altitudeScore(perigee);

    // Weighted combination
    // Proximity is most important (50%), then velocity (30%), then altitude (20%)
    const riskScore = Math.min(
      0.5 * pScore + 0.3 * vScore + 0.2 * aScore,
      1.0
    );

    // Classify risk level
    let riskLevel;
    if (riskScore >= 0.7) riskLevel = "critical";
    else if (riskScore >= 0.4) riskLevel = "warning";
    else if (riskScore >= 0.15) riskLevel = "caution";
    else riskLevel = "nominal";

    return {
      ...debris,
      riskScore: Math.round(riskScore * 1000) / 1000,
      riskLevel,
      closestApproach: closestSatellite
        ? {
            distanceKm: Math.round(minDistance * 100) / 100,
            relativeVelocityKmS: Math.round(closestRelVelocity * 1000) / 1000,
            satelliteId: closestSatellite.noradId,
            satelliteName: closestSatellite.name,
          }
        : null,
    };
  });
}

module.exports = { computeRiskScores, eciDistance, relativeSpeed };
