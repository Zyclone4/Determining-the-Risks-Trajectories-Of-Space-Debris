/**
 * SGP4 Orbit Propagator
 *
 * Uses satellite.js to propagate TLE orbital elements to position/velocity
 * vectors in TEME frame, then converts to geodetic (lat/lon/alt) for map
 * display and ECI for 3D visualization.
 *
 * Default propagation: 5-minute intervals over 90 minutes (1 full orbit).
 */

const satellite = require("satellite.js");

// Earth radius in km
const EARTH_RADIUS_KM = 6371;

/**
 * Propagate a single object from its TLE data
 *
 * @param {Object} gpRecord - A GP (General Perturbations) record from Space-Track
 * @param {Object} options - Propagation options
 * @param {number} options.intervalMinutes - Time step in minutes (default: 5)
 * @param {number} options.durationMinutes - Total propagation window in minutes (default: 90)
 * @param {Date}   options.startTime - Start time for propagation (default: now)
 * @returns {Object} Propagation result with trajectory points
 */
function propagateObject(gpRecord, options = {}) {
  const {
    intervalMinutes = 5,
    durationMinutes = 90,
    startTime = new Date(),
  } = options;

  const tleLine1 = gpRecord.TLE_LINE1;
  const tleLine2 = gpRecord.TLE_LINE2;

  if (!tleLine1 || !tleLine2) {
    throw new Error(
      `Missing TLE lines for object ${gpRecord.NORAD_CAT_ID || "unknown"}`
    );
  }

  // Initialize satellite record from TLE
  const satrec = satellite.twoline2satrec(tleLine1, tleLine2);

  const trajectoryPoints = [];
  const steps = Math.floor(durationMinutes / intervalMinutes);

  for (let i = 0; i <= steps; i++) {
    const time = new Date(startTime.getTime() + i * intervalMinutes * 60000);

    // Propagate to get position and velocity in TEME frame
    const positionAndVelocity = satellite.propagate(satrec, time);

    if (positionAndVelocity.position === false) {
      // Propagation failed for this time step (e.g., decayed)
      continue;
    }

    const positionEci = positionAndVelocity.position; // km
    const velocityEci = positionAndVelocity.velocity; // km/s

    // Convert to geodetic coordinates
    const gmst = satellite.gstime(time);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);

    const longitude = satellite.degreesLong(positionGd.longitude);
    const latitude = satellite.degreesLat(positionGd.latitude);
    const altitude = positionGd.height; // km above ellipsoid

    // Calculate speed magnitude (km/s)
    const speed = Math.sqrt(
      velocityEci.x ** 2 + velocityEci.y ** 2 + velocityEci.z ** 2
    );

    trajectoryPoints.push({
      time: time.toISOString(),
      // TEME / ECI position (km)
      eci: {
        x: positionEci.x,
        y: positionEci.y,
        z: positionEci.z,
      },
      // TEME / ECI velocity (km/s)
      velocity: {
        vx: velocityEci.x,
        vy: velocityEci.y,
        vz: velocityEci.z,
      },
      // Geodetic
      geodetic: {
        latitude,
        longitude,
        altitude,
      },
      speed,
    });
  }

  return {
    noradId: gpRecord.NORAD_CAT_ID,
    name: gpRecord.OBJECT_NAME,
    objectType: gpRecord.OBJECT_TYPE,
    epoch: gpRecord.EPOCH,
    trajectoryPoints,
    // Orbital elements for reference
    orbitalElements: {
      inclination: parseFloat(gpRecord.INCLINATION),
      eccentricity: parseFloat(gpRecord.ECCENTRICITY),
      raan: parseFloat(gpRecord.RA_OF_ASC_NODE),
      argOfPericenter: parseFloat(gpRecord.ARG_OF_PERICENTER),
      meanMotion: parseFloat(gpRecord.MEAN_MOTION),
      period: gpRecord.PERIOD ? parseFloat(gpRecord.PERIOD) : null,
      apoapsis: gpRecord.APOAPSIS ? parseFloat(gpRecord.APOAPSIS) : null,
      periapsis: gpRecord.PERIAPSIS ? parseFloat(gpRecord.PERIAPSIS) : null,
    },
  };
}

/**
 * Get the current position of an object (single point, no trajectory)
 *
 * @param {Object} gpRecord - A GP record from Space-Track
 * @returns {Object} Current position data
 */
function getCurrentPosition(gpRecord) {
  const result = propagateObject(gpRecord, {
    intervalMinutes: 1,
    durationMinutes: 0,
  });

  if (result.trajectoryPoints.length === 0) {
    return null;
  }

  return {
    noradId: result.noradId,
    name: result.name,
    objectType: result.objectType,
    epoch: result.epoch,
    position: result.trajectoryPoints[0],
    orbitalElements: result.orbitalElements,
  };
}

/**
 * Propagate multiple objects and return current positions
 *
 * @param {Array} gpRecords - Array of GP records
 * @returns {Array} Array of current positions
 */
function propagateBatch(gpRecords) {
  const results = [];

  for (const record of gpRecords) {
    try {
      const pos = getCurrentPosition(record);
      if (pos) {
        results.push(pos);
      }
    } catch (error) {
      // Skip objects that fail to propagate (e.g., invalid TLE)
      console.warn(
        `[Propagator] Failed to propagate ${record.NORAD_CAT_ID}: ${error.message}`
      );
    }
  }

  return results;
}

module.exports = { propagateObject, getCurrentPosition, propagateBatch };
