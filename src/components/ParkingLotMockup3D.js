import React, { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls, RoundedBox } from '@react-three/drei';

const GROUND_Y = -0.02;
const ASPHALT_Y = 0.035;
const STALL_PAINT_H = 0.045;
const AISLE_ASPHALT_H = 0.055;
const ENTRANCE_H = 0.07;
const CURB_H = 0.14;
const CURB_T = 0.22;
/** Legacy cap for proportional inset (fraction-of-lot); car clearance below usually dominates */
const PARK_LAYOUT_INSET = 0.95;
/** Fence posts sit just outside curb ring (m) */
const FENCE_OUTSIDE_CURB = 0.42;
/**
 * Min distance from nominal lot edge (±lot/2) to parking band so ParkedCar geometry stays inside asphalt.
 * Car length uses min(stallDepth * 0.88, 4.85); ~half extends past stall centre toward the perimeter row.
 */
const PARK_EDGE_CAR_CLEAR_M = 2.75;
const COLORS = {
  asphaltLot: '#3d4752',
  asphaltOuter: '#5c6570',
  mulch: '#4a3f35',
  treeBark: '#3f2f22',
  treeLeaf: '#2d5a32',
  /** Weathered stall surface: slightly lighter than main lot (faded sealcoat) */
  stallSurface: '#4a5568',
  aisleAsphalt: '#343c46',
  entranceAsphalt: '#5c4030',
  curb: '#9ca3af',
  lineWhite: '#f8fafc',
  lineYellow: '#facc15',
  wheelStop: '#57534e',
  gatePost: '#2d3748',
  gateBoom: '#eab308',
  gateHousing: '#b91c1c',
  gateBoothGlass: '#94a3b8',
  gateLedOk: '#22c55e',
  gateLedStop: '#ef4444',
  carGlass: '#0c1929',
  carRubber: '#1c1917',
  carGrille: '#0a0a0a',
  fencePost: '#3f3f46',
  fenceRail: '#52525b',
  fenceWire: '#71717a',
};

const CAR_BODY_PALETTE = ['#0c1829', '#1e293b', '#27272a', '#3f3f46', '#57534e', '#78350f', '#7f1d1d', '#dbeafe', '#1e40af', '#14532d'];

function StallPad({ position, size }) {
  const [w, h, d] = size;
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[w * 0.96, h, d * 0.96]} />
      <meshPhysicalMaterial
        color={COLORS.stallSurface}
        roughness={0.91}
        metalness={0.06}
        envMapIntensity={0.38}
        clearcoat={0.12}
        clearcoatRoughness={0.65}
      />
    </mesh>
  );
}

function MarkedBox({ position, size, color, roughness = 0.88, metalness = 0.05, emissive, emissiveIntensity = 0 }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive || '#000000'}
        emissiveIntensity={emissiveIntensity}
        envMapIntensity={0.45}
      />
    </mesh>
  );
}

function WheelStop({ position, size }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={COLORS.wheelStop} roughness={0.65} metalness={0.12} />
    </mesh>
  );
}

/** Thin white striping along stall cell edges (LR flow: lines parallel to Z at x boundaries) */
function StallStripesLR({ parkX0, parkX1, z0, z1, cols, rows, cellX, rowDepth, zStart, downward }) {
  const lines = [];
  const y = ASPHALT_Y + 0.02;
  const h = 0.02;
  let idx = 0;
  for (let c = 0; c <= cols; c += 1) {
    const x = parkX0 + c * cellX;
    idx += 1;
    lines.push(
      <mesh key={`sx-${idx}`} position={[x, y, (z0 + z1) / 2]} receiveShadow>
        <boxGeometry args={[0.06, h, Math.abs(z1 - z0)]} />
        <meshStandardMaterial color={COLORS.lineWhite} roughness={0.4} metalness={0.1} emissive="#ffffff" emissiveIntensity={0.08} />
      </mesh>
    );
  }
  for (let r = 0; r <= rows; r += 1) {
    const z = downward ? zStart - r * rowDepth : zStart + r * rowDepth;
    idx += 1;
    lines.push(
      <mesh key={`sz-${idx}`} position={[(parkX0 + parkX1) / 2, y, z]} receiveShadow>
        <boxGeometry args={[parkX1 - parkX0, h, 0.06]} />
        <meshStandardMaterial color={COLORS.lineWhite} roughness={0.4} metalness={0.1} emissive="#ffffff" emissiveIntensity={0.06} />
      </mesh>
    );
  }
  return <group>{lines}</group>;
}

function DashedLineLR({ x0, x1, z, dashLen, gapLen, y = ASPHALT_Y + 0.04 }) {
  const segs = [];
  let x = x0;
  let i = 0;
  const total = x1 - x0;
  while (x < x1 - 0.05) {
    const end = Math.min(x + dashLen, x1);
    const cx = (x + end) / 2;
    const len = end - x;
    i += 1;
    segs.push(
      <mesh key={`d-${i}`} position={[cx, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[len, 0.35]} />
        <meshStandardMaterial color={COLORS.lineYellow} roughness={0.55} metalness={0.15} emissive="#ca8a04" emissiveIntensity={0.12} />
      </mesh>
    );
    x = end + gapLen;
  }
  return <group>{segs}</group>;
}

function DashedLineTB({ z0, z1, x, dashLen, gapLen, y = ASPHALT_Y + 0.04 }) {
  const segs = [];
  let z = z0;
  let i = 0;
  while (z < z1 - 0.05) {
    const end = Math.min(z + dashLen, z1);
    const cz = (z + end) / 2;
    const len = end - z;
    i += 1;
    segs.push(
      <mesh key={`dt-${i}`} position={[x, y, cz]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} receiveShadow>
        <planeGeometry args={[len, 0.35]} />
        <meshStandardMaterial color={COLORS.lineYellow} roughness={0.55} metalness={0.15} emissive="#ca8a04" emissiveIntensity={0.12} />
      </mesh>
    );
    z = end + gapLen;
  }
  return <group>{segs}</group>;
}

const LANE_EDGE_MAT = {
  color: COLORS.lineWhite,
  roughness: 0.48,
  metalness: 0.08,
  emissive: '#ffffff',
  emissiveIntensity: 0.07,
};

/** White edge lines for the main through lane (full depth/width of lot, including gate pads) */
function ThroughLaneEdgeLines({ laneTB, laneLR }) {
  const y = ASPHALT_Y + 0.046;
  const thick = 0.08;
  const inset = 0.15;
  if (laneTB) {
    const { x, aisleM, z0, z1 } = laneTB;
    const off = Math.max(0.32, aisleM / 2 - inset);
    const lz = z1 - z0;
    const cz = (z0 + z1) / 2;
    return (
      <group>
        <mesh position={[x - off, y, cz]} receiveShadow>
          <boxGeometry args={[thick, 0.014, lz]} />
          <meshStandardMaterial {...LANE_EDGE_MAT} />
        </mesh>
        <mesh position={[x + off, y, cz]} receiveShadow>
          <boxGeometry args={[thick, 0.014, lz]} />
          <meshStandardMaterial {...LANE_EDGE_MAT} />
        </mesh>
      </group>
    );
  }
  if (laneLR) {
    const { z, aisleM, x0, x1 } = laneLR;
    const off = Math.max(0.32, aisleM / 2 - inset);
    const lx = x1 - x0;
    const cx = (x0 + x1) / 2;
    return (
      <group>
        <mesh position={[cx, y, z - off]} receiveShadow>
          <boxGeometry args={[lx, 0.014, thick]} />
          <meshStandardMaterial {...LANE_EDGE_MAT} />
        </mesh>
        <mesh position={[cx, y, z + off]} receiveShadow>
          <boxGeometry args={[lx, 0.014, thick]} />
          <meshStandardMaterial {...LANE_EDGE_MAT} />
        </mesh>
      </group>
    );
  }
  return null;
}

function CurbRing({ lotW, lotH }) {
  const w = lotW + CURB_T * 2;
  const h = lotH + CURB_T * 2;
  const y = CURB_H / 2 + ASPHALT_Y;
  const t = CURB_T;
  return (
    <group>
      <mesh position={[0, y, h / 2 - t / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, CURB_H, t]} />
        <meshStandardMaterial color={COLORS.curb} roughness={0.88} metalness={0.06} />
      </mesh>
      <mesh position={[0, y, -h / 2 + t / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, CURB_H, t]} />
        <meshStandardMaterial color={COLORS.curb} roughness={0.88} metalness={0.06} />
      </mesh>
      <mesh position={[w / 2 - t / 2, y, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, CURB_H, h - t * 2]} />
        <meshStandardMaterial color={COLORS.curb} roughness={0.88} metalness={0.06} />
      </mesh>
      <mesh position={[-w / 2 + t / 2, y, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, CURB_H, h - t * 2]} />
        <meshStandardMaterial color={COLORS.curb} roughness={0.88} metalness={0.06} />
      </mesh>
    </group>
  );
}

const FENCE_H = 1.36;
const FENCE_POST = 0.1;
const FENCE_SPACING = 3.2;
/** Depth from gate centre toward fence where we omit fence (m) */
const GATE_FENCE_DEPTH_M = 8.5;

/** Opening follows gate boom: top/bottom gates clear along X; left/right along Z */
function fenceInGateOpening(x, z, g) {
  const span = (g.span ?? 5) + 4;
  const half = span / 2;
  const dx = Math.abs(x - g.cx);
  const dz = Math.abs(z - g.cz);
  const rot = g.rotY ?? 0;
  const topBottom = Math.abs(Math.sin(rot)) < 0.2;
  if (topBottom) {
    return dx < half && dz < GATE_FENCE_DEPTH_M;
  }
  return dz < half && dx < GATE_FENCE_DEPTH_M;
}

function railCrossesGateOpening(xa, za, xb, zb, gates) {
  for (let s = 0.05; s <= 0.95; s += 0.15) {
    const x = xa + (xb - xa) * s;
    const z = za + (zb - za) * s;
    if (gates.some((g) => fenceInGateOpening(x, z, g))) return true;
  }
  return false;
}

/** Chain-link style: posts + rails + wires; full-width opening at each gate (no fence through drive path) */
function PerimeterFence({ lotW, lotH, gates }) {
  const ox = lotW / 2 + CURB_T + FENCE_OUTSIDE_CURB;
  const oz = lotH / 2 + CURB_T + FENCE_OUTSIDE_CURB;
  const yPost = ASPHALT_Y + FENCE_H / 2;
  const yTop = ASPHALT_Y + FENCE_H - 0.06;
  const yBot = ASPHALT_Y + 0.14;

  const edges = [
    [-ox, -oz, ox, -oz],
    [ox, -oz, ox, oz],
    [ox, oz, -ox, oz],
    [-ox, oz, -ox, -oz],
  ];

  const posts = [];
  const railSegs = [];

  edges.forEach(([x0, z0, x1, z1], ei) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.ceil(len / FENCE_SPACING));
    const edgePosts = [];
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (gates.some((g) => fenceInGateOpening(x, z, g))) continue;
      edgePosts.push([x, z]);
    }
    edgePosts.forEach((p) => posts.push(p));
    for (let i = 0; i < edgePosts.length - 1; i += 1) {
      const [xa, za] = edgePosts[i];
      const [xb, zb] = edgePosts[i + 1];
      if (railCrossesGateOpening(xa, za, xb, zb, gates)) continue;
      const mx = (xa + xb) / 2;
      const mz = (za + zb) / 2;
      const dx = xb - xa;
      const dz = zb - za;
      const segLen = Math.hypot(dx, dz);
      const ang = Math.atan2(dz, dx);
      railSegs.push({ mx, mz, segLen, ang, y: yTop, thick: 0.05 });
      railSegs.push({ mx, mz, segLen, ang, y: yBot, thick: 0.045 });
    }
  });

  return (
    <group>
      {posts.map(([x, z], i) => (
        <mesh key={`fp-${i}`} position={[x, yPost, z]} castShadow receiveShadow>
          <boxGeometry args={[FENCE_POST, FENCE_H, FENCE_POST]} />
          <meshStandardMaterial color={COLORS.fencePost} roughness={0.55} metalness={0.55} envMapIntensity={0.35} />
        </mesh>
      ))}
      {railSegs.map((r, i) => (
        <mesh
          key={`fr-${i}`}
          position={[r.mx, r.y, r.mz]}
          rotation={[0, -r.ang, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[r.segLen, r.thick, 0.04]} />
          <meshStandardMaterial color={COLORS.fenceRail} roughness={0.45} metalness={0.65} envMapIntensity={0.4} />
        </mesh>
      ))}
      {edges.flatMap(([x0, z0, x1, z1], ei) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(3, Math.floor(len / 0.38));
        const wires = [];
        const yWire = ASPHALT_Y + FENCE_H * 0.48;
        for (let i = 1; i < n; i += 1) {
          const t = i / n;
          const x = x0 + (x1 - x0) * t;
          const z = z0 + (z1 - z0) * t;
          if (gates.some((g) => fenceInGateOpening(x, z, g))) continue;
          wires.push(
            <mesh key={`w-${ei}-${i}`} position={[x, yWire, z]} castShadow>
              <cylinderGeometry args={[0.012, 0.012, FENCE_H * 0.78, 6]} />
              <meshStandardMaterial color={COLORS.fenceWire} roughness={0.35} metalness={0.4} />
            </mesh>
          );
        }
        return wires;
      })}
    </group>
  );
}

const GATE_POST_H = 2.45;
const GATE_POST_T = 0.3;

const RB = 0.045;

/** Procedural turf map + slight vertex jitter for a richer site than flat grey */
function SiteGrassGround({ size }) {
  const { texture, displace } = useMemo(() => {
    const res = 96;
    const buf = new Uint8Array(res * res * 4);
    for (let y = 0; y < res; y += 1) {
      for (let x = 0; x < res; x += 1) {
        const i = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;
        const n = Math.sin(nx * 11.2 + ny * 7.1) * 0.5 + 0.5;
        const m = Math.sin(nx * 4.3 - ny * 5.8) * 0.5 + 0.5;
        const blend = n * 0.55 + m * 0.45;
        buf[i] = Math.floor(38 + blend * 52);
        buf[i + 1] = Math.floor(92 + blend * 78);
        buf[i + 2] = Math.floor(34 + blend * 48);
        buf[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(buf, res, res);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(2.5, size / 22), Math.max(2.5, size / 22));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const seg = 64;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const h =
        Math.sin(px * 0.34) * Math.cos(py * 0.29) * 0.022 + Math.sin(px * 0.1 + py * 0.12) * 0.009;
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    return { texture: tex, displace: geo };
  }, [size]);

  useLayoutEffect(
    () => () => {
      texture.dispose();
      displace.dispose();
    },
    [texture, displace]
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y - 0.006, 0]} receiveShadow geometry={displace}>
      <meshStandardMaterial
        map={texture}
        color="#ffffff"
        roughness={0.94}
        metalness={0.02}
        envMapIntensity={0.18}
      />
    </mesh>
  );
}

/** Mulch beds + simple trees outside the fenced apron */
function LandscapeAccents({ lotW, lotH }) {
  const ox = lotW / 2 + 3.2;
  const oz = lotH / 2 + 3.2;
  /** Corner plantings only — mid-edge (0,±z)/(±x,0) spots sat on gate/drive centrelines and blocked lanes */
  const spots = [
    [-ox * 0.92, -oz * 0.88],
    [ox * 0.9, -oz * 0.85],
    [-ox * 0.82, oz * 0.92],
    [ox * 0.88, oz * 0.9],
  ];
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={`ls-${i}`} position={[x, GROUND_Y, z]}>
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[2.8, 20]} />
            <meshStandardMaterial color={COLORS.mulch} roughness={0.92} metalness={0.04} envMapIntensity={0.15} />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.14, 0.18, 1.1, 8]} />
            <meshStandardMaterial color={COLORS.treeBark} roughness={0.88} metalness={0.06} />
          </mesh>
          <mesh position={[0, 1.35, 0]} castShadow receiveShadow>
            <icosahedronGeometry args={[1.05, 0]} />
            <meshStandardMaterial color={COLORS.treeLeaf} roughness={0.78} metalness={0.05} envMapIntensity={0.35} />
          </mesh>
          <mesh position={[0, 1.85, 0.15]} castShadow receiveShadow>
            <icosahedronGeometry args={[0.62, 0]} />
            <meshStandardMaterial color={COLORS.treeLeaf} roughness={0.8} metalness={0.04} envMapIntensity={0.32} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function pickCarVariant(seed) {
  const r = seed % 100;
  if (r < 28) return 'suv';
  if (r < 56) return 'hatch';
  if (r < 68) return 'van';
  return 'sedan';
}

/** Per-variant silhouette multipliers (local +Z = hood) */
function carVariantShape(variant) {
  switch (variant) {
    case 'suv':
      return { wx: 1.08, lx: 0.96, cabinH: 1.14, deckMul: 1, hoodLen: 1.02, wheel: 1.1, rb: 1, rack: true, boxy: false };
    case 'hatch':
      return { wx: 0.96, lx: 0.86, cabinH: 0.94, deckMul: 1.12, hoodLen: 0.78, wheel: 0.96, rb: 0.85, rack: false, boxy: false };
    case 'van':
      return { wx: 1.04, lx: 0.98, cabinH: 1.32, deckMul: 0.92, hoodLen: 0.52, wheel: 0.92, rb: 0.45, rack: false, boxy: true };
    default:
      return { wx: 1, lx: 1, cabinH: 1, deckMul: 1, hoodLen: 1, wheel: 1, rb: 1, rack: false, boxy: false };
  }
}

function CarWheelAssembly({ x, z, radius }) {
  const tw = 0.2;
  return (
    <group position={[x, radius * 0.92, z]}>
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, tw, 20]} />
        <meshStandardMaterial color={COLORS.carRubber} roughness={0.91} metalness={0.04} />
      </mesh>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.62, radius * 0.62, tw * 1.02, 16]} />
        <meshStandardMaterial color="#71717a" roughness={0.22} metalness={0.88} envMapIntensity={1.05} />
      </mesh>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.22, radius * 0.18, tw * 1.08, 6]} />
        <meshStandardMaterial color="#a1a1aa" roughness={0.18} metalness={0.92} envMapIntensity={1} />
      </mesh>
    </group>
  );
}

/** Local +Z = front (hood). Variants: sedan, suv, hatch, van — shared rig, different proportions. */
function ParkedCar({ position, rotationY, bodyW, bodyL, colorHex, variant = 'sedan' }) {
  const sh = carVariantShape(variant);
  const w = Math.min(bodyW * 0.9 * sh.wx, 1.92 * sh.wx);
  const L = Math.min(bodyL * 0.88 * sh.lx, 4.85 * sh.lx);
  const y0 = ASPHALT_Y + STALL_PAINT_H;
  const rWheel = Math.min(0.34, w * 0.19) * sh.wheel;
  const track = w * 0.78;
  const wb = L * (variant === 'van' ? 0.48 : 0.52);
  const rb = RB * sh.rb;
  const cabinH = 0.42 * sh.cabinH;
  const cabinY = rWheel * 1.05 + cabinH / 2;
  const hoodZ = L * 0.28 * sh.hoodLen;
  const roofZ = -L * 0.3 * sh.deckMul;

  const paintProps = {
    color: colorHex,
    roughness: sh.boxy ? 0.28 : 0.22,
    metalness: sh.boxy ? 0.65 : 0.78,
    envMapIntensity: 1.05,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  };

  return (
    <group position={[position[0], y0, position[2]]} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[w * 0.98, 0.12, L * 0.95]} radius={rb * 0.6} smoothness={4} position={[0, rWheel * 0.55, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#0f172a" roughness={0.95} metalness={0.1} />
      </RoundedBox>

      <RoundedBox args={[w * 0.94, cabinH, L * 0.88]} radius={rb} smoothness={4} position={[0, cabinY, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial {...paintProps} />
      </RoundedBox>

      {!sh.boxy && (
        <>
          <RoundedBox args={[w * 0.9, 0.22 * sh.cabinH, L * 0.28 * sh.hoodLen]} radius={rb * 0.7} smoothness={3} position={[0, cabinY + cabinH * 0.22, hoodZ]} castShadow receiveShadow>
            <meshPhysicalMaterial {...paintProps} roughness={0.28} />
          </RoundedBox>

          <RoundedBox args={[w * 0.88, 0.2 * sh.cabinH, L * 0.22]} radius={rb * 0.6} smoothness={3} position={[0, cabinY + cabinH * 0.18, roofZ]} castShadow receiveShadow>
            <meshPhysicalMaterial {...paintProps} roughness={0.3} />
          </RoundedBox>
        </>
      )}

      {sh.boxy && (
        <RoundedBox args={[w * 0.88, cabinH * 0.35, L * 0.72]} radius={rb * 0.35} smoothness={3} position={[0, cabinY + cabinH * 0.32, -L * 0.06]} castShadow receiveShadow>
          <meshPhysicalMaterial {...paintProps} roughness={0.32} />
        </RoundedBox>
      )}

      <RoundedBox args={[w * 0.78, 0.48 * Math.min(1.15, sh.cabinH), L * 0.36]} radius={rb * 0.85} smoothness={4} position={[0, cabinY + cabinH * 0.28, L * 0.02]} castShadow receiveShadow>
        <meshPhysicalMaterial {...paintProps} roughness={0.26} />
      </RoundedBox>

      {sh.rack && (
        <mesh position={[0, cabinY + cabinH * 0.52, -L * 0.05]} castShadow receiveShadow>
          <boxGeometry args={[w * 0.42, 0.05, L * 0.22]} />
          <meshStandardMaterial color="#1e293b" roughness={0.55} metalness={0.45} envMapIntensity={0.5} />
        </mesh>
      )}

      <mesh position={[0, cabinY + cabinH * 0.38, L * 0.22]} rotation={[-0.52, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.72, 0.34, 0.05]} />
        <meshPhysicalMaterial
          color={COLORS.carGlass}
          roughness={0.05}
          metalness={0.82}
          transmission={0.55}
          thickness={0.45}
          ior={1.45}
          transparent
          envMapIntensity={1.35}
        />
      </mesh>

      <mesh position={[0, cabinY + cabinH * 0.4, -L * 0.12]} rotation={[variant === 'hatch' ? 0.65 : 0.4, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.68, 0.28, 0.04]} />
        <meshPhysicalMaterial
          color={COLORS.carGlass}
          roughness={0.07}
          metalness={0.8}
          transmission={0.48}
          thickness={0.38}
          ior={1.45}
          transparent
          envMapIntensity={1.25}
        />
      </mesh>

      <mesh position={[0, cabinY + cabinH * 0.48, L * 0.02]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.62, 0.06, L * 0.34]} />
        <meshPhysicalMaterial {...paintProps} roughness={0.35} metalness={0.65} />
      </mesh>

      <mesh position={[0, cabinY - cabinH * 0.05, L * 0.455]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.55, 0.16, 0.08]} />
        <meshStandardMaterial color={COLORS.carGrille} roughness={0.75} metalness={0.35} />
      </mesh>

      {[-1, 1].map((sx) => (
        <mesh key={`hl-${sx}`} position={[sx * w * 0.38, cabinY + cabinH * 0.08, L * 0.44]} castShadow>
          <boxGeometry args={[0.22, 0.1, 0.06]} />
          <meshStandardMaterial color="#fefce8" emissive="#fef08a" emissiveIntensity={0.45} roughness={0.35} metalness={0.2} />
        </mesh>
      ))}

      <mesh position={[0, cabinY - cabinH * 0.06, -L * 0.455]} castShadow>
        <boxGeometry args={[w * 0.82, 0.08, 0.05]} />
        <meshStandardMaterial color="#7f1d1d" emissive="#dc2626" emissiveIntensity={0.35} roughness={0.45} metalness={0.25} />
      </mesh>

      {[-1, 1].map((sx) => (
        <mesh key={`mir-${sx}`} position={[sx * w * 0.48, cabinY + cabinH * 0.32, L * 0.08]} castShadow>
          <boxGeometry args={[0.08, 0.06, 0.12]} />
          <meshPhysicalMaterial
            color={colorHex}
            roughness={0.38}
            metalness={0.75}
            envMapIntensity={1}
            clearcoat={0.85}
            clearcoatRoughness={0.18}
          />
        </mesh>
      ))}

      <CarWheelAssembly x={-track / 2} z={wb / 2} radius={rWheel} />
      <CarWheelAssembly x={track / 2} z={wb / 2} radius={rWheel} />
      <CarWheelAssembly x={-track / 2} z={-wb / 2} radius={rWheel} />
      <CarWheelAssembly x={track / 2} z={-wb / 2} radius={rWheel} />
    </group>
  );
}

/** Boom barrier, guard booth, ANPR camera mast, reader plate, status LEDs */
function SecurityGate({ cx, cz, rotY, span, gateRole }) {
  const baseY = ASPHALT_Y;
  const postY = baseY + GATE_POST_H / 2;
  const half = (span / 2) * 0.4;
  const boomLen = span * 0.76;
  const boothSide = half + GATE_POST_T * 0.5 + 0.65;
  const isExit = gateRole === 'exit';
  const ledColor = isExit ? COLORS.gateLedStop : COLORS.gateLedOk;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      <mesh position={[-half, postY, 0]} castShadow receiveShadow>
        <boxGeometry args={[GATE_POST_T, GATE_POST_H, GATE_POST_T]} />
        <meshStandardMaterial color={COLORS.gatePost} roughness={0.52} metalness={0.48} envMapIntensity={0.35} />
      </mesh>
      <mesh position={[half, postY, 0]} castShadow receiveShadow>
        <boxGeometry args={[GATE_POST_T, GATE_POST_H, GATE_POST_T]} />
        <meshStandardMaterial color={COLORS.gatePost} roughness={0.52} metalness={0.48} envMapIntensity={0.35} />
      </mesh>

      <mesh position={[half - 0.08, baseY + GATE_POST_H * 0.33, 0.16]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.22, 0.06]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.35} metalness={0.75} envMapIntensity={0.5} />
      </mesh>

      <mesh position={[0, baseY + GATE_POST_H * 0.86, 0]} rotation={[0, 0, 0.2]} castShadow receiveShadow>
        <boxGeometry args={[boomLen, 0.11, 0.14]} />
        <meshStandardMaterial
          color={COLORS.gateBoom}
          roughness={0.38}
          metalness={0.3}
          emissive="#a16207"
          emissiveIntensity={0.06}
          envMapIntensity={0.4}
        />
      </mesh>
      <mesh position={[half, baseY + GATE_POST_H * 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.4, 0.24]} />
        <meshStandardMaterial color={COLORS.gateHousing} roughness={0.45} metalness={0.2} envMapIntensity={0.3} />
      </mesh>

      <group position={[-boothSide, baseY, -0.15]}>
        <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.15, 1.9, 1.05]} />
          <meshStandardMaterial color="#64748b" roughness={0.55} metalness={0.35} envMapIntensity={0.4} />
        </mesh>
        <mesh position={[0.35, 1.05, 0.53]} castShadow receiveShadow>
          <boxGeometry args={[0.7, 0.75, 0.04]} />
          <meshStandardMaterial color={COLORS.gateBoothGlass} roughness={0.05} metalness={0.9} envMapIntensity={1} transparent opacity={0.45} />
        </mesh>
        <mesh position={[-0.42, 1.55, 0.53]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 0.14, 0.05]} />
          <meshStandardMaterial color={ledColor} emissive={ledColor} emissiveIntensity={0.55} roughness={0.4} />
        </mesh>
      </group>

      <group position={[half + 0.35, baseY, -0.4]}>
        <mesh position={[0, 1.65, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.06, 0.08, 1.2, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, 2.25, 0.12]} castShadow receiveShadow>
          <boxGeometry args={[0.22, 0.12, 0.18]} />
          <meshStandardMaterial color="#0f172a" roughness={0.25} metalness={0.5} />
        </mesh>
        <mesh position={[0, 2.25, 0.22]} castShadow receiveShadow>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.35} roughness={0.2} metalness={0.4} />
        </mesh>
      </group>

      <mesh position={[0, baseY + 1.55, -half - 0.08]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.28, 0.04]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.75} metalness={0.05} />
      </mesh>
      <mesh position={[0, baseY + 1.55, -half - 0.06]}>
        <planeGeometry args={[0.42, 0.2]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function PerimeterLights({ lotW, lotH }) {
  const h = Math.max(lotW, lotH) * 0.55;
  const ox = lotW / 2 + 2;
  const oz = lotH / 2 + 2;
  const posts = [
    [-ox, h, -oz],
    [ox, h, -oz],
    [-ox, h, oz],
    [ox, h, oz],
  ];
  return (
    <group>
      {posts.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, -h * 0.4, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.12, 0.16, h * 0.8, 8]} />
            <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.55} />
          </mesh>
          <mesh position={[0, h * 0.05, 0]}>
            <sphereGeometry args={[0.35, 12, 12]} />
            <meshStandardMaterial color="#fef9c3" emissive="#fbbf24" emissiveIntensity={0.85} roughness={0.25} />
          </mesh>
          <pointLight position={[0, 0, 0]} intensity={0.55} distance={lotW * 3} decay={2} color="#fff7d6" />
        </group>
      ))}
    </group>
  );
}

function stallCarSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildLayout({
  lotW,
  lotH,
  entranceSide,
  gateMode,
  cols,
  rowsTop,
  rowsBottom,
  entranceM,
  aisleM,
}) {
  const boxes = [];
  const wheelStops = [];
  const cars = [];
  const gates = [];
  let k = 0;
  const dual = gateMode === 'dual';
  const inFrac = Math.min(PARK_LAYOUT_INSET, Math.max(0.32, Math.min(lotW, lotH) * 0.028));
  const inCar = Math.min(PARK_EDGE_CAR_CLEAR_M, Math.min(lotW, lotH) * 0.34 - 0.4);
  const IN = Math.max(inFrac, Math.max(0.55, inCar));
  const edgeX0 = -lotW / 2;
  const edgeX1 = lotW / 2;
  const edgeZ0 = -lotH / 2;
  const edgeZ1 = lotH / 2;
  const ix0 = edgeX0 + IN;
  const ix1 = edgeX1 - IN;
  const iz0 = edgeZ0 + IN;
  const iz1 = edgeZ1 - IN;

  const addEntrance = (cx, cz, w, d, isExitStrip) => {
    k += 1;
    boxes.push({
      key: `ent-${k}`,
      type: 'entrance',
      pos: [cx, ENTRANCE_H / 2 + ASPHALT_Y, cz],
      size: [w, ENTRANCE_H, d],
      color: isExitStrip ? '#4a3f36' : COLORS.entranceAsphalt,
    });
  };

  const addAisle = (cx, cz, w, d) => {
    k += 1;
    boxes.push({
      key: `aisle-${k}`,
      type: 'aisle',
      pos: [cx, AISLE_ASPHALT_H / 2 + ASPHALT_Y, cz],
      size: [w, AISLE_ASPHALT_H, d],
      color: COLORS.aisleAsphalt,
    });
  };

  const pushCar = (key, cx, cz, bodyW, bodyL, yaw) => {
    const seed = stallCarSeed(key);
    if (seed % 100 >= 82) return;
    cars.push({
      key: `car-${key}`,
      position: [cx, 0, cz],
      rotationY: yaw,
      bodyW,
      bodyL,
      variant: pickCarVariant(seed),
      colorHex: CAR_BODY_PALETTE[seed % CAR_BODY_PALETTE.length],
    });
  };

  const addStall = (key, cx, cz, w, d, wheel, carYaw, carW, carL) => {
    boxes.push({
      key,
      type: 'stall',
      pos: [cx, STALL_PAINT_H / 2 + ASPHALT_Y, cz],
      size: [w * 0.94, STALL_PAINT_H, d * 0.94],
    });
    if (wheel) {
      wheelStops.push({
        key: `ws-${key}`,
        pos: wheel.pos,
        size: wheel.size,
      });
    }
    pushCar(key, cx, cz, carW, carL, carYaw);
  };

  let stripesLR = null;
  let dashLR = null;
  let dashTB = null;

  const tbFlow = entranceSide === 'top' || entranceSide === 'bottom';

  if (!tbFlow) {
    const z0 = iz0;
    const z1 = iz1;
    let parkX0 = ix0;
    let parkX1 = ix1;

    if (dual) {
      addEntrance(edgeX0 + entranceM / 2, (z0 + z1) / 2, entranceM, z1 - z0, false);
      addEntrance(edgeX1 - entranceM / 2, (z0 + z1) / 2, entranceM, z1 - z0, true);
      parkX0 = Math.max(ix0, edgeX0 + entranceM);
      parkX1 = Math.min(ix1, edgeX1 - entranceM);
    } else if (entranceSide === 'left') {
      addEntrance(edgeX0 + entranceM / 2, (z0 + z1) / 2, entranceM, z1 - z0, false);
      parkX0 = Math.max(ix0, edgeX0 + entranceM);
      parkX1 = ix1;
    } else {
      addEntrance(edgeX1 - entranceM / 2, (z0 + z1) / 2, entranceM, z1 - z0, false);
      parkX0 = ix0;
      parkX1 = Math.min(ix1, edgeX1 - entranceM);
    }

    const rawPw = parkX1 - parkX0;
    let approachDx = Math.min(4.2, Math.max(2.75, aisleM * 0.52));
    if (dual) {
      approachDx = Math.min(approachDx, Math.max(0, (rawPw - 11) / 2));
    }
    let xSt0 = parkX0;
    let xSt1 = parkX1;
    if (dual) {
      xSt0 = parkX0 + approachDx;
      xSt1 = parkX1 - approachDx;
    } else if (entranceSide === 'left') {
      approachDx = Math.min(approachDx, Math.max(0, rawPw - 9));
      xSt0 = parkX0 + approachDx;
    } else {
      approachDx = Math.min(approachDx, Math.max(0, rawPw - 9));
      xSt1 = parkX1 - approachDx;
    }
    if (xSt1 - xSt0 < 5) {
      const mid = (parkX0 + parkX1) / 2;
      xSt0 = mid - 2.5;
      xSt1 = mid + 2.5;
    }

    const pw = parkX1 - parkX0;
    const spanZ = z1 - z0;
    const remZ = Math.max(0.1, spanZ - aisleM);
    const rt = Math.max(1, rowsTop);
    const rb = Math.max(1, rowsBottom);
    const topZ = remZ * (rt / (rt + rb));
    const botZ = remZ - topZ;
    const zMid = (z0 + z1) / 2;

    addAisle((parkX0 + parkX1) / 2, zMid, pw, aisleM);

    const pwStall = xSt1 - xSt0;
    const cellX = pwStall / cols;
    const topRowD = topZ / rt;
    const botRowD = botZ / rb;
    const topZStart = zMid + aisleM / 2;
    const botZEnd = zMid - aisleM / 2;

    dashLR = { x0: edgeX0 + 0.5, x1: edgeX1 - 0.5, z: zMid };

    stripesLR = {
      top: { parkX0: xSt0, parkX1: xSt1, z0: topZStart, z1: topZStart + topZ, cols, rows: rt, cellX, rowDepth: topRowD, zStart: topZStart, downward: false },
      bot: { parkX0: xSt0, parkX1: xSt1, z0: botZEnd - botZ, z1: botZEnd, cols, rows: rb, cellX, rowDepth: botRowD, zStart: botZEnd, downward: true },
    };

    for (let r = 0; r < rt; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        k += 1;
        const cx = xSt0 + (c + 0.5) * cellX;
        const cz = topZStart + (r + 0.5) * topRowD;
        const wsZ = cz - topRowD * 0.38;
        addStall(`t-${k}`, cx, cz, cellX, topRowD, {
          pos: [cx, ASPHALT_Y + 0.055, wsZ],
          size: [Math.min(1.85, cellX * 0.42), 0.09, 0.16],
        }, Math.PI, cellX, topRowD);
      }
    }
    for (let r = 0; r < rb; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        k += 1;
        const cx = xSt0 + (c + 0.5) * cellX;
        const cz = botZEnd - (r + 0.5) * botRowD;
        const wsZ = cz + botRowD * 0.38;
        addStall(`b-${k}`, cx, cz, cellX, botRowD, {
          pos: [cx, ASPHALT_Y + 0.055, wsZ],
          size: [Math.min(1.85, cellX * 0.42), 0.09, 0.16],
        }, 0, cellX, botRowD);
      }
    }

    const gateSpan = Math.min(Math.max(spanZ * 0.52, 6.5), 16);
    if (dual) {
      const enterLeft = entranceSide === 'left';
      gates.push(
        {
          cx: edgeX0 + entranceM / 2,
          cz: (z0 + z1) / 2,
          rotY: -Math.PI / 2,
          span: gateSpan,
          gateRole: enterLeft ? 'entry' : 'exit',
        },
        {
          cx: edgeX1 - entranceM / 2,
          cz: (z0 + z1) / 2,
          rotY: Math.PI / 2,
          span: gateSpan,
          gateRole: enterLeft ? 'exit' : 'entry',
        }
      );
    } else {
      gates.push({
        cx: entranceSide === 'left' ? edgeX0 + entranceM / 2 : edgeX1 - entranceM / 2,
        cz: (z0 + z1) / 2,
        rotY: entranceSide === 'left' ? -Math.PI / 2 : Math.PI / 2,
        span: gateSpan,
        gateRole: 'combined',
      });
    }

    return {
      boxes,
      wheelStops,
      stripesLR,
      dashLR,
      dashTB: null,
      gates,
      cars,
      laneGuideTB: null,
      laneGuideLR: { z: zMid, aisleM, x0: edgeX0 + 0.4, x1: edgeX1 - 0.4 },
    };
  }

  const x0b = ix0;
  const x1b = ix1;
  let parkZ0 = iz0;
  let parkZ1 = iz1;

  if (dual) {
    addEntrance(0, edgeZ1 - entranceM / 2, lotW, entranceM, false);
    addEntrance(0, edgeZ0 + entranceM / 2, lotW, entranceM, true);
    parkZ0 = Math.max(iz0, edgeZ0 + entranceM);
    parkZ1 = Math.min(iz1, edgeZ1 - entranceM);
  } else if (entranceSide === 'top') {
    addEntrance(0, edgeZ1 - entranceM / 2, lotW, entranceM, false);
    parkZ0 = iz0;
    parkZ1 = Math.min(iz1, edgeZ1 - entranceM);
  } else {
    addEntrance(0, edgeZ0 + entranceM / 2, lotW, entranceM, false);
    parkZ0 = Math.max(iz0, edgeZ0 + entranceM);
    parkZ1 = iz1;
  }

  const rawPh = parkZ1 - parkZ0;
  let approachDz = Math.min(4.2, Math.max(2.75, aisleM * 0.52));
  if (dual) {
    approachDz = Math.min(approachDz, Math.max(0, (rawPh - 11) / 2));
  }
  let zSt0 = parkZ0;
  let zSt1 = parkZ1;
  if (dual) {
    zSt0 = parkZ0 + approachDz;
    zSt1 = parkZ1 - approachDz;
  } else if (entranceSide === 'top') {
    approachDz = Math.min(approachDz, Math.max(0, rawPh - 9));
    zSt1 = parkZ1 - approachDz;
  } else {
    approachDz = Math.min(approachDz, Math.max(0, rawPh - 9));
    zSt0 = parkZ0 + approachDz;
  }
  if (zSt1 - zSt0 < 5) {
    const mid = (parkZ0 + parkZ1) / 2;
    zSt0 = mid - 2.5;
    zSt1 = mid + 2.5;
  }

  const spanX = x1b - x0b;
  const remX = Math.max(0.1, spanX - aisleM);
  const stallsLeft = Math.max(1, Math.ceil(cols / 2));
  const stallsRight = Math.max(0, cols - stallsLeft);
  const xMid = (x0b + x1b) / 2;
  const denom = Math.max(1, cols);
  const leftW = remX * (stallsLeft / denom);
  const rightW = remX * (stallsRight / denom);

  addAisle(xMid, (parkZ0 + parkZ1) / 2, aisleM, parkZ1 - parkZ0);

  const ph = zSt1 - zSt0;
  const pitchL = ph / stallsLeft;

  dashTB = { z0: edgeZ0 + 0.5, z1: edgeZ1 - 0.5, x: xMid };

  for (let r = 0; r < stallsLeft; r += 1) {
    k += 1;
    const cz = zSt0 + (r + 0.5) * pitchL;
    const cx = xMid - aisleM / 2 - leftW / 2;
    const wsX = cx + leftW * 0.38;
    addStall(`L-${k}`, cx, cz, leftW, pitchL, {
      pos: [wsX, ASPHALT_Y + 0.055, cz],
      size: [0.16, 0.09, Math.min(1.85, pitchL * 0.42)],
    }, -Math.PI / 2, leftW, pitchL);
  }
  if (stallsRight > 0) {
    const pitchR = ph / stallsRight;
    for (let r = 0; r < stallsRight; r += 1) {
      k += 1;
      const cz = zSt0 + (r + 0.5) * pitchR;
      const cx = xMid + aisleM / 2 + rightW / 2;
      const wsX = cx - rightW * 0.38;
      addStall(`R-${k}`, cx, cz, rightW, pitchR, {
        pos: [wsX, ASPHALT_Y + 0.055, cz],
        size: [0.16, 0.09, Math.min(1.85, pitchR * 0.42)],
      }, Math.PI / 2, rightW, pitchR);
    }
  }

  const gateSpanTB = Math.min(Math.max(lotW * 0.42, 4.2), 5.8);
  if (dual) {
    const enterTop = entranceSide === 'top';
    gates.push(
      {
        cx: 0,
        cz: edgeZ1 - entranceM / 2,
        rotY: 0,
        span: gateSpanTB,
        gateRole: enterTop ? 'entry' : 'exit',
      },
      {
        cx: 0,
        cz: edgeZ0 + entranceM / 2,
        rotY: Math.PI,
        span: gateSpanTB,
        gateRole: enterTop ? 'exit' : 'entry',
      }
    );
  } else {
    gates.push({
      cx: 0,
      cz: entranceSide === 'top' ? edgeZ1 - entranceM / 2 : edgeZ0 + entranceM / 2,
      rotY: entranceSide === 'top' ? 0 : Math.PI,
      span: gateSpanTB,
      gateRole: 'combined',
    });
  }

  return {
    boxes,
    wheelStops,
    stripesLR: null,
    dashLR: null,
    dashTB,
    gates,
    cars,
    laneGuideTB: { x: xMid, aisleM, z0: edgeZ0 + 0.4, z1: edgeZ1 - 0.4 },
    laneGuideLR: null,
  };
}

/** Chamfered octagon footprint in XZ; shape XY maps to world X,-Z after mesh Rx=-90 */
function buildChamferedLotShape(lotW, lotH) {
  const hw = lotW / 2;
  const hh = lotH / 2;
  const c = Math.min(3.4, Math.min(hw, hh) * 0.165);
  const shape = new THREE.Shape();
  const ringWz = [
    [-hw + c, -hh],
    [hw - c, -hh],
    [hw, -hh + c],
    [hw, hh - c],
    [hw - c, hh],
    [-hw + c, hh],
    [-hw, hh - c],
    [-hw, -hh + c],
  ];
  const r = ringWz.map(([wx, wz]) => [wx, -wz]);
  shape.moveTo(r[0][0], r[0][1]);
  for (let i = 1; i < r.length; i += 1) shape.lineTo(r[i][0], r[i][1]);
  shape.closePath();
  return shape;
}

function LotAsphaltPad({ lotW, lotH, irregular }) {
  const geo = useMemo(() => {
    if (!irregular) {
      return new THREE.PlaneGeometry(lotW * 1.008, lotH * 1.008, 48, 48);
    }
    const s = buildChamferedLotShape(lotW * 1.008, lotH * 1.008);
    return new THREE.ShapeGeometry(s, 12);
  }, [lotW, lotH, irregular]);
  useLayoutEffect(
    () => () => {
      geo.dispose();
    },
    [geo]
  );
  return (
    <mesh position={[0, ASPHALT_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow geometry={geo}>
      <meshStandardMaterial color={COLORS.asphaltLot} roughness={0.96} metalness={0.025} envMapIntensity={0.28} />
    </mesh>
  );
}

function LotBoundary({ lotW, lotH, irregular }) {
  const geo = useMemo(() => {
    if (!irregular) {
      return new THREE.EdgesGeometry(new THREE.BoxGeometry(lotW, 0.06, lotH));
    }
    const hw = lotW / 2;
    const hh = lotH / 2;
    const c = Math.min(3.4, Math.min(hw, hh) * 0.165);
    const y = ASPHALT_Y + 0.08;
    const ringWz = [
      [-hw + c, -hh],
      [hw - c, -hh],
      [hw, -hh + c],
      [hw, hh - c],
      [hw - c, hh],
      [-hw + c, hh],
      [-hw, hh - c],
      [-hw, -hh + c],
    ];
    const positions = [];
    for (let i = 0; i < ringWz.length; i += 1) {
      const [xa, za] = ringWz[i];
      const [xb, zb] = ringWz[(i + 1) % ringWz.length];
      positions.push(xa, y, za, xb, y, zb);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    return g;
  }, [lotW, lotH, irregular]);
  useLayoutEffect(
    () => () => {
      geo.dispose();
    },
    [geo]
  );
  return (
    <lineSegments position={irregular ? [0, 0, 0] : [0, ASPHALT_Y + 0.08, 0]} geometry={geo}>
      <lineBasicMaterial color="#e2e8f0" transparent opacity={0.85} />
    </lineSegments>
  );
}

/** Short paved stubs past the curb, aligned with gates — reads as drive from grass to entry */
function OuterDrivewayStubs({ lotW, lotH, aisleM, gates }) {
  const len = 7.8;
  const y = GROUND_Y + 0.016;
  const fenceOx = lotW / 2 + CURB_T + FENCE_OUTSIDE_CURB;
  const fenceOz = lotH / 2 + CURB_T + FENCE_OUTSIDE_CURB;
  const stripW = Math.min(aisleM * 0.92, lotW * 0.26);
  const stripD = Math.min(aisleM * 0.9, lotH * 0.34);
  return (
    <group>
      {gates.map((g, i) => {
        const rot = g.rotY ?? 0;
        const tb = Math.abs(Math.sin(rot)) < 0.25;
        if (tb) {
          const out = (g.cz ?? 0) >= 0 ? 1 : -1;
          const zc = out * (fenceOz + len / 2 + 0.22);
          return (
            <mesh key={`out-tb-${i}`} position={[g.cx ?? 0, y, zc]} receiveShadow castShadow>
              <boxGeometry args={[stripW, 0.03, len]} />
              <meshStandardMaterial color={COLORS.asphaltOuter} roughness={0.93} metalness={0.035} envMapIntensity={0.2} />
            </mesh>
          );
        }
        if (Math.abs(Math.sin(rot)) > 0.85) {
          const out = (g.cx ?? 0) >= 0 ? 1 : -1;
          const xc = out * (fenceOx + len / 2 + 0.22);
          return (
            <mesh key={`out-lr-${i}`} position={[xc, y, g.cz ?? 0]} receiveShadow castShadow>
              <boxGeometry args={[len, 0.03, stripD]} />
              <meshStandardMaterial color={COLORS.asphaltOuter} roughness={0.93} metalness={0.035} envMapIntensity={0.2} />
            </mesh>
          );
        }
        return null;
      })}
    </group>
  );
}

/** R3F does not reliably apply `shadow-camera={{...}}`; configure OrthographicCamera imperatively. */
function KeyDirectionalLight({ lotW, lotH }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const light = ref.current;
    if (!light?.shadow?.camera) return;
    const cam = light.shadow.camera;
    cam.near = 0.5;
    cam.far = Math.max(lotW, 200) * 12;
    cam.left = -lotW * 3.5;
    cam.right = lotW * 3.5;
    cam.top = lotH * 3.5;
    cam.bottom = -lotH * 3.5;
    cam.updateProjectionMatrix();
    light.shadow.bias = -0.00028;
    light.shadow.normalBias = 0.028;
  }, [lotW, lotH]);
  return (
    <directionalLight
      ref={ref}
      position={[lotW * 1.5, lotH * 2.8, lotW * 1.1]}
      intensity={1.72}
      color="#ffffff"
      castShadow
      shadow-mapSize={[2048, 2048]}
    />
  );
}

function FillDirectionalLight({ lotW, lotH }) {
  return (
    <directionalLight
      position={[-lotW * 1.1, lotH * 1.6, -lotH * 0.9]}
      intensity={0.42}
      color="#e8eef5"
    />
  );
}

function ParkingLotScene({
  lotWidthM,
  lotHeightM,
  entranceSide,
  gateMode,
  lotShape = 'rectangle',
  cols,
  rowsTop,
  rowsBottom,
  entranceM,
  aisleM,
}) {
  const lotW = Math.max(5, Number(lotWidthM) || 50);
  const lotH = Math.max(5, Number(lotHeightM) || 30);
  const irregular = lotShape === 'irregular';

  const layout = useMemo(
    () =>
      buildLayout({
        lotW,
        lotH,
        entranceSide,
        gateMode,
        cols,
        rowsTop,
        rowsBottom,
        entranceM,
        aisleM,
      }),
    [lotW, lotH, entranceSide, gateMode, cols, rowsTop, rowsBottom, entranceM, aisleM]
  );

  const { boxes, wheelStops, stripesLR, dashLR, dashTB, gates, cars, laneGuideTB, laneGuideLR } = layout;

  const pad = Math.max(lotW, lotH) * 0.42;
  const groundSize = Math.max(lotW, lotH) + pad * 2;

  return (
    <>
      <SiteGrassGround size={groundSize} />
      <LandscapeAccents lotW={lotW} lotH={lotH} />

      <LotAsphaltPad lotW={lotW} lotH={lotH} irregular={irregular} />

      <CurbRing lotW={lotW} lotH={lotH} />
      <LotBoundary lotW={lotW} lotH={lotH} irregular={irregular} />

      {boxes.map((b) => {
        if (b.type === 'stall') {
          return <StallPad key={b.key} position={b.pos} size={b.size} />;
        }
        return <MarkedBox key={b.key} position={b.pos} size={b.size} color={b.color} roughness={b.type === 'aisle' ? 0.92 : 0.9} />;
      })}

      {wheelStops.map((w) => (
        <WheelStop key={w.key} position={w.pos} size={w.size} />
      ))}

      {stripesLR?.top && (
        <StallStripesLR
          parkX0={stripesLR.top.parkX0}
          parkX1={stripesLR.top.parkX1}
          z0={stripesLR.top.z0}
          z1={stripesLR.top.z1}
          cols={stripesLR.top.cols}
          rows={stripesLR.top.rows}
          cellX={stripesLR.top.cellX}
          rowDepth={stripesLR.top.rowDepth}
          zStart={stripesLR.top.zStart}
          downward={stripesLR.top.downward}
        />
      )}
      {stripesLR?.bot && (
        <StallStripesLR
          parkX0={stripesLR.bot.parkX0}
          parkX1={stripesLR.bot.parkX1}
          z0={stripesLR.bot.z0}
          z1={stripesLR.bot.z1}
          cols={stripesLR.bot.cols}
          rows={stripesLR.bot.rows}
          cellX={stripesLR.bot.cellX}
          rowDepth={stripesLR.bot.rowDepth}
          zStart={stripesLR.bot.zStart}
          downward={stripesLR.bot.downward}
        />
      )}

      {dashLR && <DashedLineLR x0={dashLR.x0} x1={dashLR.x1} z={dashLR.z} dashLen={2.8} gapLen={1.6} />}
      {dashTB && <DashedLineTB z0={dashTB.z0} z1={dashTB.z1} x={dashTB.x} dashLen={2.8} gapLen={1.6} />}
      <ThroughLaneEdgeLines laneTB={laneGuideTB} laneLR={laneGuideLR} />

      {cars.map((car) => (
        <ParkedCar
          key={car.key}
          position={car.position}
          rotationY={car.rotationY}
          bodyW={car.bodyW}
          bodyL={car.bodyL}
          colorHex={car.colorHex}
          variant={car.variant}
        />
      ))}

      {gates.map((g, idx) => (
        <SecurityGate key={`gate-${idx}`} cx={g.cx} cz={g.cz} rotY={g.rotY} span={g.span} gateRole={g.gateRole} />
      ))}

      <PerimeterFence lotW={lotW} lotH={lotH} gates={gates} />

      <OuterDrivewayStubs lotW={lotW} lotH={lotH} aisleM={aisleM} gates={gates} />

      <PerimeterLights lotW={lotW} lotH={lotH} />
    </>
  );
}

export default function ParkingLotMockup3D({
  lotWidthM,
  lotHeightM,
  entranceSide,
  gateMode = 'single',
  lotShape = 'rectangle',
  cols,
  rowsTop,
  rowsBottom,
  entranceM,
  aisleM,
}) {
  const lotW = Math.max(5, Number(lotWidthM) || 50);
  const lotH = Math.max(5, Number(lotHeightM) || 30);
  const camD = Math.max(lotW, lotH) * 1.12;
  const pad = Math.max(lotW, lotH) * 0.42;
  const groundContactSize = Math.max(lotW, lotH) + pad * 2;
  const colsCap3d = Math.min(200, Math.max(12, Math.ceil(lotW / 1.65) + 8));
  const rowsCap3d = Math.min(60, Math.max(10, Math.ceil(lotH / 2.4) + 6));
  let colsN = Math.max(1, Math.min(colsCap3d, Math.floor(Number(cols)) || 4));
  let rowsTopN = Math.max(1, Math.min(rowsCap3d, Math.floor(Number(rowsTop)) || 2));
  let rowsBottomN = Math.max(1, Math.min(rowsCap3d, Math.floor(Number(rowsBottom)) || 2));
  const tbFlowEnt = entranceSide === 'top' || entranceSide === 'bottom';
  if (!tbFlowEnt) {
    const maxLRStalls = Math.min(1800, Math.max(420, Math.floor((lotW * lotH) / 16)));
    let cells = colsN * (rowsTopN + rowsBottomN);
    while (cells > maxLRStalls && colsN > 5) {
      colsN -= 1;
      cells = colsN * (rowsTopN + rowsBottomN);
    }
    while (cells > maxLRStalls && rowsTopN + rowsBottomN > 4) {
      if (rowsTopN >= rowsBottomN && rowsTopN > 1) rowsTopN -= 1;
      else if (rowsBottomN > 1) rowsBottomN -= 1;
      else break;
      cells = colsN * (rowsTopN + rowsBottomN);
    }
  }
  const cameraPosition = [camD * 0.88, camD * 0.82, camD * 0.92];

  return (
    <div className="spl-parking-3d">
      <Canvas
        key={`${lotW}-${lotH}-${lotShape}`}
        shadows
        camera={{ position: cameraPosition, fov: 46, near: 0.08, far: lotW * 80 }}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.22,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        dpr={[1, 2]}
      >
        <fog attach="fog" args={['#b8c9d8', lotW * 2.2, lotW * 9]} />
        <color attach="background" args={['#9eb6ca']} />
        <hemisphereLight args={['#f1f5f9', '#575c66', 0.58]} />
        <ambientLight intensity={0.42} />
        <KeyDirectionalLight lotW={lotW} lotH={lotH} />
        <FillDirectionalLight lotW={lotW} lotH={lotH} />
        <Suspense fallback={null}>
          <Environment preset="city" />
        </Suspense>

        <ParkingLotScene
          lotWidthM={lotWidthM}
          lotHeightM={lotHeightM}
          entranceSide={entranceSide}
          gateMode={gateMode}
          lotShape={lotShape}
          cols={colsN}
          rowsTop={rowsTopN}
          rowsBottom={rowsBottomN}
          entranceM={entranceM}
          aisleM={aisleM}
        />

        <ContactShadows
          position={[0, GROUND_Y + 0.018, 0]}
          opacity={0.42}
          scale={groundContactSize}
          blur={3.4}
          far={Math.max(lotW, lotH) * 1.45}
          color="#0c1220"
        />

        <OrbitControls
          makeDefault
          enablePan
          minPolarAngle={0.18}
          maxPolarAngle={Math.PI / 2 - 0.04}
          target={[0, 0, 0]}
          maxDistance={Math.max(lotW, lotH) * 4}
          minDistance={Math.max(lotW, lotH) * 0.35}
        />
      </Canvas>
      <p className="spl-parking-3d-hint">
        Orbit · zoom · metre scale. Turf, trees, mixed vehicle types, fence &amp; gates are illustrative.
        {lotShape === 'irregular' && <> Irregular = chamfered slab; packing still uses the same width × height.</>}
      </p>
    </div>
  );
}
