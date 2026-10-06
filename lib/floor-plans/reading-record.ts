/**
 * Approved readings and training records.
 *
 * Fingerprint: a short summary of what the reader made of a plan (counts, lengths, areas and a hash of the wall
 * outlines). When the user approves a reading its fingerprint is kept on the plan; every later read is compared with
 * it, so a change in the reader that alters an approved plan shows up at once ("Check approved readings" page) —
 * every approved plan is a regression test.
 *
 * Training record: the drawing's primitives (lines / outlines in plan metres with their layer, layer role and the
 * reader's keep / drop decision) together with the structure read from them and the user's answers. Approved records
 * are the labelled corpus for the drawing-reading model.
 */
import type { Pt } from "./calc";
import type { Zone } from "./zones";

export type ReadingFp = {
  v: 1;
  walls: number; wallLen: number;       // wall outlines, total outline length (m)
  faces: number; openFaces: number;     // wall faces laid out, faces without panel
  zones: number; deckArea: number;      // deck zones, m²
  beams: number; cols: number; stairs: number;
  panels: number;                       // pieces in the part list
  hash: string;                         // wall outlines rounded to 10 mm
};
export type Approved = { at: string; by?: string; fp: ReadingFp };

type Inp = { zoneWalls: Pt[][]; zoneBeams: Pt[][]; zoneCols: Pt[][]; zoneStairs: unknown[] };
type Res = { faces: { panels: number[]; filler: number }[]; bom: { qty: number; group: string }[] };

const r1 = (v: number) => Math.round(v * 10) / 10;
const ringLen = (r: Pt[]) => { let L = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; };
/** FNV-1a over a string — small, stable, no dependency. */
function fnv(s: string): string { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }

export function readingFingerprint(inp: Inp, zones: Zone[], result: Res): ReadingFp {
  const walls = inp.zoneWalls;
  const key = walls.map((r) => r.map((p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`).join(";")).sort().join("|");
  return {
    v: 1,
    walls: walls.length, wallLen: r1(walls.reduce((a, r) => a + ringLen(r), 0)),
    faces: result.faces.length, openFaces: result.faces.filter((f) => !f.panels.length && !f.filler).length,
    zones: zones.length, deckArea: r1(zones.reduce((a, z) => a + z.area, 0)),
    beams: inp.zoneBeams.length, cols: inp.zoneCols.length, stairs: inp.zoneStairs.length,
    panels: result.bom.filter((b) => b.group !== "accessory").reduce((a, b) => a + b.qty, 0),
    hash: fnv(key),
  };
}

/** What differs between the approved reading and the present one, in plain words (empty = same reading). */
export function fingerprintDiff(approved: ReadingFp, now: ReadingFp): string[] {
  const out: string[] = [];
  const cmp = (label: string, a: number, b: number, unit = "") => { if (Math.abs(a - b) > 1e-9) out.push(`${label}: ${a}${unit} → ${b}${unit}`); };
  cmp("Wall outlines", approved.walls, now.walls);
  cmp("Wall outline length", approved.wallLen, now.wallLen, " m");
  cmp("Wall faces", approved.faces, now.faces);
  cmp("Faces without panel", approved.openFaces, now.openFaces);
  cmp("Deck zones", approved.zones, now.zones);
  cmp("Deck area", approved.deckArea, now.deckArea, " m²");
  cmp("Beam / column outlines", approved.beams, now.beams);
  cmp("Columns", approved.cols, now.cols);
  cmp("Staircases", approved.stairs, now.stairs);
  cmp("Pieces in the part list", approved.panels, now.panels);
  if (!out.length && approved.hash !== now.hash) out.push("Same counts, but the wall outlines moved (positions differ by more than 10 mm)");
  return out;
}

export type TrainingPrimitive = { layer: string; role: string; closed: boolean; kept: boolean; pts: Pt[] };
export type TrainingRecord = {
  v: 1; plan: string; exportedAt: string; approved: Approved | null;
  units: string; floorHeightM: number; slabMm: number;
  answers: { includeM: number[][]; excludeM: number[][] };
  primitives: TrainingPrimitive[];
  texts: { text: string; at: Pt; h: number; layer?: string }[];
  read: { walls: Pt[][]; beams: Pt[][]; columns: Pt[][]; slab: Pt[][]; openings: Pt[][]; stairs: number[][]; faces: { code: string; a?: Pt; b?: Pt; panels: number[]; filler: number; end?: boolean }[]; zones: { code: string; area: number; box: number[] }[] };
};

const r3 = (p: Pt): Pt => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
/** The record of one plan. `toM` maps drawing units to plan metres; `onFloor` is the reader's keep / drop decision; `inRegion` limits the export to the plan's own drawing. */
export function trainingRecord(o: {
  plan: string; approved: Approved | null; units: string; floorHeightM: number; slabMm: number;
  answers: { includeM: number[][]; excludeM: number[][] };
  paths: { layer: string; pts: Pt[]; closed: boolean }[]; roles: Record<string, string>; texts: { text: string; x: number; y: number; h: number; layer?: string }[];
  toM: (q: Pt) => Pt; onFloor?: (p: { layer: string; pts: Pt[]; closed: boolean }) => boolean; inRegion?: (q: Pt) => boolean;
  read: TrainingRecord["read"];
}): TrainingRecord {
  const primitives: TrainingPrimitive[] = [];
  for (const p of o.paths) {
    if (p.pts.length < 2) continue;
    if (o.inRegion && !p.pts.some(o.inRegion)) continue;
    primitives.push({ layer: p.layer, role: o.roles[p.layer] ?? "ignore", closed: p.closed, kept: o.onFloor ? o.onFloor(p) : true, pts: p.pts.map((q) => r3(o.toM(q))) });
  }
  const texts = o.texts.filter((t) => !o.inRegion || o.inRegion([t.x, t.y])).map((t) => ({ text: t.text, at: r3(o.toM([t.x, t.y])), h: t.h, layer: t.layer }));
  const rings = (rs: Pt[][]) => rs.map((r) => r.map(r3));
  return {
    v: 1, plan: o.plan, exportedAt: new Date().toISOString(), approved: o.approved, units: o.units, floorHeightM: o.floorHeightM, slabMm: o.slabMm,
    answers: o.answers, primitives, texts,
    read: { ...o.read, walls: rings(o.read.walls), beams: rings(o.read.beams), columns: rings(o.read.columns), slab: rings(o.read.slab), openings: rings(o.read.openings) },
  };
}
