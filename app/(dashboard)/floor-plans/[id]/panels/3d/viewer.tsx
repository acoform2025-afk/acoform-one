"use client";

import { useEffect, useRef, useState } from "react";
import type { Scene3 } from "@/lib/floor-plans/scene3d";

type Layer = "walls" | "columns" | "wallPanels" | "fillers" | "corners" | "deck" | "slab" | "beams" | "stairs" | "arch" | "issues";
const LABEL: Record<Layer, string> = { walls: "Concrete walls", columns: "Columns", wallPanels: "Wall panels", fillers: "Fillers / specials", corners: "Corners & kickers", deck: "Deck panels", slab: "Slab", beams: "Beams", stairs: "Staircase", arch: "Railings & projections", issues: "Design check" };
const COLOR = { std: 0x7aa7e0, top: 0xf2c76b, fill: 0xff3fb3, deck: 0x9fd3c7, dspec: 0xff8ad1, ic: 0x34d399, ec: 0x10b981, sc: 0xa78bfa, kick: 0xfb923c, bside: 0xd4a373, bbot: 0xb08968, col: 0xfcd34d, stair: 0xc9b79c, riser: 0xe7d3b8, wall: 0x9aa59a, slab: 0xd9d9d9, beam: 0xb08968, colC: 0x8b8f99 };
const KIND_LAYER: Record<Scene3["panels"][number]["k"], Layer> = { std: "wallPanels", top: "wallPanels", fill: "fillers", deck: "deck", dspec: "fillers", ic: "corners", ec: "corners", sc: "corners", kick: "corners", bside: "beams", bbot: "beams", col: "columns", stair: "stairs", riser: "stairs" };
const KIND_LABEL: Record<Scene3["panels"][number]["k"], string> = { std: "standard wall panel", top: "wall-top piece", fill: "wall filler (non-standard width)", deck: "deck panel", dspec: "deck filler / special", ic: "internal corner", ec: "external corner", sc: "soffit corner", kick: "kicker", bside: "beam side panel", bbot: "beam bottom", col: "column panel", stair: "stair soffit", riser: "riser panel" };

const span = (sc: Scene3) => Math.max(sc.box[2] - sc.box[0], sc.box[3] - sc.box[1], 5);

/** The whole building: levels from the bottom up, each at its height, drawn from one of the scenes (null = not formed with this set). */
export type Stack3 = { levels: { key: string; name: string; kind: string; y0: number; h: number; sceneIdx: number | null; own: boolean }[]; scenes: Scene3[] };

export function Viewer3D({ scene, focus, stack }: { scene: Scene3; focus?: string; stack?: Stack3 }) {
  const host = useRef<HTMLDivElement>(null);
  type View = "3d" | "top" | "front" | "back" | "left" | "right";
  const api = useRef<{ set: (l: Layer, v: boolean) => void; view: (v: View) => void; turn: (deg: number) => void; cut: (y: number | null) => void; flyTo: (x: number, y: number, z: number, dist?: number) => void; highlight: (test: ((p: Scene3["panels"][number]) => boolean) | null) => number } | null>(null);
  const [on, setOn] = useState<Record<Layer, boolean>>({ walls: true, columns: true, wallPanels: true, fillers: true, corners: true, deck: true, slab: false, beams: true, stairs: true, arch: true, issues: true });
  const [pick, setPick] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cut, setCut] = useState<number>(100);          // % of the floor height shown (section cut from the top)
  const [zone, setZone] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [hits, setHits] = useState<number | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const totalH = stack ? stack.levels.reduce((s, l) => s + l.h, 0) : scene.H + scene.slab;
  const top = totalH + 0.3;
  const [lvl, setLvl] = useState<string>("");        // whole building: the level the room / find tools work on

  useEffect(() => {
    let disposed = false, raf = 0;
    const el = host.current; if (!el) return;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { TrackballControls } = await import("three/examples/jsm/controls/TrackballControls.js");
        if (disposed) return;
        const W = el.clientWidth, Hh = el.clientHeight;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(W, Hh); renderer.setClearColor(0x1b1d22);
        el.appendChild(renderer.domElement);
        const sc = new THREE.Scene();
        const [x0, y0, x1, y1] = scene.box; const cx = (x0 + x1) / 2, cz = (y0 + y1) / 2, span = Math.max(x1 - x0, y1 - y0, 5);
        const cam = new THREE.PerspectiveCamera(40, W / Hh, 0.05, Math.max(span, totalH) * 20);
        // free rotation with the mouse in every direction (over the top, from underneath — no stops), right-drag moves, wheel zooms
        const ctr = new TrackballControls(cam, renderer.domElement); ctr.target.set(cx, totalH / 2, cz);
        ctr.rotateSpeed = 3; ctr.zoomSpeed = 1.2; ctr.panSpeed = 0.8; ctr.dynamicDampingFactor = 0.15;
        ctr.minDistance = 0.5; ctr.maxDistance = Math.max(span, totalH) * 6;
        sc.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(cx + span, totalH + span * 1.5, cz + span * 0.7); sc.add(sun);
        const groups: Record<Layer, InstanceType<typeof THREE.Group>> = { walls: new THREE.Group(), columns: new THREE.Group(), wallPanels: new THREE.Group(), fillers: new THREE.Group(), corners: new THREE.Group(), deck: new THREE.Group(), slab: new THREE.Group(), beams: new THREE.Group(), stairs: new THREE.Group(), arch: new THREE.Group(), issues: new THREE.Group() };
        // section cut: everything above the cut height is clipped away (slider)
        const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), top);
        renderer.clippingPlanes = [clip];
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
        type Pickable = { mesh: InstanceType<typeof THREE.Mesh>; list: Scene3["panels"]; base: InstanceType<typeof THREE.Color>; colors: Float32Array; level: string };
        const pickables: Pickable[] = [];
        const marks: { mesh: InstanceType<typeof THREE.Mesh>; text: string }[] = [];
        const rBall = Math.max(0.12, Math.min(0.35, span / 120));
        // one floor's formwork, lifted to y0; the pieces of one scene share their geometry across the floors it is drawn on
        const geoCache = new Map<Scene3, Map<string, { pos: Float32Array; edge: Float32Array; list: Scene3["panels"]; base: InstanceType<typeof THREE.Color>; colors: Float32Array }>>();
        const addFloor = (fl: Scene3, y0: number, levelName: string, withIssues: boolean, h?: number) => {
          // everything of this floor goes into one sub-group per layer, placed at y0 and stretched to the level height
          const k = h ? h / (fl.H + fl.slab) : 1;
          const subs = new Map<Layer, InstanceType<typeof THREE.Group>>();
          const sub = (l: Layer) => { let g = subs.get(l); if (!g) { g = new THREE.Group(); g.position.y = y0; g.scale.y = k; groups[l].add(g); subs.set(l, g); } return g; };
          const G = new Proxy({} as Record<Layer, InstanceType<typeof THREE.Group>>, { get: (_t, l: string) => sub(l as Layer) });
          const lift = (m: InstanceType<typeof THREE.Object3D>) => m;
          if (fl.walls.length) G.walls.add(lift(extrude(fl.walls, fl.H, 0, COLOR.wall)));
          // sill walls under windows, lintels over doors / windows, glass in the windows
          for (const wb of fl.wallBits ?? []) G.walls.add(extrude([wb.poly], wb.z1 - wb.z0, wb.z0, wb.infill ? 0xd9cfbf : COLOR.wall));
          // railings (a see-through fence 1 m high), parapet walls (0.9 m), sunshades / projections (a thin slab at lintel level)
          if (fl.arch?.length) {
            const railM = new THREE.MeshStandardMaterial({ color: 0xc9d1d9, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
            const parM = new THREE.MeshStandardMaterial({ color: 0xb7b9ad, side: THREE.DoubleSide, roughness: 0.9 });
            const projM = new THREE.MeshStandardMaterial({ color: 0xa7a99d, side: THREE.DoubleSide, roughness: 0.9 });
            const railV: number[] = [], railTop: number[] = [], parV: number[] = [], projV: number[] = [];
            const quad = (arr: number[], a: [number, number], b: [number, number], z0: number, z1: number) => arr.push(a[0], z0, a[1], b[0], z0, b[1], b[0], z1, b[1], a[0], z0, a[1], b[0], z1, b[1], a[0], z1, a[1]);
            for (const it of fl.arch) {
              if (it.k === "proj" && it.ring) { G.arch.add(extrude([[it.ring]], 0.08, 2.1, 0xa7a99d)); continue; }
              if (!it.a || !it.b) continue;
              if (it.k === "rail") { quad(railV, it.a, it.b, 0, 1.0); railTop.push(it.a[0], 1.0, it.a[1], it.b[0], 1.0, it.b[1]); }
              else if (it.k === "parapet") quad(parV, it.a, it.b, 0, 0.9);
              else quad(projV, it.a, it.b, 2.1, 2.18);
            }
            const mk = (v: number[], m: InstanceType<typeof THREE.MeshStandardMaterial>) => { if (!v.length) return; const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3)); g.computeVertexNormals(); G.arch.add(new THREE.Mesh(g, m)); };
            mk(railV, railM); mk(parV, parM); mk(projV, projM);
            if (railTop.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(railTop), 3)); G.arch.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe5e7eb }))); }
          }
          if (fl.glass?.length) {
            const gm = new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x1c4a66, transparent: true, opacity: 0.75, side: THREE.DoubleSide, roughness: 0.1, metalness: 0.2, depthWrite: false });
            const dm = new THREE.MeshStandardMaterial({ color: 0x5b4636, side: THREE.DoubleSide, roughness: 0.8 });
            for (const gl of fl.glass) {
              const [a, b, c, d] = gl.p; const g = new THREE.BufferGeometry();
              g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3)); g.computeVertexNormals();
              G.walls.add(new THREE.Mesh(g, gl.door ? dm : gm));
            }
          }
          if (fl.slabPoly.length) G.slab.add(lift(extrude(fl.slabPoly, fl.slab, fl.H, COLOR.slab, 0.55)));
          if (fl.cols?.length) G.columns.add(lift(extrude(fl.cols.map((r) => [r]), fl.H, 0, COLOR.colC)));
          // beams drawn on the plan: their outline from the soffit down to the beam bottom
          const byD = new Map<number, Scene3["walls"]>();
          for (const b of fl.beamSolids ?? []) { const h = Math.round((b.d - fl.slab) * 1000) / 1000; if (h <= 0) continue; (byD.get(h) ?? byD.set(h, []).get(h)!).push([b.ring]); }
          for (const [h, polys] of byD) G.beams.add(lift(extrude(polys, h, fl.H - h, COLOR.beam)));
          if (fl.steps?.length) {
            const mat = new THREE.MeshStandardMaterial({ color: COLOR.stair, roughness: 0.9 });
            for (const st of fl.steps) { const m = new THREE.Mesh(new THREE.BoxGeometry(st.s[0], st.s[1], st.s[2]), mat); m.position.set(st.c[0], st.c[1], st.c[2]); m.rotation.y = st.rot; G.stairs.add(m); }
          }
          for (const b of fl.beams) {
            const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L = Math.hypot(dx, dz), h = b.d - fl.slab; if (!L || h <= 0) continue;
            const m = new THREE.Mesh(new THREE.BoxGeometry(L, h, b.w), new THREE.MeshStandardMaterial({ color: COLOR.beam, roughness: 0.9 }));
            m.position.set((b.a[0] + b.b[0]) / 2, fl.H - h / 2, (b.a[1] + b.b[1]) / 2); m.rotation.y = -Math.atan2(dz, dx);
            G.beams.add(m);
          }
          // panels: one mesh + outline per kind; quad index kept for picking
          let cache = geoCache.get(fl);
          if (!cache) {
            cache = new Map();
            for (const k of Object.keys(KIND_LAYER) as Scene3["panels"][number]["k"][]) {
              const list = fl.panels.filter((p) => p.k === k); if (!list.length) continue;
              const pos = new Float32Array(list.length * 18), edge = new Float32Array(list.length * 24), colors = new Float32Array(list.length * 18);
              const base = new THREE.Color(COLOR[k]);
              list.forEach((q, i) => {
                const [a, b, c, d] = q.p;
                [a, b, c, a, c, d].forEach((v, j) => { pos.set(v, i * 18 + j * 3); colors.set([base.r, base.g, base.b], i * 18 + j * 3); });
                [a, b, b, c, c, d, d, a].forEach((v, j) => edge.set(v, i * 24 + j * 3));
              });
              cache.set(k, { pos, edge, list, base, colors });
            }
            geoCache.set(fl, cache);
          }
          for (const [kk, c] of cache) {
            // the same arrays on every floor drawn from this scene (one colour buffer → a highlight shows on all of them)
            const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(c.pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(c.colors, 3)); g.computeVertexNormals();
            const eg = new THREE.BufferGeometry(); eg.setAttribute("position", new THREE.BufferAttribute(c.edge, 3));
            const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 }));
            const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1f2937 }));
            G[KIND_LAYER[kk as Scene3["panels"][number]["k"]]].add(mesh, lines); pickables.push({ mesh, list: c.list, base: c.base, colors: c.colors, level: levelName });
          }
          if (fl.mb.length) {
            const arr = new Float32Array(fl.mb.length * 6);
            fl.mb.forEach(([a, b], i) => arr.set([a[0], fl.H - 0.02, a[1], b[0], fl.H - 0.02, b[1]], i * 6));
            const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
            G.deck.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2563eb })));
          }
          // design-check markers: a red (error) / amber (warning) ball on a pole at the spot (on the lowest floor drawn from this scene)
          if (withIssues) for (const is of fl.issues ?? []) {
            const col = is.sev === "error" ? 0xef4444 : 0xf59e0b;
            const ball = new THREE.Mesh(new THREE.SphereGeometry(rBall, 16, 12), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9 }));
            ball.position.set(is.at[0], is.y * k + y0 + rBall * 2.5, is.at[1]); ball.renderOrder = 10;
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(rBall * 0.15, rBall * 0.15, rBall * 2.5, 6), new THREE.MeshBasicMaterial({ color: col }));
            pole.position.set(is.at[0], is.y * k + y0 + rBall * 1.25, is.at[1]);
            groups.issues.add(ball, pole); marks.push({ mesh: ball, text: `${levelName ? `${levelName} · ` : ""}${is.id} · ${is.text}` });
          }
        };
        if (stack) {
          const seen = new Set<number>();
          for (const l of stack.levels) {
            if (l.sceneIdx == null) {
              // not formed with this set: a faint block of the building outline, so the stack reads as one building
              const outline = (stack.scenes[0].slabPoly.length ? stack.scenes[0].slabPoly : stack.scenes[0].walls);
              if (outline.length) { const m = extrude(outline, l.h, 0, 0x6b7280, 0.18); m.position.y = l.y0; groups.walls.add(m); }
              continue;
            }
            addFloor(stack.scenes[l.sceneIdx], l.y0, l.name, !seen.has(l.sceneIdx), l.h); seen.add(l.sceneIdx);
          }
          // level lines + names up the side of the building
          const lab = (text: string, y: number) => {
            const c = document.createElement("canvas"); c.width = 256; c.height = 48; const g2 = c.getContext("2d")!;
            g2.fillStyle = "#e5e7eb"; g2.font = "bold 26px sans-serif"; g2.textBaseline = "middle"; g2.fillText(text, 4, 24);
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
            sp.scale.set(span * 0.12, span * 0.0225, 1); sp.position.set(x0 - span * 0.08, y, y1 + span * 0.02); sp.renderOrder = 11; sc.add(sp);
          };
          for (const l of stack.levels) lab(l.name, l.y0 + 0.05);
        } else addFloor(scene, 0, "", true);
        // highlight: matching pieces turn bright orange, the rest fade; returns how many matched
        const hl = new THREE.Color(0xff6a00), dim = new THREE.Color(0x3a3d44);
        const highlight = (test: ((p: Scene3["panels"][number]) => boolean) | null) => {
          let n = 0;
          const done = new Set<Float32Array>();
          for (const pk of pickables) {
            if (!done.has(pk.colors)) {
              done.add(pk.colors);
              pk.list.forEach((q, i) => {
                const m = test ? test(q) : false; if (m) n++;
                const c = test ? (m ? hl : dim) : pk.base;
                for (let j = 0; j < 6; j++) pk.colors.set([c.r, c.g, c.b], i * 18 + j * 3);
              });
            }
            (pk.mesh.geometry.getAttribute("color") as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;
          }
          return n;
        };
        const flyTo = (x: number, y: number, z: number, dist = Math.max(4, span * 0.12)) => { cam.position.set(x + dist * 0.6, y + dist * 0.8, z + dist * 0.8); ctr.target.set(x, y, z); ctr.update(); };
        const view = (v: View) => {
          const d = Math.max(span, totalH) * 1.3, ym = totalH / 2; cam.up.set(0, 1, 0);
          if (v === "top") cam.position.set(cx, totalH + span * 1.6, cz + 0.001);
          else if (v === "front") cam.position.set(cx, ym, cz + d);
          else if (v === "back") cam.position.set(cx, ym, cz - d);
          else if (v === "left") cam.position.set(cx - d, ym, cz);
          else if (v === "right") cam.position.set(cx + d, ym, cz);
          else if (stack) { const D = Math.max(span, totalH) * 1.9; cam.position.set(cx + D * 0.55, ym + D * 0.3, cz + D * 0.75); }
          else cam.position.set(cx + d * 0.55, ym + d * 0.45, cz + d * 0.7);
          ctr.target.set(cx, v === "top" ? totalH : ym, cz); ctr.update();
        };
        view("3d");
        const f = focus ? (scene.issues ?? []).find((i) => i.id === focus) : undefined;
        if (f) {
          const d = Math.max(4, span * 0.12);
          cam.position.set(f.at[0] + d * 0.6, f.y + d * 0.8, f.at[1] + d * 0.8); ctr.target.set(f.at[0], f.y, f.at[1]); ctr.update();
          setPick(`${f.id} · ${f.text}`);
        }
        // turn the camera round the vertical axis through the target (step buttons)
        const turn = (deg: number) => {
          const a = (deg * Math.PI) / 180, t = ctr.target, ox = cam.position.x - t.x, oz = cam.position.z - t.z;
          cam.position.x = t.x + ox * Math.cos(a) - oz * Math.sin(a); cam.position.z = t.z + ox * Math.sin(a) + oz * Math.cos(a); ctr.update();
        };
        api.current = { set: (l, v) => { groups[l].visible = v; }, view, turn, cut: (y) => { clip.constant = y == null ? top : y; }, flyTo, highlight };
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
          setPick(q ? `${owner?.level ? `${owner.level} · ` : ""}${KIND_LABEL[q.k]} · ${q.c}${q.z ? ` · ${q.z}` : ""}` : null);
        };
        renderer.domElement.addEventListener("click", onClick);
        const onResize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); ctr.handleResize(); };
        window.addEventListener("resize", onResize); document.addEventListener("fullscreenchange", onResize);
        const loop = () => { ctr.update(); renderer.render(sc, cam); raf = requestAnimationFrame(loop); };
        loop();
        cleanup = () => {
          cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); document.removeEventListener("fullscreenchange", onResize); renderer.domElement.removeEventListener("click", onClick);
          ctr.dispose(); renderer.dispose(); sc.traverse((o) => { const m = o as { geometry?: { dispose: () => void } }; m.geometry?.dispose(); });
          renderer.domElement.remove();
        };
      } catch (e) {
        setErr(e instanceof Error ? e.message : "3D view could not start (WebGL not available?).");
      }
    })();
    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, focus, stack]);

  // whole building: the room / find tools fly to the chosen level (else the lowest level drawn from the typical plan)
  const levelY0 = () => { if (!stack) return 0; const L = stack.levels.find((x) => x.key === lvl) ?? stack.levels.find((x) => x.sceneIdx === 0); return L?.y0 ?? 0; };
  const toggle = (l: Layer) => setOn((o) => { const v = !o[l]; api.current?.set(l, v); return { ...o, [l]: v }; });
  // double-click a layer: see only that layer (e.g. only the fillers); "All" brings everything back
  const only = (l: Layer) => setOn((o) => { const n = { ...o }; for (const k of Object.keys(n) as Layer[]) { n[k] = k === l || k === "issues"; api.current?.set(k, n[k]); } return n; });
  const all = () => setOn((o) => { const n = { ...o }; for (const k of Object.keys(n) as Layer[]) { n[k] = k !== "slab"; api.current?.set(k, n[k]); } return n; });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {(Object.keys(LABEL) as Layer[]).map((l) => {
          // how many pieces each layer has — a layer with nothing on this floor (e.g. no columns in a shear-wall building) is shown greyed with "0"
          const pcs = scene.panels.filter((p) => KIND_LAYER[p.k] === l).length;
          const n = l === "walls" ? scene.walls.length : l === "columns" ? (scene.cols?.length ?? 0) + pcs : l === "slab" ? scene.slabPoly.length : l === "beams" ? (scene.beamSolids?.length ?? 0) + scene.beams.length + pcs
            : l === "stairs" ? (scene.steps?.length ?? 0) + pcs : l === "arch" ? (scene.arch?.length ?? 0) : l === "issues" ? (scene.issues?.length ?? 0) : pcs;
          return (
            <button key={l} type="button" onClick={() => toggle(l)} onDoubleClick={() => only(l)} title={`${n ? `${n} on this floor` : "nothing of this kind on this floor"} · double-click to see only this`}
              className={`rounded-md px-2.5 py-1.5 text-xs ${on[l] ? "bg-brand-orange text-white" : n ? "border border-graphite-700 text-graphite-300 hover:bg-graphite-800" : "border border-dashed border-graphite-800 text-graphite-600"}`}>{LABEL[l]}{n ? "" : " (0)"}</button>
          );
        })}
        <button type="button" onClick={all} title="Show every layer again" className="rounded-md border border-graphite-700 px-2 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">All</button>
        <span className="mx-1 h-5 w-px bg-graphite-700" />
        <button type="button" title="Turn left 45°" onClick={() => api.current?.turn(-45)} className="rounded-md border border-graphite-700 px-2 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">↺ 45°</button>
        <button type="button" title="Turn right 45°" onClick={() => api.current?.turn(45)} className="rounded-md border border-graphite-700 px-2 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">↻ 45°</button>
        <span className="mx-1 h-5 w-px bg-graphite-700" />
        {(["3d", "top", "front", "back", "left", "right"] as const).map((v) => (
          <button key={v} type="button" onClick={() => api.current?.view(v)} className="rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">{v === "3d" ? "3D view" : `${v[0].toUpperCase()}${v.slice(1)}`}</button>
        ))}
        <button type="button" onClick={() => { const el = host.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); }}
          className="rounded-md border border-graphite-700 px-2.5 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800">⛶ Full screen (Esc to leave)</button>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-graphite-300">
        <label className="flex items-center gap-1.5">Section cut
          <input type="range" min={1} max={100} value={cut} onChange={(e) => { const v = Number(e.target.value); setCut(v); api.current?.cut(v >= 100 ? null : (top * v) / 100); }} className="w-36" />
          <span className="w-16 font-mono text-graphite-400">{cut >= 100 ? "off" : stack ? `${((top * cut) / 100).toFixed(1)} m` : `${Math.round((top * cut) / 100 * 1000)} mm`}</span>
        </label>
        {stack ? (
          <label className="flex items-center gap-1.5">Level
            <select value={lvl} onChange={(e) => { const v = e.target.value; setLvl(v); const L = stack.levels.find((x) => x.key === v); if (L) { const [bx0, by0, bx1, by1] = scene.box; api.current?.flyTo((bx0 + bx1) / 2, L.y0 + L.h / 2, (by0 + by1) / 2, Math.max(6, span(scene) * 0.9)); api.current?.cut(L.y0 + L.h - 0.05); setCut(Math.round(((L.y0 + L.h - 0.05) / top) * 100)); } else { api.current?.cut(null); setCut(100); api.current?.view("3d"); } }}
              className="rounded border border-graphite-700 bg-graphite-950 px-1.5 py-1 text-graphite-100">
              <option value="">whole</option>{[...stack.levels].reverse().map((L) => <option key={L.key} value={L.key}>{L.name}{L.sceneIdx == null ? " (not formed)" : L.own ? " (own plan)" : ""}</option>)}
            </select>
          </label>
        ) : null}
        <label className="flex items-center gap-1.5">Room
          <select value={zone} onChange={(e) => { const v = e.target.value; setZone(v); if (!v) { api.current?.highlight(null); api.current?.view("3d"); return; } const z = scene.zones.find((x) => x.code === v); if (z) { api.current?.flyTo(z.at[0], levelY0() + scene.H / 2, z.at[1], Math.max(5, span(scene) * 0.18)); api.current?.highlight((p) => p.z === v); } }}
            className="rounded border border-graphite-700 bg-graphite-950 px-1.5 py-1 text-graphite-100">
            <option value="">all</option>{scene.zones.map((z) => <option key={z.code} value={z.code}>{z.code}</option>)}
          </select>
        </label>
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const q = query.trim().toLowerCase(); if (!q) { setHits(null); api.current?.highlight(null); return; } const n = api.current?.highlight((p) => `${p.c} ${p.z ?? ""}`.toLowerCase().includes(q)) ?? 0; setHits(n); const first = scene.panels.find((p) => `${p.c} ${p.z ?? ""}`.toLowerCase().includes(q)); if (first) api.current?.flyTo(first.p[0][0], first.p[0][1] + levelY0(), first.p[0][2]); }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="find panel no. / code (e.g. M4-07, WP-600)" className="w-56 rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-graphite-100" />
          <button className="rounded border border-graphite-700 px-2 py-1 hover:bg-graphite-800">Find</button>
          {hits != null ? <span className="text-graphite-400">{hits} found</span> : null}
          {hits != null || zone ? <button type="button" onClick={() => { setHits(null); setQuery(""); setZone(""); api.current?.highlight(null); }} className="text-brand-orange hover:underline">clear</button> : null}
        </form>
        {(scene.issues?.length ?? 0) > 0 ? <button type="button" onClick={() => setShowIssues((v) => !v)} className={`rounded border px-2 py-1 ${showIssues ? "border-brand-orange text-brand-orange" : "border-graphite-700 hover:bg-graphite-800"}`}>{showIssues ? "Hide" : "Show"} problem list ({scene.issues!.length})</button> : null}
      </div>
      <div ref={host} className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-graphite-800">
        {err ? <p className="p-4 text-sm text-signal-red">{err}</p> : null}
        {showIssues && scene.issues?.length ? (
          <div className="absolute right-2 top-2 z-10 max-h-[60%] w-80 overflow-auto rounded-md border border-graphite-700 bg-graphite-950/95 p-2 text-xs">
            {scene.issues.map((is) => (
              <button key={is.id} type="button" onClick={() => { api.current?.flyTo(is.at[0], is.y, is.at[1]); setPick(`${is.id} · ${is.text}`); }} className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-graphite-200 hover:bg-graphite-800">
                <span className="mt-1 inline-block size-2 shrink-0 rounded-full" style={{ background: is.sev === "error" ? "#ef4444" : "#f59e0b" }} /><span><span className="font-mono text-graphite-400">{is.id}</span> {is.text}</span>
              </button>
            ))}
          </div>
        ) : null}
        {pick ? <div className="absolute left-2 top-2 z-10 flex max-w-[90%] items-start gap-2 rounded-md px-3 py-2 text-sm font-medium shadow-lg" style={{ background: "#111827", color: "#ffffff", border: "1px solid #f59e0b" }}><span>{pick}</span><button type="button" onClick={() => setPick(null)} className="ml-1 shrink-0 text-base leading-none" style={{ color: "#fbbf24" }} aria-label="Close">×</button></div> : null}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite-400">
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#7aa7e0" }} />standard wall panel</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#f2c76b" }} />wall-top piece</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#9fd3c7" }} />deck panel</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#ff3fb3" }} />wall filler</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#ff8ad1" }} />deck filler / special</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#34d399" }} />internal / external corner</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#a78bfa" }} />soffit corner</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#fb923c" }} />kicker</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#d4a373" }} />beam side / bottom</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#fcd34d" }} />column panel</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "#c9b79c" }} />stair soffit / riser</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full" style={{ background: "#ef4444" }} />design-check error</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full" style={{ background: "#f59e0b" }} />warning</span>
        <span>· drag with the mouse to turn the model to any angle (360° in every direction, also from underneath) · right-drag to move · scroll to zoom · click a panel or a ball to see its number / problem</span>
      </p>
    </div>
  );
}
