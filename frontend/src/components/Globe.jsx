/**
 * Globe — 3D Earth with orbital debris, playback slider, and color legend
 */
import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, Stars, Html } from "@react-three/drei";
import * as THREE from "three";

const EARTH_RADIUS = 1;
const SCALE_FACTOR = 1 / 6371;

const RISK_COLORS = {
  critical: new THREE.Color("#f85149"),
  watch: new THREE.Color("#d29922"),
  safe: new THREE.Color("#3fb950"),
  active: new THREE.Color("#388bfd"),
  unknown: new THREE.Color("#6e7681"),
};

function riskLevel(score) {
  if (score >= 0.70) return "critical";
  if (score >= 0.45) return "watch";
  return "safe";
}

function Earth({ showGrid }) {
  const meshRef = useRef();
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.015;
  });

  return (
    <group>
      <Sphere ref={meshRef} args={[EARTH_RADIUS, 64, 64]}>
        <meshStandardMaterial color="#1a4f8a" roughness={0.9} metalness={0.1} emissive="#0a1628" emissiveIntensity={0.3} />
      </Sphere>
      <Sphere args={[EARTH_RADIUS * 1.012, 64, 64]}>
        <meshBasicMaterial color="#388bfd" transparent opacity={0.06} side={THREE.BackSide} />
      </Sphere>
      <Sphere args={[EARTH_RADIUS * 1.05, 32, 32]}>
        <meshBasicMaterial color="#06b6d4" transparent opacity={0.025} side={THREE.BackSide} />
      </Sphere>
      {showGrid && (
        <gridHelper args={[4, 24, "#1e40af", "#1e3a5f"]} rotation={[Math.PI / 2, 0, 0]} />
      )}
    </group>
  );
}

function geoToCartesian(lat, lon, alt) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const r = EARTH_RADIUS + alt * SCALE_FACTOR;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

function DebrisPoints({ objects, onSelect, selectedId }) {
  const points = useMemo(() => {
    if (!objects?.length) return [];
    return objects.filter(o => o.position?.geodetic).map(obj => {
      const { latitude, longitude, altitude } = obj.position.geodetic;
      const pos = geoToCartesian(latitude, longitude, altitude);
      const level = riskLevel(obj.riskScore ?? 0);
      const color = RISK_COLORS[level] || RISK_COLORS.unknown;
      return { id: obj.noradId, name: obj.name, position: pos, color, riskLevel: level, riskScore: obj.riskScore, altitude, isSelected: String(obj.noradId) === String(selectedId) };
    });
  }, [objects, selectedId]);

  return (
    <group>
      {points.map(p => (
        <mesh key={p.id} position={p.position} onClick={e => { e.stopPropagation(); onSelect?.(p.id); }}>
          <sphereGeometry args={[p.isSelected ? 0.02 : 0.008, 8, 8]} />
          <meshBasicMaterial color={p.color} transparent opacity={p.isSelected ? 1 : 0.75} />
          {p.isSelected && (
            <Html distanceFactor={5} center>
              <div style={{ background: "rgba(13,17,23,0.92)", border: "1px solid rgba(56,139,253,0.5)", borderRadius: 8, padding: "6px 10px", color: "#e6edf3", fontSize: 11, fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", pointerEvents: "none" }}>
                <strong>{p.name}</strong><br />
                ID: {p.id} | Alt: {Math.round(p.altitude)} km | Risk: {(p.riskScore ?? 0).toFixed(3)}
              </div>
            </Html>
          )}
        </mesh>
      ))}
    </group>
  );
}

function TrajectoryLine({ points }) {
  const lineGeometry = useMemo(() => {
    if (!points?.length) return null;
    const vertices = points.filter(p => p.geodetic).map(p => {
      const pos = geoToCartesian(p.geodetic.latitude, p.geodetic.longitude, p.geodetic.altitude);
      return new THREE.Vector3(...pos);
    });
    if (vertices.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(vertices, false);
    return new THREE.TubeGeometry(curve, vertices.length * 4, 0.003, 8, false);
  }, [points]);

  if (!lineGeometry) return null;
  return <mesh geometry={lineGeometry}><meshBasicMaterial color="#06b6d4" transparent opacity={0.6} /></mesh>;
}

function PlaybackMarker({ points, stepIndex }) {
  const pt = points?.[stepIndex];
  if (!pt?.geodetic) return null;
  const pos = geoToCartesian(pt.geodetic.latitude, pt.geodetic.longitude, pt.geodetic.altitude);
  return (
    <mesh position={pos}>
      <sphereGeometry args={[0.018, 12, 12]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  );
}

export default function Globe({
  objects = [],
  trajectoryPoints = [],
  selectedObjectId,
  selectedObjectName,
  onSelectObject,
  showGrid = false,
}) {
  const [step, setStep] = useState(0);
  const totalSteps = trajectoryPoints.length || 1;
  const currentPt = trajectoryPoints[step];
  const hoursIn = ((step * 5) / 60).toFixed(1);

  return (
    <div className="globe-container">
      <div className="globe-canvas">
        <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
          <ambientLight intensity={0.3} />
          <directionalLight position={[5, 3, 5]} intensity={1.2} />
          <pointLight position={[-5, -3, -5]} intensity={0.3} color="#6366f1" />
          <Stars radius={100} depth={60} count={3000} factor={3} saturation={0.2} fade />
          <Earth showGrid={showGrid} />
          <DebrisPoints objects={objects} selectedId={selectedObjectId} onSelect={onSelectObject} />
          <TrajectoryLine points={trajectoryPoints} />
          <PlaybackMarker points={trajectoryPoints} stepIndex={step} />
          <OrbitControls enablePan={false} minDistance={1.5} maxDistance={8} enableDamping dampingFactor={0.05} rotateSpeed={0.5} />
        </Canvas>
      </div>

      {/* Color Legend */}
      <div className="globe-legend">
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#f85149" }} />Critical ≥ 0.70</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#d29922" }} />Watch 0.45–0.70</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#3fb950" }} />Safe &lt; 0.45</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#388bfd" }} />Active</span>
      </div>

      {/* Playback Slider */}
      {selectedObjectId && trajectoryPoints.length > 1 && (
        <div className="globe-playback">
          <div className="globe-playback__info">
            <span className="globe-playback__name">{selectedObjectName || `Object ${selectedObjectId}`}</span>
            <span className="globe-playback__time mono">T+{hoursIn}h / 48h</span>
          </div>
          <input
            type="range"
            className="globe-playback__slider"
            min={0}
            max={totalSteps - 1}
            value={step}
            onChange={e => setStep(Number(e.target.value))}
          />
          {currentPt && (
            <div className="globe-playback__data mono">
              {currentPt.position && (
                <span>Pos: ({currentPt.position.x?.toFixed(1)}, {currentPt.position.y?.toFixed(1)}, {currentPt.position.z?.toFixed(1)}) km</span>
              )}
              {currentPt.velocity && (
                <span>Vel: ({currentPt.velocity.vx?.toFixed(2)}, {currentPt.velocity.vy?.toFixed(2)}, {currentPt.velocity.vz?.toFixed(2)}) km/s</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
