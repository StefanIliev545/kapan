"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * 3D "how it works" scene — Kapan logo at origin, protocol logos positioned
 * on an ellipse around it, glowing tracer beams shuttling back-and-forth
 * along each spoke to represent instructions traveling out to each
 * protocol and UTXOs returning. Same visual vocabulary as the hero scene
 * (olive wire, bright tac-green tracers) so the landing reads coherent.
 *
 * Design choices:
 *  - Ellipse instead of circle because the host container is wider than
 *    tall; circle would clip vertically.
 *  - Logos rendered via `<sprite>` so they always face the camera.
 *  - Logo textures are rasterized through a fixed-size canvas (handles SVG
 *    + PNG uniformly; SVGs have no intrinsic pixel size when loaded via
 *    `<Image>`).
 *  - Tracer beams are `lineSegments` with per-vertex colors (tail dark,
 *    head bright) + additive blending — cheap and consistent with the
 *    `EdgeTrails` pattern used by `HeroScene`.
 */

// Each spoke carries its own tracer color — roughly mapped to the kind of
// instruction that flows toward that protocol (deposit/borrow/swap/etc).
// Colors are picked to stay harmonious on the dark bg while remaining
// distinguishable without labels.
const PROTOCOLS = [
  { name: "Aave", logo: "/logos/aave.svg", angle: 0, color: "#7dff6b" }, // deposit · green
  { name: "Morpho", logo: "/logos/morpho.svg", angle: 45, color: "#ff8a5c" }, // borrow · orange
  { name: "Compound", logo: "/logos/compound.svg", angle: 90, color: "#6bd5ff" }, // swap · cyan
  { name: "1inch", logo: "/logos/1inch.png", angle: 135, color: "#ffd560" }, // swap · yellow
  { name: "Pendle", logo: "/logos/pendle.png", angle: 180, color: "#ff6b9a" }, // PT · pink
  { name: "Venus", logo: "/logos/venus.svg", angle: 225, color: "#b06bff" }, // repay · violet
  { name: "Nostra", logo: "/logos/nostra.svg", angle: 270, color: "#5ce0a0" }, // move · mint
  { name: "Euler", logo: "/logos/euler.svg", angle: 315, color: "#ffb36b" }, // vault · amber
];

const WIRE_COLOR = "#5d7c42";
// Ring radii (world units). Wider than tall to match the host container
// aspect — see camera math below.
const RX = 1.95;
const RY = 1.35;

function useLogoTextures(urls: string[]) {
  const [textures, setTextures] = useState<(THREE.Texture | null)[]>(() => urls.map(() => null));
  useEffect(() => {
    let cancelled = false;
    const size = 128;
    Promise.all(
      urls.map(
        url =>
          new Promise<THREE.Texture | null>(resolve => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext("2d");
              if (!ctx) return resolve(null);
              ctx.drawImage(img, 0, 0, size, size);
              const tex = new THREE.CanvasTexture(canvas);
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.needsUpdate = true;
              resolve(tex);
            };
            img.onerror = () => resolve(null);
            img.src = url;
          }),
      ),
    ).then(loaded => {
      if (!cancelled) setTextures(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [urls]);
  return textures;
}

function Scene() {
  const kapanTex = useLogoTextures(useMemo(() => ["/seal-logo.png"], []))[0];
  const protocolUrls = useMemo(() => PROTOCOLS.map(p => p.logo), []);
  const protocolTexs = useLogoTextures(protocolUrls);

  const positions = useMemo(
    () =>
      PROTOCOLS.map(p => {
        const rad = ((p.angle - 90) * Math.PI) / 180;
        return new THREE.Vector3(Math.cos(rad) * RX, -Math.sin(rad) * RY, 0);
      }),
    [],
  );

  // Static spoke geometry — origin → each protocol, all packed into one
  // lineSegments. This is purely visual (the faint "wire" of each spoke).
  const lineGeom = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(positions.length * 6);
    positions.forEach((p, i) => {
      verts[i * 6 + 0] = 0;
      verts[i * 6 + 1] = 0;
      verts[i * 6 + 2] = 0;
      verts[i * 6 + 3] = p.x;
      verts[i * 6 + 4] = p.y;
      verts[i * 6 + 5] = p.z;
    });
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    return geo;
  }, [positions]);

  // Animated tracer beams. Each slot owns one spoke and bounces along it —
  // outbound to the protocol, then returning to Kapan — giving the
  // "instruction dispatched / UTXO returned" visual.
  const beamRef = useRef<THREE.LineSegments>(null);
  const slots = useMemo(
    () =>
      positions.map((_, i) => ({
        t: Math.random(),
        dir: 1 as 1 | -1,
        speed: 0.32 + Math.random() * 0.18,
        // Stagger initial delays so beams aren't in sync.
        delay: (i / positions.length) * 1.2,
      })),
    [positions],
  );

  const { beamPositions, beamColors } = useMemo(() => {
    const n = positions.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Color(PROTOCOLS[i].color);
      // Tail vertex is dark (additive blending → no contribution).
      col[i * 6 + 0] = 0;
      col[i * 6 + 1] = 0;
      col[i * 6 + 2] = 0;
      // Head vertex is the protocol's tracer color.
      col[i * 6 + 3] = c.r;
      col[i * 6 + 4] = c.g;
      col[i * 6 + 5] = c.b;
    }
    return { beamPositions: pos, beamColors: col };
  }, [positions]);

  useFrame((_, delta) => {
    const ls = beamRef.current;
    if (!ls) return;
    const posAttr = ls.geometry.getAttribute("position") as THREE.BufferAttribute;
    const TRAIL = 0.28;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.delay > 0) {
        s.delay -= delta;
        // Before launch: collapse both endpoints so the beam is invisible.
        for (let j = 0; j < 6; j++) beamPositions[i * 6 + j] = 0;
        continue;
      }
      s.t += delta * s.speed * s.dir;
      // Ping-pong between origin (t=0) and protocol (t=1). A tiny hold at
      // each end before reversing makes arrivals feel deliberate.
      if (s.t >= 1) {
        s.dir = -1;
        s.t = 1;
      } else if (s.t <= 0) {
        s.dir = 1;
        s.t = 0;
      }
      const head = s.t;
      const tail = THREE.MathUtils.clamp(head - TRAIL * s.dir, 0, 1);
      const p = positions[i];
      beamPositions[i * 6 + 0] = p.x * tail;
      beamPositions[i * 6 + 1] = p.y * tail;
      beamPositions[i * 6 + 2] = p.z * tail;
      beamPositions[i * 6 + 3] = p.x * head;
      beamPositions[i * 6 + 4] = p.y * head;
      beamPositions[i * 6 + 5] = p.z * head;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <>
      {/* Static spokes — dim olive, always visible. */}
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial
          color={WIRE_COLOR}
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Tracer beams — animated per-frame. */}
      <lineSegments ref={beamRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[beamPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[beamColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Kapan logo at the center. */}
      {kapanTex && (
        <sprite position={[0, 0, 0]} scale={[0.85, 0.85, 0.85]}>
          <spriteMaterial map={kapanTex} transparent depthWrite={false} />
        </sprite>
      )}

      {/* Protocol logos on the ring. */}
      {positions.map((p, i) => {
        const tex = protocolTexs[i];
        if (!tex) return null;
        return (
          <sprite key={i} position={[p.x, p.y, p.z]} scale={[0.55, 0.55, 0.55]}>
            <spriteMaterial map={tex} transparent depthWrite={false} />
          </sprite>
        );
      })}
    </>
  );
}

export function HowItWorksScene() {
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        // fov + z chosen so the ring (RX=1.95, RY=1.35) comfortably fills
        // the 2xl × 350px container without clipping.
        camera={{ position: [0, 0, 4.8], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}

export default HowItWorksScene;
