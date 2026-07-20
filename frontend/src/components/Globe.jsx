/**
 * Globe — 3D Earth with orbital debris, playback slider, and color legend
 */
import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sphere, Stars, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { createPortal } from "react-dom";

const RISK_LINE_COLORS = {
  Critical: "#f85149",
  Watch: "#d29922",
  Safe: "#3fb950",
};

const EARTH_RADIUS = 1;
const SCALE_FACTOR = 1 / 6371;

const RISK_COLORS = {
  critical: new THREE.Color("#f85149"),
  watch: new THREE.Color("#d29922"),
  safe: new THREE.Color("#3fb950"),
  active: new THREE.Color("#38bdf8"),
  unknown: new THREE.Color("#a78bfa"),
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
      {showGrid && <gridHelper args={[4, 24, "#1e40af", "#1e3a5f"]} rotation={[Math.PI / 2, 0, 0]} />}
    </group>
  );
}

function geoToCartesian(lat, lon, alt) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const r = EARTH_RADIUS + alt * SCALE_FACTOR;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

function ScreenPosition({ position, onPosition }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const vec = new THREE.Vector3(...position);
    vec.project(camera);
    const x = (vec.x * 0.5 + 0.5) * size.width;
    const y = (-(vec.y * 0.5) + 0.5) * size.height;
    onPosition({ x, y });
  });
  return null;
}

function DebrisPoints({ objects, onSelect, selectedId, trajectoryPoints, playbackStep, hoveredId, onHover, onHoverEnd }) {
  const points = useMemo(() => {
    if (!objects?.length) return [];
    return objects.filter(o => o.position?.geodetic).map(obj => {
    const isSelected = String(obj.noradId) === String(selectedId);
    let latitude, longitude, altitude;
    
    if (isSelected && trajectoryPoints?.length > 0 && trajectoryPoints[playbackStep]?.geodetic) {
      // Use playback position for selected object
      ({ latitude, longitude, altitude } = trajectoryPoints[playbackStep].geodetic);
    } else {
      ({ latitude, longitude, altitude } = obj.position.geodetic);
    }
    
    const pos = geoToCartesian(latitude, longitude, altitude);
    const level = obj.riskLabel ? obj.riskLabel.toLowerCase() : riskLevel(obj.riskScore ?? 0);
    const color = RISK_COLORS[level] || RISK_COLORS.safe;
    const staticPos = geoToCartesian(obj.position.geodetic.latitude, obj.position.geodetic.longitude, obj.position.geodetic.altitude);
    return {
      id: obj.noradId,
      name: obj.name,
      position: pos,
      staticPosition: staticPos,  // ← add this
      color,
      riskLevel: level,
      riskScore: obj.riskScore,
      altitude,
      isSelected,
    };
  });
 }, [objects, selectedId, trajectoryPoints, playbackStep]);

  return (
    <group>
      {points.map(p => (
        <group key={p.id}>
          <group
            position={p.position}
            onPointerOver={e => { e.stopPropagation(); onHover(String(p.id), e.nativeEvent, p); }}
            onPointerOut={e => { e.stopPropagation(); onHoverEnd(); }}
            onClick={e => { e.stopPropagation(); onSelect?.(p.id, e); }}
          >
            <mesh>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh raycast={() => null}>
              <sphereGeometry args={[p.isSelected ? 0.02 : 0.008, 8, 8]} />
              <meshBasicMaterial color={p.color} transparent opacity={p.isSelected ? 1 : 0.75} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
// 1. Add 'Line' to your import from @react-three/drei at the top of Globe.jsx if it isn't there:
// import { OrbitControls, Sphere, Stars, Html, Line } from "@react-three/drei";

function TrajectoryLine({ points, color = "#06b6d4" }) {
  const linePoints = useMemo(() => {
    if (!Array.isArray(points) || points.length < 2) return [];

    const vectors = [];

    // 1. Extract valid vectors
    points.forEach((p) => {
      const geo = p?.geodetic || p;
      if (!geo) return;

      const lat = Number(geo.latitude ?? geo.lat);
      const lon = Number(geo.longitude ?? geo.lon ?? geo.lng);
      const alt = Number(geo.altitude ?? geo.alt ?? 500);

      if (isNaN(lat) || isNaN(lon)) return;

      const pos = geoToCartesian(lat, lon, isNaN(alt) ? 500 : alt);
      if (pos && !pos.some(isNaN)) {
        const vec = new THREE.Vector3(...pos);
        
        // Filter out near-identical adjacent points that thicken the line
        if (vectors.length === 0 || vec.distanceToSquared(vectors[vectors.length - 1]) > 0.0001) {
          vectors.push(vec);
        }
      }
    });

    if (vectors.length < 2) return [];

    // 2. Slice to EXACTLY 1 orbit (~21 points) to prevent the tail from wrapping into revolution 2
    const ONE_ORBIT_COUNT = Math.min(21, vectors.length);
    const orbitSlice = vectors.slice(0, ONE_ORBIT_COUNT);

    if (orbitSlice.length < 3) return orbitSlice;

    // 3. Resample into a smooth, non-overlapping spline curve
    try {
      const curve = new THREE.CatmullRomCurve3(orbitSlice, false, "centripetal");
      return curve.getPoints(70);
    } catch (e) {
      return orbitSlice;
    }
  }, [points]);

  if (!linePoints || linePoints.length < 2) return null;

  return (
    <Line
      points={linePoints}
      color={color}
      lineWidth={1.2}
      worldUnits={false}
      depthTest={true}
      depthWrite={false}
      transparent
      opacity={0.85}
    />
  );
}

function PlaybackMarker({ points, stepIndex }) {
  const pt = points?.[stepIndex];
  if (!pt?.geodetic) return null;
  const pos = geoToCartesian(pt.geodetic.latitude, pt.geodetic.longitude, pt.geodetic.altitude);
  return (
    <mesh position={pos}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  );
}

export default function Globe({
  objects = [],
  trajectoryPoints = [],
  selectedObjectId,
  selectedObjectName,
  selectedObjectRisk,
  onSelectObject,
  showGrid = false,
}){
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredObj, setHoveredObj] = useState(null);
  const hoverTimeout = useRef(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const totalSteps = trajectoryPoints.length || 1;
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [selectedPos, setSelectedPos] = useState({ x: 0, y: 0 });
  const [labelScreenPos, setLabelScreenPos] = useState(null);
  useEffect(() => {
      if (!playing) return;
      const id = setInterval(() => {
        setStep(s => {
          if (s >= totalSteps - 1) { setPlaying(false); return 0; }
          return s + 1;
        });
      }, 100);
      return () => clearInterval(id);
    }, [playing, totalSteps]);
  console.log('Globe trajectoryPoints:', trajectoryPoints.length, 'selectedObjectId:', selectedObjectId);
  const currentPt = trajectoryPoints[step];
  const hoursIn = ((step * 5) / 60).toFixed(1);
  const thumbColor = RISK_LINE_COLORS[selectedObjectRisk] || "#388bfd";

  return (
    <div className="globe-container">
      <div className="globe-canvas">
        <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }} raycaster={{ params: { Mesh: { threshold: 0.05 } } }}>
          <ambientLight intensity={0.3} />
          <directionalLight position={[5, 3, 5]} intensity={1.2} />
          <pointLight position={[-5, -3, -5]} intensity={0.3} color="#6366f1" />
          <Stars radius={100} depth={60} count={3000} factor={3} saturation={0.2} fade />
          <Earth showGrid={showGrid} />
          <DebrisPoints 
            objects={objects} 
            selectedId={selectedObjectId} 
            onSelect={(id) => { 
              onSelectObject(id); 
              // Lock selectedPos to the current hover position so there is 0 shift
              setSelectedPos(tooltipPos); 
            }}
            trajectoryPoints={trajectoryPoints} 
            playbackStep={step}
            hoveredId={hoveredId}
            onHover={(id, e, obj) => {
              if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
              setHoveredId(id);
              setHoveredObj(obj);
              if (e) {
                // Use clientX / clientY directly from the event
                const x = e.clientX ?? e.nativeEvent?.clientX ?? 0;
                const y = e.clientY ?? e.nativeEvent?.clientY ?? 0;
                setTooltipPos({ x: x + 12, y: y - 20 });
              }
            }}
            onHoverEnd={() => {
              hoverTimeout.current = setTimeout(() => setHoveredId(null), 300);
            }}
          />
          {selectedObjectId && objects?.length > 0 && (() => {
            const sel = objects.find(o => String(o.noradId) === String(selectedObjectId));
            if (!sel?.position?.geodetic) return null;
            const { latitude, longitude, altitude } = sel.position.geodetic;
            const pos = geoToCartesian(latitude, longitude, altitude);
            return <ScreenPosition position={pos} onPosition={setLabelScreenPos} />;
          })()}
          {selectedObjectId && trajectoryPoints.length > 0 && (
            <TrajectoryLine
              points={trajectoryPoints}
              currentStep={step}
              color={RISK_LINE_COLORS[selectedObjectRisk] || "#06b6d4"}
            />
          )}
          <OrbitControls enablePan={false} minDistance={1.5} maxDistance={8} enableDamping dampingFactor={0.05} rotateSpeed={0.5} makeDefault onClick={e => e.stopPropagation()} />
        </Canvas>
      </div>
      {/* HTML tooltip overlay */}
      {hoveredId && String(hoveredId) !== String(selectedObjectId) && (
        <div style={{
          position: "fixed",
          left: tooltipPos.x,
          top: tooltipPos.y,
          background: "rgba(13,17,23,0.92)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 4,
          padding: "4px 8px",
          color: "#e6edf3",
          fontSize: 10,
          fontFamily: "Inter, sans-serif",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 99999, // 👈 Change from 1000 to 99999 (highest priority)
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600 }}>{hoveredObj?.name || "UNKNOWN"}</div>
          <div style={{ color: "#8b949e" }}>NORAD {hoveredId} (Risk: {(hoveredObj?.riskScore ?? 0).toFixed(3)})</div>
        </div>
      )}

      {/* Selected object persistent label */}
      {selectedObjectId && (
        <div style={{
          position: "fixed",
          left: selectedPos.x,
          top: selectedPos.y,
          background: "rgba(13,17,23,0.92)",
          border: `1px solid ${RISK_LINE_COLORS[selectedObjectRisk] || "#388bfd"}`,
          borderRadius: 4,
          padding: "4px 8px",
          color: RISK_LINE_COLORS[selectedObjectRisk] || "#388bfd",
          fontSize: 10,
          fontFamily: "Inter, sans-serif",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 1000,
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600 }}>{objects.find(o => String(o.noradId) === String(selectedObjectId))?.name || "UNKNOWN"}</div>
          <div>NORAD {selectedObjectId} (Risk: {(objects.find(o => String(o.noradId) === String(selectedObjectId))?.riskScore ?? 0).toFixed(3)})</div>
        </div>
      )}

      {/* Color Legend */}
      <div className="globe-legend">
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#f85149" }} />Critical ≥ 0.70</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#d29922" }} />Watch 0.45–0.70</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#3fb950" }} />Safe &lt; 0.45</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#38bdf8" }} />Active</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: "#a78bfa" }} />Unknown</span>
      </div>

      {/* Playback Slider */}
      {selectedObjectId && trajectoryPoints.length > 1 && (
        <div className="globe-playback">
          <style dangerouslySetInnerHTML={{ __html: `.globe-playback__slider::-webkit-slider-thumb { background: ${thumbColor} !important; }` }} />
          <div className="globe-playback__info" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="globe-playback__name" style={{ color: RISK_LINE_COLORS[selectedObjectRisk] || "var(--color-text-accent)" }}>
              {selectedObjectName || `Object ${selectedObjectId}`}
              {selectedObjectId && (
                <>
                  <span style={{ margin: "0 8px", opacity: 0.4 }}>|</span>
                  {`NORAD ${selectedObjectId}`}
                  <span style={{ margin: "0 8px", opacity: 0.4 }}>|</span>
                  {`Risk: ${(objects.find(o => String(o.noradId) === String(selectedObjectId))?.riskScore ?? 0).toFixed(3)}`}
                </>
              )}
            </span>
            <span className="globe-playback__time mono">T+{hoursIn}h / 48h</span>
          </div>
          
          {/* Full-width control row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
            <button
              onClick={() => setPlaying(p => !p)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 18,
                color: RISK_LINE_COLORS[selectedObjectRisk] || "#388bfd",
                padding: "0 4px",
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "⏸" : "▶"}
            </button>
            <input
              type="range"
              className="globe-playback__slider"
              min={0}
              max={totalSteps - 1}
              value={step}
              onChange={e => { setPlaying(false); setStep(Number(e.target.value)); }}
              style={{ accentColor: RISK_LINE_COLORS[selectedObjectRisk] || "#388bfd", flex: 1 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
