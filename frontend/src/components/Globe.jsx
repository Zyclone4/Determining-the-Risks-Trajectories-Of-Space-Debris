/**
 * Globe — 3D Earth with orbital debris visualization
 *
 * Uses Three.js via @react-three/fiber and @react-three/drei.
 * Renders Earth sphere with debris points color-coded by risk level.
 */

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, Stars, Html } from "@react-three/drei";
import * as THREE from "three";

const EARTH_RADIUS = 1;
const SCALE_FACTOR = 1 / 6371; // Convert km to scene units

// Risk level colors
const RISK_COLORS = {
  critical: new THREE.Color("#ef4444"),
  warning: new THREE.Color("#f59e0b"),
  caution: new THREE.Color("#eab308"),
  nominal: new THREE.Color("#22c55e"),
  unknown: new THREE.Color("#64748b"),
};

/**
 * Earth sphere with atmosphere glow
 */
function Earth() {
  const meshRef = useRef();

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <group>
      {/* Earth body */}
      <Sphere ref={meshRef} args={[EARTH_RADIUS, 64, 64]}>
        <meshStandardMaterial
          color="#1a4f8a"
          roughness={0.9}
          metalness={0.1}
          emissive="#0a1628"
          emissiveIntensity={0.3}
        />
      </Sphere>

      {/* Atmosphere glow */}
      <Sphere args={[EARTH_RADIUS * 1.015, 64, 64]}>
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Outer glow */}
      <Sphere args={[EARTH_RADIUS * 1.06, 32, 32]}>
        <meshBasicMaterial
          color="#06b6d4"
          transparent
          opacity={0.03}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Grid lines (latitude/longitude) */}
      <gridHelper
        args={[4, 24, "#1e40af", "#1e3a5f"]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      />
    </group>
  );
}

/**
 * Convert geodetic coordinates (lat, lon, alt) to 3D position
 */
function geoToCartesian(lat, lon, alt) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const r = EARTH_RADIUS + alt * SCALE_FACTOR;

  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Debris point cloud — renders all objects as instanced points
 */
function DebrisPoints({ objects, onSelect, selectedId }) {
  const points = useMemo(() => {
    if (!objects || objects.length === 0) return [];

    return objects
      .filter((obj) => obj.position?.geodetic)
      .map((obj) => {
        const { latitude, longitude, altitude } = obj.position.geodetic;
        const pos = geoToCartesian(latitude, longitude, altitude);
        const color = RISK_COLORS[obj.riskLevel] || RISK_COLORS.unknown;

        return {
          id: obj.noradId,
          name: obj.name,
          position: pos,
          color,
          riskLevel: obj.riskLevel,
          riskScore: obj.riskScore,
          altitude,
          isSelected: String(obj.noradId) === String(selectedId),
        };
      });
  }, [objects, selectedId]);

  return (
    <group>
      {points.map((point) => (
        <mesh
          key={point.id}
          position={point.position}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(point.id);
          }}
        >
          <sphereGeometry args={[point.isSelected ? 0.02 : 0.008, 8, 8]} />
          <meshBasicMaterial
            color={point.color}
            transparent
            opacity={point.isSelected ? 1 : 0.8}
          />
          {point.isSelected && (
            <Html distanceFactor={5} center>
              <div
                style={{
                  background: "rgba(10, 14, 26, 0.9)",
                  border: "1px solid rgba(59, 130, 246, 0.5)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  color: "#f1f5f9",
                  fontSize: "11px",
                  fontFamily: "Inter, sans-serif",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                <strong>{point.name}</strong>
                <br />
                ID: {point.id} | Alt: {Math.round(point.altitude)} km
              </div>
            </Html>
          )}
        </mesh>
      ))}
    </group>
  );
}

/**
 * Orbit trajectory line for a selected object
 */
function TrajectoryLine({ points }) {
  const lineGeometry = useMemo(() => {
    if (!points || points.length === 0) return null;

    const vertices = points
      .filter((p) => p.geodetic)
      .map((p) => {
        const pos = geoToCartesian(
          p.geodetic.latitude,
          p.geodetic.longitude,
          p.geodetic.altitude
        );
        return new THREE.Vector3(...pos);
      });

    if (vertices.length < 2) return null;

    const curve = new THREE.CatmullRomCurve3(vertices, false);
    const geometry = new THREE.TubeGeometry(curve, vertices.length * 4, 0.003, 8, false);
    return geometry;
  }, [points]);

  if (!lineGeometry) return null;

  return (
    <mesh geometry={lineGeometry}>
      <meshBasicMaterial color="#06b6d4" transparent opacity={0.6} />
    </mesh>
  );
}

/**
 * Main Globe component
 */
export default function Globe({
  objects = [],
  trajectoryPoints = [],
  selectedObjectId,
  onSelectObject,
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "transparent",
        borderRadius: "16px",
        overflow: "hidden",
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        style={{ background: "transparent" }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 3, 5]} intensity={1.2} />
        <pointLight position={[-5, -3, -5]} intensity={0.3} color="#6366f1" />

        {/* Starfield */}
        <Stars
          radius={100}
          depth={60}
          count={3000}
          factor={3}
          saturation={0.2}
          fade
        />

        {/* Earth */}
        <Earth />

        {/* Debris objects */}
        <DebrisPoints
          objects={objects}
          selectedId={selectedObjectId}
          onSelect={onSelectObject}
        />

        {/* Selected object trajectory */}
        <TrajectoryLine points={trajectoryPoints} />

        {/* Camera controls */}
        <OrbitControls
          enablePan={false}
          minDistance={1.5}
          maxDistance={8}
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
}
