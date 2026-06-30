/**
 * Space Debris Dashboard — Backend Server
 *
 * Express API server that:
 *   - Authenticates with Space-Track.org
 *   - Fetches TLE data for 5 catalog groups
 *   - Propagates orbits using SGP4
 *   - Computes collision risk scores
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const routes = require("./src/routes");

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API routes
app.use("/api", routes);

// Root route
app.get("/", (req, res) => {
  res.json({
    name: "Space Debris Dashboard API",
    version: "1.0.0",
    endpoints: {
      health: "GET /api/health",
      debris: "GET /api/debris",
      propagate: "GET /api/propagate/:noradId",
      risks: "GET /api/risks",
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🛰️  Space Debris Dashboard API`);
  console.log(`   Server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(
    `   Space-Track user: ${process.env.SPACETRACK_USER || "NOT SET"}\n`
  );
});
