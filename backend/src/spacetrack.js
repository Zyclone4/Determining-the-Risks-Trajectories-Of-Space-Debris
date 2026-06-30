/**
 * Space-Track.org API Client
 *
 * Handles authentication (cookie-based sessions) and fetching TLE data
 * for the 5 catalog groups:
 *   1. Active Satellites (PAYLOAD)
 *   2. Fengyun-1C Debris
 *   3. Cosmos 2251 Debris
 *   4. Iridium 33 Debris
 *   5. Analyst Objects (TBA)
 */

const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");

const BASE_URL = "https://www.space-track.org";
const AUTH_URL = `${BASE_URL}/ajaxauth/login`;
const GP_URL = `${BASE_URL}/basicspacedata/query`;

// Rate-limit: 1 request every 2 seconds
const THROTTLE_MS = 2000;

// Catalog group query definitions
const CATALOG_QUERIES = {
  activeSatellites: {
    label: "Active Satellites",
    path: "/class/gp/OBJECT_TYPE/PAYLOAD/DECAY_DATE/null-val/orderby/NORAD_CAT_ID/limit/500/format/json",
  },
  fengyun1c: {
    label: "Fengyun-1C Debris",
    // Search for debris objects from the Fengyun-1C ASAT test
    path: "/class/gp/OBJECT_NAME/~~FENGYUN 1C/OBJECT_TYPE/DEBRIS/DECAY_DATE/null-val/orderby/NORAD_CAT_ID/limit/500/format/json",
  },
  cosmos2251: {
    label: "Cosmos 2251 Debris",
    path: "/class/gp/OBJECT_NAME/~~COSMOS 2251/OBJECT_TYPE/DEBRIS/DECAY_DATE/null-val/orderby/NORAD_CAT_ID/limit/500/format/json",
  },
  iridium33: {
    label: "Iridium 33 Debris",
    path: "/class/gp/OBJECT_NAME/~~IRIDIUM 33/OBJECT_TYPE/DEBRIS/DECAY_DATE/null-val/orderby/NORAD_CAT_ID/limit/500/format/json",
  },
  analystObjects: {
    label: "Analyst Objects",
    path: "/class/gp/OBJECT_TYPE/TBA/DECAY_DATE/null-val/orderby/NORAD_CAT_ID/limit/500/format/json",
  },
};

class SpaceTrackClient {
  constructor() {
    this.cookieJar = new CookieJar();
    this.client = wrapper(
      axios.create({
        jar: this.cookieJar,
        withCredentials: true,
        timeout: 30000,
      })
    );
    this.authenticated = false;
    this.lastRequestTime = 0;
  }

  /**
   * Authenticate with Space-Track.org using credentials from .env
   */
  async login() {
    const identity = process.env.SPACETRACK_USER;
    const password = process.env.SPACETRACK_PASS;

    if (!identity || !password) {
      throw new Error(
        "Missing SPACETRACK_USER or SPACETRACK_PASS in .env file"
      );
    }

    try {
      console.log("[SpaceTrack] Authenticating...");
      const response = await this.client.post(
        AUTH_URL,
        new URLSearchParams({ identity, password }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      if (
        response.status === 200 &&
        !String(response.data).includes("Failed")
      ) {
        this.authenticated = true;
        console.log("[SpaceTrack] Authentication successful");
        return true;
      }

      throw new Error(`Authentication failed: ${response.data}`);
    } catch (error) {
      this.authenticated = false;
      throw new Error(`Space-Track login error: ${error.message}`);
    }
  }

  /**
   * Throttle requests to respect Space-Track rate limits
   */
  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < THROTTLE_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, THROTTLE_MS - elapsed)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Make an authenticated request to the Space-Track API
   * Re-authenticates on 401 responses
   */
  async request(path) {
    if (!this.authenticated) {
      await this.login();
    }

    await this.throttle();

    try {
      const url = `${GP_URL}${path}`;
      console.log(`[SpaceTrack] Fetching: ${url}`);
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      // Re-authenticate on 401 and retry once
      if (error.response && error.response.status === 401) {
        console.log("[SpaceTrack] Session expired, re-authenticating...");
        await this.login();
        await this.throttle();
        const url = `${GP_URL}${path}`;
        const response = await this.client.get(url);
        return response.data;
      }
      throw error;
    }
  }

  /**
   * Fetch TLE data for a specific catalog group
   * @param {string} catalogKey - One of: activeSatellites, fengyun1c, cosmos2251, iridium33, analystObjects
   * @returns {Array} Array of GP (General Perturbations) records
   */
  async fetchCatalog(catalogKey) {
    const catalog = CATALOG_QUERIES[catalogKey];
    if (!catalog) {
      throw new Error(`Unknown catalog: ${catalogKey}`);
    }

    console.log(`[SpaceTrack] Fetching catalog: ${catalog.label}`);
    const data = await this.request(catalog.path);
    console.log(
      `[SpaceTrack] Received ${Array.isArray(data) ? data.length : 0} records for ${catalog.label}`
    );
    return data;
  }

  /**
   * Fetch all catalog groups
   * @returns {Object} Keyed by catalog name, each value is an array of GP records
   */
  async fetchAllCatalogs() {
    const results = {};

    for (const [key, catalog] of Object.entries(CATALOG_QUERIES)) {
      try {
        results[key] = {
          label: catalog.label,
          data: await this.fetchCatalog(key),
        };
      } catch (error) {
        console.error(
          `[SpaceTrack] Error fetching ${catalog.label}: ${error.message}`
        );
        results[key] = {
          label: catalog.label,
          data: [],
          error: error.message,
        };
      }
    }

    return results;
  }
}

// Singleton instance
const spaceTrackClient = new SpaceTrackClient();

module.exports = { spaceTrackClient, CATALOG_QUERIES };
