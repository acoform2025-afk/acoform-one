/**
 * Data of the formwork assembly diagram (one plan sheet per part family, every piece drawn at its place with its code),
 * built from the 3D scene of the floor: vertical pieces become strips along the wall face, horizontal pieces rectangles.
 * Units: metres on the plan (x right, y down), codes as in the part lists.
 */
import type { Pt } from "@/lib/floor-plans/calc";
import type { Panel3, Panel3Kind, Scene3 } from "@/lib/floor-plans/scene3d";

export type AsmFamily = "wall" | "corner" | "beam" | "deck" | "stair" | "waler";
/** One piece on a sheet: strip = vertical panel seen from above (face a→b, n away from the concrete), rect = horizontal panel, line = keel / waler, dot = prop head / tie. */
export type AsmItem = { fam: AsmFamily; k: Panel3Kind | "keel" | "head" | "tie" | "waler" | "prop"; code: string; shape: "strip" | "rect" | "line" | "dot"; a: Pt; b: Pt; n?: Pt; z?: string; custom?: boolean };
export type AsmBase = { walls: Pt[][]; slab: Pt[][]; cols: Pt[][]; beams: Pt[][]; stairs: Pt[][]; zones: { code: string; at: Pt }[]; faces: { code: string; at: Pt; n: Pt }[]; box: [number, number, number, number] };
export type AsmModel = { base: AsmBase; items: AsmItem[]; H: number; slab: number; keelW: number; propSpacing: number; tieH: number; tieV: number };

export type CodeFor = { wall: (w: number, h: number) => string; deck: (w: number, L: number) => string; ic: string; ec: string; sc: string; kick: string; keel: (L: number) => string; head: string; beamHead: string; stairHead: string };
export const DEFAULT_CODES: CodeFor = {
  wall: (w, h) => `WP-${w}-${h}`, deck: (w, L) => `DP-${w}-${L}`, ic: "IC", ec: "EC", sc: "SC", kick: "KB", keel: (L) => `MB-${L}`, head: "PH", beamHead: "BPH", stairHead: "SPH",
};

const num = (s: string, re: RegExp, i = 1) => { const m = s.match(re); return m ? Number(m[i]) : NaN; };
const mm = (v: number) => Math.round(v * 1000);
/** Seen from above: a vertical piece projects to a line (no plan area), a flat or sloping piece to a polygon. */
const horiz = (p: Panel3) => { let a = 0; for (let i = 0; i < 4; i++) { const q = p.p[i], r = p.p[(i + 1) % 4]; a += q[0] * r[2] - r[0] * q[2]; } return Math.abs(a) / 2 > 0.0015; };
const plan = (q: [number, number, number]): Pt => [q[0], q[2]];
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Short part code of a scene piece (its caption carries the face, the size and the kind). */
export function codeOf(p: Panel3, cf: CodeFor, stdH: number): string {
  const c = p.c;
  switch (p.k) {
    case "std": { const w = num(c, /·\s*(\d+)\s*×\s*(\d+)/), h = num(c, /·\s*(\d+)\s*×\s*(\d+)/, 2); return cf.wall(w || mm(dist(plan(p.p[0]), plan(p.p[1]))), h || stdH); }
    case "top": { const w = num(c, /top\s*(\d+)\s*×\s*(\d+)/), h = num(c, /top\s*(\d+)\s*×\s*(\d+)/, 2); return `WT-${w}-${h}`; }
    case "fill": {
      const f = c.match(/filler\s*(\d+)\s*×\s*(\d+)/); if (f) return `WF-${f[1]}-${f[2]}`;
      const o = c.match(/\b(OH|OS)\s*(\d+)\s*×\s*(\d+)/); if (o) return `${o[1]}-${o[2]}-${o[3]}`;
      return `WF-${mm(dist(plan(p.p[0]), plan(p.p[1])))}-${mm(Math.abs(p.p[2][1] - p.p[0][1]))}`;
    }
    case "col": return `CP-${mm(dist(plan(p.p[0]), plan(p.p[1])))}-${stdH}`;
    case "ic": return `${cf.ic}-${num(c, /(\d+)\s*×/) || 100}`;
    case "ec": return `${cf.ec}-${num(c, /corner\s*(\d+)/) || 65}`;
    case "sc": return `${cf.sc}-${mm(dist(plan(p.p[0]), plan(p.p[1])))}`;
    case "kick": return `${cf.kick}-${num(c, /(\d+)\s*mm/) || 150}-${mm(dist(plan(p.p[0]), plan(p.p[1])))}`;
    case "bside": { const m = c.match(/BS\s*(\d+)\s*×\s*(\d+)/); return m ? `BS-${m[2]}-${m[1]}` : `BS-${mm(dist(plan(p.p[0]), plan(p.p[1])))}`; }
    case "bbot": { const m = c.match(/BB\s*(\d+)\s*×\s*(\d+)/); return m ? `BB-${m[2]}-${m[1]}` : `BB-${mm(dist(plan(p.p[0]), plan(p.p[1])))}`; }
    case "deck": case "dspec": return c.split("·").pop()!.trim();
    case "lsoff": { const xs = p.p.map((q) => q[0]), zs = p.p.map((q) => q[2]); const w = mm(Math.max(...xs) - Math.min(...xs)), L = mm(Math.max(...zs) - Math.min(...zs)); return `LS-${Math.min(w, L)}-${Math.max(w, L)}`; }
    case "stair": { const m = c.match(/(\d+)\s*D\s*(\d+)/); return m ? `${m[1]}D${m[2]}` : "SP"; }
    case "cheek": return "SPCH";
    case "cpp": return `SPCPP-${num(c, /SPCPP\s*(\d+)/) || 150}`;
    case "tz": return `${c.includes("SPW") ? "SPW" : "TZ"}-${num(c, /(?:SPW|TZ)\s*(\d+)/) || 400}`;
    case "stp": return "STP";
    case "cchan": return "CC";
    case "riser": return "RS";
    case "tread": return "SPTR";
    case "trec": return "SPTREC";
    default: return String(p.k).toUpperCase();
  }
}

const FAM: Partial<Record<Panel3Kind, AsmFamily>> = { std: "wall", top: "wall", fill: "wall", col: "wall", ic: "corner", ec: "corner", sc: "corner", kick: "corner", bside: "beam", bbot: "beam", deck: "deck", dspec: "deck", stair: "stair", riser: "stair", cheek: "stair", lsoff: "stair", tread: "stair", cchan: "stair", stp: "stair", tz: "stair", cpp: "stair", trec: "stair" };

/** The plan sheets' data from the 3D scene. `faces` (code at the face middle) come from the layout's wall faces. */
export function assemblyModel(scene: Scene3, o: { codes?: Partial<CodeFor>; stdH: number; propSpacing: number; tieH: number; tieV: number; faces?: { code: string; a: Pt; b: Pt; n: Pt }[] }): AsmModel {
  const cf = { ...DEFAULT_CODES, ...(o.codes ?? {}) };
  const items: AsmItem[] = [];
  const rect = (p: Panel3): [Pt, Pt] => { const xs = p.p.map((q) => q[0]), zs = p.p.map((q) => q[2]); return [[Math.min(...xs), Math.min(...zs)], [Math.max(...xs), Math.max(...zs)]]; };
  for (const p of scene.panels) {
    const fam = FAM[p.k]; if (!fam) continue;
    if (p.k === "tread" || p.k === "trec") continue;                       // step covers: on the stair sheet's note, not drawn in plan
    const code = codeOf(p, cf, o.stdH);
    if (horiz(p)) {
      const [a, b] = rect(p);
      if (p.k === "sc") continue;                                            // soffit corner: drawn once by its vertical leg
      items.push({ fam, k: p.k, code, shape: "rect", a, b, z: p.z, custom: p.k === "dspec" || /made to size/.test(p.c) });
    } else {
      const a = plan(p.p[0]), b = plan(p.p[1]); if (dist(a, b) < 0.02) continue;
      const n: Pt = p.n ? [p.n[0], p.n[2]] : [-(b[1] - a[1]) / dist(a, b), (b[0] - a[0]) / dist(a, b)];
      items.push({ fam, k: p.k, code, shape: "strip", a, b, n, z: p.z, custom: p.k === "fill" || /made to size/.test(p.c) });
    }
  }
  const keelW = scene.keel?.w ?? 0.15;
  for (const [a, b] of scene.mb) items.push({ fam: "deck", k: "keel", code: cf.keel(mm(dist(a, b))), shape: "line", a, b });
  const acc = scene.acc;
  if (acc) {
    for (const h of acc.heads) { const kind = h[3]; items.push({ fam: kind === 1 ? "beam" : kind === 2 ? "stair" : "deck", k: "head", code: kind === 1 ? cf.beamHead : kind === 2 ? cf.stairHead : cf.head, shape: "dot", a: [h[0], h[2]], b: [h[0], h[2]] }); }
    for (const w of acc.walers) if (Math.abs(w[1] - 0.6) < 0.05) items.push({ fam: "waler", k: "waler", code: `WL-${mm(Math.hypot(w[3] - w[0], w[4] - w[2]))}`, shape: "line", a: [w[0], w[2]], b: [w[3], w[4]] });
    // ties: drawn once per tie as a short line through the wall (lowest row stands for the rows above)
    for (const t of acc.ties) if (t[1] < 0.35 && t[5]) items.push({ fam: "waler", k: "tie", code: "TIE", shape: "line", a: [t[0], t[2]], b: [t[0] - t[3] * t[5], t[2] - t[4] * t[5]] });
  }
  const stairs: Pt[][] = (scene.stairSolids ?? []).map((s) => {
    const s0 = Math.min(...s.prof.map((q) => q[0])), s1 = Math.max(...s.prof.map((q) => q[0]));
    const [ox, oy] = s.o, [ux, uy] = s.u, [ex, ey] = s.ext;
    return [[ox + ux * s0, oy + uy * s0], [ox + ux * s1, oy + uy * s1], [ox + ux * s1 + ex, oy + uy * s1 + ey], [ox + ux * s0 + ex, oy + uy * s0 + ey]] as Pt[];
  });
  const base: AsmBase = {
    walls: scene.walls.flat(), slab: scene.slabPoly.flat(), cols: scene.cols, beams: scene.beamSolids.map((b) => b.ring), stairs,
    zones: scene.zones, faces: (o.faces ?? []).map((f) => ({ code: f.code, at: [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2], n: f.n })), box: scene.box,
  };
  return { base, items, H: scene.H, slab: scene.slab, keelW, propSpacing: o.propSpacing, tieH: o.tieH, tieV: o.tieV };
}

/** Code → count of the items of a family (the sheet's part list). */
export function countOf(items: AsmItem[], fam: AsmFamily): { code: string; n: number }[] {
  const m = new Map<string, number>();
  for (const it of items) if (it.fam === fam) m.set(it.code, (m.get(it.code) ?? 0) + 1);
  return [...m].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
}
