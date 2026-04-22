"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Short line-segment "trails" that travel along edges — visually a beam of
 * light running through the wire with a dim tail and bright head.
 *
 * Implementation: one `lineSegments` buffer holding N segments (2 verts
 * each). Each segment is pinned to a random edge. Per-frame we advance a
 * head `t` along that edge and place the tail at `t - trailLen` (clamped
 * to 0). Vertex colors are baked once — tail black, head full color —
 * with additive blending making the near-tail portions bleed into dim
 * glow and the head punch bright.
 *
 * Cheap: per frame it's `count * 6` float writes + one position upload.
 * Geometry never resizes.
 */
function EdgeTrails({
  lineGeom,
  color,
  count = 10,
  speed = 0.45,
  opacity = 1,
  trailLen = 0.4,
}: {
  lineGeom: THREE.EdgesGeometry;
  color: string;
  count?: number;
  speed?: number;
  opacity?: number;
  /** Fraction of the edge length the tail extends behind the head. */
  trailLen?: number;
}) {
  const ref = useRef<THREE.LineSegments>(null);

  const { positions, colors, edges, ts, speeds, allEdges, edgeCount } = useMemo(() => {
    const attr = lineGeom.getAttribute("position") as THREE.BufferAttribute;
    const allEdges = attr.array as Float32Array;
    const edgeCount = allEdges.length / 6;
    const take = Math.min(count, edgeCount);
    const edges = new Float32Array(take * 6);
    for (let i = 0; i < take; i++) {
      const src = Math.floor(Math.random() * edgeCount) * 6;
      for (let j = 0; j < 6; j++) edges[i * 6 + j] = allEdges[src + j];
    }
    const c = new THREE.Color(color);
    const colors = new Float32Array(take * 6);
    for (let i = 0; i < take; i++) {
      // Tail vertex (dark) — additive blending means this contributes nothing.
      colors[i * 6 + 0] = 0;
      colors[i * 6 + 1] = 0;
      colors[i * 6 + 2] = 0;
      // Head vertex (full color).
      colors[i * 6 + 3] = c.r;
      colors[i * 6 + 4] = c.g;
      colors[i * 6 + 5] = c.b;
    }
    return {
      positions: new Float32Array(take * 6),
      colors,
      edges,
      ts: new Float32Array(take).map(() => Math.random()),
      speeds: new Float32Array(take).map(() => speed * (0.6 + Math.random() * 0.8)),
      allEdges,
      edgeCount,
    };
  }, [lineGeom, color, count, speed]);

  useFrame((_, delta) => {
    const ls = ref.current;
    if (!ls) return;
    const posAttr = ls.geometry.getAttribute("position") as THREE.BufferAttribute;
    // We let `t` run past 1 by `trailLen` so the tail can follow the head
    // all the way to the edge endpoint before we teleport to the next edge.
    // Without this the tail snaps away the moment the head reaches the
    // vertex — visually the beam "disappears" instead of flowing out.
    const LIFESPAN = 1 + trailLen;
    for (let i = 0; i < ts.length; i++) {
      ts[i] += speeds[i] * delta;
      if (ts[i] > LIFESPAN) {
        // Beam fully exited — hop to a new random edge and pick a new speed
        // so traffic doesn't lock to repeated A→B pairings.
        ts[i] -= LIFESPAN;
        const src = Math.floor(Math.random() * edgeCount) * 6;
        const dst = i * 6;
        for (let j = 0; j < 6; j++) edges[dst + j] = allEdges[src + j];
        speeds[i] = speed * (0.6 + Math.random() * 0.8);
      }
      // Head rides the edge from 0→1 then clamps at 1 during the exit phase.
      const headT = Math.min(ts[i], 1);
      const tailT = Math.max(0, ts[i] - trailLen);
      const e = i * 6;
      const p = i * 6;
      const dx = edges[e + 3] - edges[e + 0];
      const dy = edges[e + 4] - edges[e + 1];
      const dz = edges[e + 5] - edges[e + 2];
      // Tail vertex
      positions[p + 0] = edges[e + 0] + dx * tailT;
      positions[p + 1] = edges[e + 1] + dy * tailT;
      positions[p + 2] = edges[e + 2] + dz * tailT;
      // Head vertex
      positions[p + 3] = edges[e + 0] + dx * headT;
      positions[p + 4] = edges[e + 1] + dy * headT;
      positions[p + 5] = edges[e + 2] + dz * headT;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/**
 * Techy/schematic landing hero: a slow-rotating icosahedron rendered as a
 * wireframe with a glowing point cloud at each vertex. No HDRI, no post-
 * processing, no custom shader material — just `lineSegments` + `points`
 * primitives with basic materials. Visually reads as "network graph /
 * protocol topology" which is on-brand for Kapan's routing theme.
 *
 * Why this is much cheaper than the previous version:
 *   - No environment map → no cubemap sample, no HDRI decode/upload
 *   - No PBR material → no reflection/roughness pass per pixel
 *   - No distort material → no per-vertex shader animation
 *   - Geometry evaluated once; we only rotate the group on frame
 */

const OUTER_DETAIL = 1; // structural cage — faceted sphere (42 verts, 120 edges)
// MW2 night-vision palette — muted olive wire, bright tac-green tracer.
const OUTER_COLOR = "#5d7c42";
const OUTER_OPACITY = 0.7;
const TRAIL_COLOR = "#c3ff6b";

function Network() {
  const outerRef = useRef<THREE.Group>(null);

  const { outerLineGeom, outerPointGeom } = useMemo(() => {
    // Single cage mesh — the scene is just this shell now.
    const outerIco = new THREE.IcosahedronGeometry(1, OUTER_DETAIL);
    const outerLineGeom = new THREE.EdgesGeometry(outerIco);
    const outerPointGeom = new THREE.BufferGeometry();
    outerPointGeom.setAttribute("position", outerIco.getAttribute("position"));
    outerIco.dispose();

    return { outerLineGeom, outerPointGeom };
  }, []);

  useFrame((_, delta) => {
    const outer = outerRef.current;
    if (outer) {
      // Slow enough to read as "drifting" rather than "spinning". Previous
      // rates (0.05 / 0.07 / 0.03 rad/s) caused motion-sickness complaints.
      outer.rotation.x += delta * 0.012;
      outer.rotation.y += delta * 0.018;
      outer.rotation.z += delta * 0.008;
    }
  });

  return (
    <>
      <group ref={outerRef} scale={[2.7, 2.7, 2.7]} rotation={[Math.PI / 4, 0, 0]}>
        <lineSegments geometry={outerLineGeom}>
          <lineBasicMaterial
            color={OUTER_COLOR}
            transparent
            opacity={OUTER_OPACITY}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
        <points geometry={outerPointGeom}>
          <pointsMaterial
            color={OUTER_COLOR}
            size={0.06}
            sizeAttenuation
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
        <EdgeTrails
          lineGeom={outerLineGeom}
          color={TRAIL_COLOR}
          count={14}
          speed={0.22}
          trailLen={0.6}
          opacity={0.9}
        />
      </group>
    </>
  );
}

export function HeroScene() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        // Camera is intentionally inside the outer shell (radius 2.7 after
        // the group's scale) — sitting at z=1.8 puts the viewer ~0.9 units
        // inside the cage. Wider FOV (60) makes the wireframe wrap around
        // more of the frame instead of reading as a contained object.
        camera={{ position: [0, 0, 1.8], fov: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        // r3f's Canvas forces `pointerEvents: 'auto'` inline on its root div,
        // which overrides the `pointer-events-none` class on our wrapper and
        // swallows clicks meant for the Launch App CTA underneath. Inline
        // style here wins because Canvas spreads user style after its default.
        style={{ pointerEvents: "none" }}
      >
        <Network />
      </Canvas>
    </div>
  );
}

export default HeroScene;
