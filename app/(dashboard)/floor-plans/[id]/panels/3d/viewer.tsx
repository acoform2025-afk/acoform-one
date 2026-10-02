"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene3 } from "@/lib/floor-plans/scene3d";

type Layer = "walls" | "wallPanels" | "deck" | "slab" | "beams" | "issues";
const LABEL: Record<Layer, string> = { walls: "Concrete walls", wallPanels: "Wall panels", deck: "Deck panels", slab: "Slab", beams: "Beams", issues: "Design check" };
const COLOR = { std: 0x7aa7e0, top: 0xf2c76b, fill: 0xe0605a, deck: 0x9fd3c7, dspec: 0xe0605a, wall: 0x9aa59a, slab: 0xd9d9d9, beam: 0xb08968 };

export function Viewer3D({ scene, focus }: { scene: Scene3; focus?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ set: (l: Layer, v: boolean) => void; view: (v: "3d" | "top" | "front") => void } | null>(null);
  const [on, setOn] = useState<Record<Layer, boolean>>({ walls: true, wallPanels: true, deck: true, slab: false, beams: true, issues: true });
  const [pick, setPick] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false, raf = 0;
    const el = host.current; if (!el) return;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        if (disposed) return;
        const W = el.clientWidth, Hh = el.clientHeight;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(W, Hh); renderer.setClearColor(0x1b1d22);
        el.appendChild(renderer.domElement);
        const sc = new THREE.Scene();
        const [x0, y0, x1, y1] = scene.box; const cx = (x0 + x1) / 2, cz = (y0 + y1) / 2, span = Math.max(x1 - x0, y1 - y0, 5);
        const cam = new THREE.PerspectiveCamera(40, W / Hh, 0.05, span * 20);
        const ctr = new OrbitControls(cam, renderer.domElement); ctr.target.set(cx, scene.H / 2, cz); ctr.enableDamping = true;
        sc.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(cx + span, span * 1.5, cz + span * 0.7); sc.add(sun);
        const groups: Record<Layer, InstanceType<typeof THREE.Group>> = { walls: new THREE.Group(), wallPanels: new THREE.Group(), deck: new THREE.Group(), slab: new THREE.Group(), beams: new THREE.Group(), issues: new THREE.Group() };
        Object.values(groups).forEach((g) => sc.add(g));

        // plan (x, y-down) → shape (x, -y), extruded along +z, rotated so the extrusion goes up
        const extrude = (polys: Scene3["walls"], depth: number, base: number, color: number, opacity = 1) => {
          const shapes = polys.map((poly) => {
            const s = new THREE.Shape(poly[0].map(([x, y]) => new THREE.Vector2(x, -y)));
            for (const h of poly.slice(1)) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, -y))));
            return s;
          });
          const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
          g.rotateX(-Math.PI / 2); g.translate(0, base, 0);
          return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: 0.9 }));
        };
        if (scene.walls.length) groups.walls.add(extrude(scene.walls, scene.H, 0, COLOR.wall));
        if (scene.slabPoly.length) groups.slab.add(extrude(scene.slabPoly, scene.slab, scene.H, COLOR.slab, 0.55));
        for (const b of scene.beams) {
          const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L = Math.hypot(dx, dz), h = b.d - scene.slab; if (!L || h <= 0) continue;
          const m = new THREE.Mesh(new THREE.BoxGeometry(L, h, b.w), new THREE.MeshStandardMaterial({ color: COLOR.beam, roughness: 0.9 }));
          m.position.set((b.a[0] + b.b[0]) / 2, scene.H - h / 2, (b.a[1] + b.b[1]) / 2); m.rotation.y = -Math.atan2(dz, dx);
          groups.beams.add(m);
        }
        // panels: one mesh + outline per kind; quad index kept for picking
        const pickables: { mesh: InstanceType<typeof THREE.Mesh>; list: Scene3["panels"] }[] = [];
        for (const k of ["std", "top", "fill", "deck", "dspec"] as const) {
          const list = scene.panels.filter((p) => p.k === k); if (!list.length) continue;
          const pos = new Float32Array(list.length * 18), edge = new Float32Array(list.length * 24);
          list.forEach((q, i) => {
            const [a, b, c, d] = q.p;
            [a, b, c, a, c, d].forEach((v, j) => pos.set(v, i * 18 + j * 3));
            [a, b, b, c, c, d, d, a].forEach((v, j) => edge.set(v, i * 24 + j * 3));
          });
          const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
          const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COLOR[k], side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 }));
          const eg = new THREE.BufferGeometry(); eg.setAttribute("position", new THREE.BufferAttribute(edge, 3));
          const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1f2937 }));
          const grp = k === "deck" || k === "dspec" ? groups.deck : groups.wallPanels;
          grp.add(mesh, lines); pickables.push({ mesh, list });
        }
        if (scene.mb.length) {
          const arr = new Float32Array(scene.mb.length * 6);
          scene.mb.forEach(([a, b], i) => arr.set([a[0], scene.H - 0.02, a[1], b[0], scene.H - 0.02, b[1]], i * 6));
          const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
          groups.deck.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2563eb })));
        }
        // design-check markers: a red (error) / amber (warning) ball on a pole at the spot
        const marks: { mesh: InstanceType<typeof THREE.Mesh>; text: string }[] = [];
        const rBall = Math.max(0.12, Math.min(0.35, span / 120));
        for (const is of scene.issues ?? []) {
          const col = is.sev === "error" ? 0xef4444 : 0xf59e0b;
          const ball = new THREE.Mesh(new THREE.SphereGeometry(rBall, 16, 12), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9 }));
          ball.position.set(is.at[0], is.y + rBall * 2.5, is.at[1]); ball.renderOrder = 10;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(rBall * 0.15, rBall * 0.15, rBall * 2.5, 6), new THREE.MeshBasicMaterial({ color: col }));
          pole.position.set(is.at[0], is.y + rBall * 1.25, is.at[1]);
          groups.issues.add(ball, pole); marks.push({ mesh: ball, text: `${is.id} · ${is.text}` });
        }
        const view = (v: "3d" | "top" | "front") => {
          if (v === "top") cam.position.set(cx, span * 1.6, cz + 0.001);
          else if (v === "front") cam.position.set(cx, scene.H / 2, cz + span * 1.3);
          else cam.position.set(cx + span * 0.55, span * 0.6, cz + span * 0.7);
          ctr.target.set(cx, v === "top" ? 0 : scene.H / 2, cz); ctr.update();
        };
        view("3d");
        const f = focus ? (scene.issues ?? []).find((i) => i.id === focus) : undefined;
        if (f) {
          const d = Math.max(4, span * 0.12);
          cam.position.set(f.at[0] + d * 0.6, f.y + d * 0.8, f.at[1] + d * 0.8); ctr.target.set(f.at[0], f.y, f.at[1]); ctr.update();
          setPick(`${f.id} · ${f.text}`);
        }
        api.current = { set: (l, v) => { groups[l].visible = v; }, view };
        (Object.keys(groups) as Layer[]).forEach((l) => { groups[l].visible = on[l]; });

        const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
        const onClick = (e: MouseEvent) => {
          const r = renderer.domElement.getBoundingClientRect();
          mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(mouse, cam);
          if (groups.issues.visible) {
            const mh = ray.intersectObjects(marks.map((m) => m.mesh), false)[0];
            if (mh) { setPick(marks.find((m) => m.mesh === mh.object)?.text ?? null); return; }
          }
          const vis = pickables.filter((p) => p.mesh.parent?.visible);
          const hit = ray.intersectObjects(vis.map((p) => p.mesh), false)[0];
          if (!hit) { setPick(null); return; }
          const owner = vis.find((p) => p.mesh === hit.object); const q = owner?.list[Math.floor((hit.faceIndex ?? 0) / 2)];
          setPick(q ? q.c : null);
        };
        renderer.domElement.addEventListener("click", onClick);
        const onResize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
        window.addEventListener("resize", onResize);
        const loop = () => { ctr.update(); renderer.render(sc, cam); raf = requestAnimationFrame(loop); };
        loop();
        cleanup = () => {
          cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); renderer.domElement.removeEventListener("click", onClick);
          ctr.dispose(); renderer.dispose(); sc.traverse((o) => { const m = o as { geometry?: { dispose: () => void } }; m.geometry?.dispose(); });
          renderer.domElement.remove();
        };
      } catch (e) {
        setErr(e instanceof Error ? e.message : "3D view could not start (WebGL not available?).");
      }
    })();
    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, focus]);

  const toggle = (l: Layer) => setOn((o) => { const v = !o[l]; api.current?.set(l, v); return { ...o, [l]: v }; });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {(Object.keys(LABEL) as Layer[]).map((l) => (
          <button key={l} type="button" onClick={() => toggle(l)}
            className={`rounded-md px-2.5 py-1.5 text-xs ${on[l] ? "bg-brand-orange text-white" : "border border-graphite-700 text-graphite-300 hover:bg-graphite-800"}`}>{LABEL[l]}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-graphite-700" />
        {(["3d", "top", "front"] as const).map((v) => (
          <button key={v} type="button" onClick={() => api.current?.view(v)} className="rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">{v === "3d" ? "3D view" : v === "top" ? "Top view" : "Front view"}</button>
        ))}
      </div>
      <div ref={host} className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-graphite-800">
        {err ? <p className="p-4 text-sm text-signal-red">{err}</p> : null}
        {pick ? <div className="absolute left-2 top-2 max-w-[90%] rounded bg-white/90 px-2 py-1 text-xs font-medium text-graphite-900">{pick}</div> : null}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite-400">
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#7aa7e0" }} />standard wall panel</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#f2c76b" }} />wall-top piece</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#9fd3c7" }} />deck panel</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#e0605a" }} />special / filler</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full" style={{ background: "#ef4444" }} />design-check error</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full" style={{ background: "#f59e0b" }} />warning</span>
        <span>· drag to rotate · right-drag to move · scroll to zoom · click a panel or a ball to see its number / problem</span>
      </p>
    </div>
  );
}
