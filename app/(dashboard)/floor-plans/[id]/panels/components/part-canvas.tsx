"use client";

import { useEffect, useRef } from "react";
import type { Face3 } from "@/lib/design-engine/parts3d";

/** One component as a 3D model you can turn (drag), zoom (wheel) and move (right-drag). */
export function PartCanvas({ faces, height = 420, light = false, spin = true, view }: { faces: Face3[]; height?: number; light?: boolean; spin?: boolean; view?: [number, number, number] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current; if (!el) return;
    let disposed = false, raf = 0, cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;
      const W = el.clientWidth, H = el.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H); renderer.setClearColor(light ? 0xf4f5f7 : 0x1b1d22);
      el.appendChild(renderer.domElement);
      const sc = new THREE.Scene();
      // geometry: every face as a triangle fan, coloured per vertex; outlines for the piece edges
      const pos: number[] = [], col: number[] = [], edge: number[] = [], mpos: number[] = [];
      const c = new THREE.Color();
      for (const f of faces) {
        c.set(f.c);
        const tgt = f.mark ? mpos : pos;
        for (let i = 1; i < f.p.length - 1; i++) for (const v of [f.p[0], f.p[i], f.p[i + 1]]) { tgt.push(v[0], v[1], v[2]); if (!f.mark) col.push(c.r, c.g, c.b); }
        if (!f.mark) for (let i = 0; i < f.p.length; i++) { const a = f.p[i], b = f.p[(i + 1) % f.p.length]; edge.push(...a, ...b); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.25, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      const gm = new THREE.BufferGeometry(); gm.setAttribute("position", new THREE.Float32BufferAttribute(mpos, 3));
      const marks = new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ color: 0x2b3038, side: THREE.DoubleSide }));
      const ge = new THREE.BufferGeometry(); ge.setAttribute("position", new THREE.Float32BufferAttribute(edge, 3));
      const lines = new THREE.LineSegments(ge, new THREE.LineBasicMaterial({ color: 0x3b4250, transparent: true, opacity: 0.45 }));
      const grp = new THREE.Group(); grp.add(mesh, marks, lines); sc.add(grp);
      // fit the camera to the piece
      g.computeBoundingBox(); const bb = g.boundingBox!; const ctr = new THREE.Vector3(); bb.getCenter(ctr); const size = new THREE.Vector3(); bb.getSize(size);
      grp.position.sub(ctr);
      const R = Math.max(size.x, size.y, size.z) || 1;
      // camera along a fixed view direction, as close as the piece fills the frame
      const cam = new THREE.PerspectiveCamera(30, W / H, R / 100, R * 50);
      const dir = new THREE.Vector3(...(view ?? [1.25, 0.9, 1.6])).normalize();
      cam.position.copy(dir.clone().multiplyScalar(R * 3)); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      const inv = cam.matrixWorldInverse; let ex = 0, ey = 0, ez = 0;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        const v = new THREE.Vector3(x - ctr.x, y - ctr.y, z - ctr.z).applyMatrix4(inv).sub(new THREE.Vector3(0, 0, -R * 3));
        ex = Math.max(ex, Math.abs(v.x)); ey = Math.max(ey, Math.abs(v.y)); ez = Math.max(ez, Math.abs(v.z));
      }
      const ty = Math.tan((cam.fov * Math.PI) / 360), tx = ty * cam.aspect;
      const dist = Math.max(ex / tx, ey / ty) * 1.1 + ez * 0.5;
      cam.position.copy(dir.multiplyScalar(dist)); cam.near = dist / 100; cam.far = dist * 20; cam.updateProjectionMatrix();
      const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.autoRotate = spin; ctl.autoRotateSpeed = 1.6;
      sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(R, R * 2, R * 1.5); sc.add(sun);
      const back = new THREE.DirectionalLight(0xffffff, 0.5); back.position.set(-R, R * 0.5, -R); sc.add(back);
      const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(sc, cam); };
      loop();
      cleanup = () => { cancelAnimationFrame(raf); ctl.dispose(); renderer.dispose(); g.dispose(); gm.dispose(); ge.dispose(); el.removeChild(renderer.domElement); };
    })();
    return () => { disposed = true; cleanup(); };
  }, [faces, light, spin, view]);
  return <div ref={host} style={{ height }} className="w-full overflow-hidden rounded-md" />;
}
