/**
 * The drawing read-out ("drawing index"): the whole file read once, in detail, and stored as plain data so every later
 * step (measuring, levels, stairs, openings, panel layout, quotations) takes what it needs from one place instead of
 * guessing again from raw lines and texts.
 *
 *   1. drawings  — the file split into its separate drawings (plans, sections, elevations, details), each with its
 *                  title, type, level(s), tower and scale, and what is written inside it (lifts, ducts, stairs, rooms …)
 *   2. layers    — every layer with what it holds (lines, closed shapes, texts), what it is (walls, columns, openings …)
 *                  and WHY: taught by the company, its name, the words written on it, or its geometry (paired lines
 *                  100–350 mm apart look like wall faces; many small rectangles look like columns)
 *   3. texts     — every text with its kind (level mark, dimension, size, grid, tag, words, title) and its meaning from
 *                  the drawing dictionary (vocab.ts) — whatever the architect's own spelling
 *   4. words     — every different word / phrase once, with how often it is used and what it means; the ones the
 *                  dictionary does not know are listed so the estimator can teach them once
 *   5. building  — the levels of the whole building (basements … terrace) read from level tables / marks / names
 *   6. checks    — what could not be read and needs a person
 */
import type { LayerRole } from "./calc";
import { drawingParts, type DrawingPart, type DxfModel, type DxfText, type PartKind } from "./dxf";
import { isNoiseLayer, suggestLayerRole } from "./layer-rules";
import { parseLevelName, readBuilding, type Building, type LevelKind } from "./building";
import { drawingSection } from "./dxf";
import { CONCEPT_ROLE, EMPTY_DICT, layerKey, meaningOf, normText, textCategory, type Dictionary, type Meaning, type TextCat } from "./vocab";

export type IndexLayer = {
  name: string; lines: number; closed: number; texts: number; lengthM: number;
  role: LayerRole; from: "taught" | "name" | "words" | "geometry" | "none";
  why: string;
  hint?: { role: LayerRole; why: string };      // what the geometry suggests when the name says nothing
  kind: "geometry" | "doors-windows" | "railings" | "text-only";
};
export type IndexLabel = { key: string; text: string; x: number; y: number };
export type IndexPart = {
  n: number; title: string; kind: PartKind; box: [number, number, number, number]; wM: number; hM: number;
  level: { kind: LevelKind; nos: number[]; typical: boolean; tower?: string };
  levelFrom?: "title" | "labels";             // "labels": the drawing has no title — read from what is written in it
  scale?: string;
  layers: { name: string; lines: number }[];
  found: Record<string, number>;              // meaning key → how many labels, e.g. { lift: 5, duct: 4, toilet: 12 }
  labels: IndexLabel[];                        // where they are written (openings, stairs, rooms, levels)
};
export type IndexTerm = { norm: string; sample: string; count: number; cat: TextCat; meaning: Meaning | null; parts: number[] };
/** Texts as compact rows: [text, x, y, height, layer index, drawing n (0 = none), kind, meaning key]. */
export type IndexTextRow = [string, number, number, number, number, number, TextCat, string];
export type DrawingIndex = {
  v: 1; builtAt: string; units: string; unitToM: number; unitsGuessed: boolean; bbox: [number, number, number, number];
  counts: { lines: number; texts: number; layers: number; drawings: number; known: number; unknown: number };
  parts: IndexPart[]; layers: IndexLayer[]; terms: IndexTerm[]; texts: IndexTextRow[]; textLayers: string[];
  building: Building | null; checks: string[];
};

const SHOWN_GROUPS = new Set(["opening", "circulation", "room", "level", "structure"]);

/* ---------- geometry evidence per layer ---------- */
type Seg = { o: 0 | 1; c: number; a: number; b: number };   // orientation (0 = along x), offset, from, to
function layerGeometry(paths: DxfModel["paths"], unitToM: number): Map<string, { wallness: number; segs: number; rects: number; lengthM: number }> {
  const segs = new Map<string, Seg[]>(), rects = new Map<string, number>(), len = new Map<string, number>();
  const minL = 0.4 / unitToM;
  for (const p of paths) {
    const arr = segs.get(p.layer) ?? (segs.set(p.layer, []), segs.get(p.layer)!);
    let L = len.get(p.layer) ?? 0;
    const n = p.pts.length;
    for (let i = 1; i < n + (p.closed ? 1 : 0); i++) {
      const a = p.pts[i - 1], b = p.pts[i % n];
      const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); L += l;
      if (l < minL || arr.length > 6000) continue;
      if (Math.abs(dy) <= 0.02 * l) arr.push({ o: 0, c: (a[1] + b[1]) / 2, a: Math.min(a[0], b[0]), b: Math.max(a[0], b[0]) });
      else if (Math.abs(dx) <= 0.02 * l) arr.push({ o: 1, c: (a[0] + b[0]) / 2, a: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]) });
    }
    len.set(p.layer, L);
    // small rectangles 0.2–1.5 m a side, not long strips: columns
    if (p.closed && (n === 4 || n === 5)) {
      const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
      const w = (Math.max(...xs) - Math.min(...xs)) * unitToM, h = (Math.max(...ys) - Math.min(...ys)) * unitToM;
      if (Math.min(w, h) >= 0.2 && Math.max(w, h) <= 1.5 && Math.max(w, h) / Math.min(w, h) <= 4) rects.set(p.layer, (rects.get(p.layer) ?? 0) + 1);
    }
  }
  const out = new Map<string, { wallness: number; segs: number; rects: number; lengthM: number }>();
  const lo = 0.09 / unitToM, hi = 0.36 / unitToM;
  for (const [layer, arr] of segs) {
    let paired = 0; const step = Math.max(1, Math.floor(arr.length / 250)); let tried = 0;
    for (let i = 0; i < arr.length; i += step) {
      const s = arr[i]; tried++;
      for (const t of arr) {
        if (t === s || t.o !== s.o) continue;
        const d = Math.abs(t.c - s.c); if (d < lo || d > hi) continue;
        const ov = Math.min(s.b, t.b) - Math.max(s.a, t.a);
        if (ov >= 0.5 * Math.min(s.b - s.a, t.b - t.a)) { paired++; break; }
      }
    }
    out.set(layer, { wallness: tried ? paired / tried : 0, segs: arr.length, rects: rects.get(layer) ?? 0, lengthM: Math.round((len.get(layer) ?? 0) * unitToM) });
  }
  for (const [layer, r] of rects) if (!out.has(layer)) out.set(layer, { wallness: 0, segs: 0, rects: r, lengthM: Math.round((len.get(layer) ?? 0) * unitToM) });
  return out;
}

const inBox = (b: number[], x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

/** Reads the whole drawing into a DrawingIndex. `roles` = the layer roles in use (if a plan already has them). */
export function buildDrawingIndex(model: DxfModel, unitToM: number, opts: { dict?: Dictionary; roles?: Record<string, LayerRole>; planName?: string; said?: { floors?: number; floorMm?: number; slabMm?: number } } = {}): DrawingIndex {
  const dict = opts.dict ?? EMPTY_DICT;
  const texts = model.texts ?? [];
  const geo = layerGeometry(model.paths, unitToM);

  /* ---- layers ---- */
  const L = new Map<string, IndexLayer>();
  const get = (name: string, kind: IndexLayer["kind"]) => L.get(name) ?? (L.set(name, { name, lines: 0, closed: 0, texts: 0, lengthM: 0, role: "ignore", from: "none", why: "", kind }), L.get(name)!);
  for (const l of model.layers) { const x = get(l.name, "geometry"); x.lines = l.count; x.closed = l.closed; }
  for (const p of model.dw ?? []) { const x = get(p.layer, "doors-windows"); x.lines++; }
  for (const p of model.rails ?? []) { const x = get(p.layer, "railings"); x.lines++; }
  const textMeaning = new Map<string, Map<string, number>>();
  for (const t of texts) {
    const name = t.layer ?? "0"; const x = get(name, "text-only"); x.texts++;
  }
  for (const x of L.values()) {
    x.lengthM = geo.get(x.name)?.lengthM ?? 0;
    const taught = dict.layers[layerKey(x.name)];
    const byName = suggestLayerRole(x.name) as LayerRole;
    const nameMeaning = meaningOf(x.name.replace(/\$0\$/g, " "), dict);
    const g = geo.get(x.name);
    if (taught) { x.role = taught; x.from = "taught"; x.why = "taught on an earlier drawing"; }
    else if (x.kind === "doors-windows") { x.why = "door / window lines — used to find the openings in walls"; }
    else if (x.kind === "railings") { x.why = "railing lines — a wall under a railing is a parapet"; }
    else if (byName !== "ignore") { x.role = byName; x.from = "name"; x.why = `the layer name says ${byName}`; }
    else if (nameMeaning && CONCEPT_ROLE[nameMeaning.key] && !isNoiseLayer(x.name)) { x.role = CONCEPT_ROLE[nameMeaning.key]!; x.from = "words"; x.why = `the layer name means "${nameMeaning.label}"`; }
    else if (isNoiseLayer(x.name)) { x.why = "furniture / hatch / dimension / annotation layer"; }
    else x.why = x.lines ? "nothing in its name says what it is" : "texts only";
    // geometry hints only for layers whose name says nothing (not dotted / hidden lines, title sheets, doors …)
    const plainName = !nameMeaning && !/dot|hidden|dash|title|sheet|plot|defpoint|border|frame|level|grid|axis|(^|[^a-z])ele|elev/i.test(x.name);
    if (x.role === "ignore" && x.kind === "geometry" && g && plainName && x.from === "none") {
      if (g.segs >= 40 && g.wallness >= 0.45) x.hint = { role: "walls", why: `${Math.round(g.wallness * 100)} % of its lines run in pairs 90–360 mm apart, like the two faces of a wall` };
      else if (g.rects >= 6) x.hint = { role: "columns", why: `${g.rects} small rectangles (0.2–1.5 m), like columns` };
    }
  }
  // no layer is walls at all: the most wall-like layer by its geometry is used (still shown as a guess)
  const anyWalls = [...L.values()].some((x) => x.role === "walls");
  if (!anyWalls) {
    const best = [...L.values()].filter((x) => x.hint?.role === "walls").sort((a, b) => (geo.get(b.name)?.segs ?? 0) - (geo.get(a.name)?.segs ?? 0))[0];
    if (best) { best.role = "walls"; best.from = "geometry"; best.why = `no layer is named as walls; ${best.hint!.why}`; }
  }
  const roles: Record<string, LayerRole> = { ...Object.fromEntries([...L.values()].map((x) => [x.name, x.role])), ...(opts.roles ?? {}) };

  /* ---- drawings in the file ---- */
  let parts: DrawingPart[] = [];
  try { parts = drawingParts(model, unitToM, roles); } catch { parts = []; }

  /* ---- texts: kind + meaning + drawing ---- */
  const maxHIn = new Map<number, number>();
  const partOf = (x: number, y: number) => { let best = 0, area = Infinity; for (const p of parts) if (inBox(p.box, x, y)) { const a = (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]); if (a < area) { area = a; best = p.n; } } return best; };
  const tp = texts.map((t) => partOf(t.x, t.y));
  texts.forEach((t, i) => maxHIn.set(tp[i], Math.max(maxHIn.get(tp[i]) ?? 0, t.h)));
  const textLayers: string[] = []; const tlIdx = new Map<string, number>();
  const terms = new Map<string, IndexTerm>();
  const rows: IndexTextRow[] = texts.map((t, i) => {
    const cat = textCategory(t.text, t.h, maxHIn.get(tp[i]) ?? 0);
    const wordy = cat === "words" || cat === "title" || cat === "tag" || cat === "grid";
    const m = wordy ? meaningOf(t.text, dict) : null;
    const layer = t.layer ?? "0";
    if (!tlIdx.has(layer)) { tlIdx.set(layer, textLayers.length); textLayers.push(layer); }
    if (wordy && /[a-z一-鿿]/i.test(t.text) && t.text.length <= 40) {
      const n = normText(t.text);
      const term = terms.get(n) ?? (terms.set(n, { norm: n, sample: t.text.trim(), count: 0, cat, meaning: m, parts: [] }), terms.get(n)!);
      term.count++; if (tp[i] && !term.parts.includes(tp[i]) && term.parts.length < 20) term.parts.push(tp[i]);
    }
    if (m) { const mm = textMeaning.get(layer) ?? (textMeaning.set(layer, new Map()), textMeaning.get(layer)!); mm.set(m.key, (mm.get(m.key) ?? 0) + 1); }
    return [t.text, Math.round(t.x * 100) / 100, Math.round(t.y * 100) / 100, t.h, tlIdx.get(layer)!, tp[i], cat, m?.key ?? ""];
  });
  // a text-only layer is named by what is written on it (e.g. all its texts are level marks)
  for (const x of L.values()) if (x.from === "none" && x.texts > 0 && (x.kind === "text-only" || x.texts >= x.lines)) {
    const mm = textMeaning.get(x.name); const top = mm ? [...mm.entries()].sort((a, b) => b[1] - a[1])[0] : undefined;
    const lv = rows.filter((r) => textLayers[r[4]] === x.name && r[6] === "level-mark").length;
    const lead = x.lines ? "mostly texts" : "texts only";
    x.why = lv >= 3 ? `${lead} — ${lv} level marks` : top ? `${lead} — mostly "${top[0]}" labels` : lead;
  }

  /* ---- per drawing: what is in it ---- */
  const outParts: IndexPart[] = parts.map((p) => {
    const lay = new Map<string, number>();
    for (const q of model.paths) { const [x, y] = q.pts[0]; if (inBox(p.box, x, y)) lay.set(q.layer, (lay.get(q.layer) ?? 0) + 1); }
    const found: Record<string, number> = {}; const labels: IndexLabel[] = [];
    let scale: string | undefined;
    rows.forEach((r) => {
      if (r[5] !== p.n) return;
      const sc = r[0].match(/scale\s*[:\-=]?\s*(1\s*[:/]\s*\d{1,4}|nts|n\.t\.s)/i); if (sc && !scale) scale = sc[1].replace(/\s/g, "").toUpperCase();
      if (!r[7]) return;
      const g = meaningOf(r[0], dict)?.group;
      if (!g || !SHOWN_GROUPS.has(g)) return;
      found[r[7]] = (found[r[7]] ?? 0) + 1;
      if (labels.length < 400) labels.push({ key: r[7], text: r[0], x: r[1], y: r[2] });
    });
    return {
      n: p.n, title: p.title, kind: p.kind, box: p.box, wM: Math.round(p.w * 10) / 10, hM: Math.round(p.h * 10) / 10,
      level: parseLevelName(`${p.title} ${p.sub ?? ""}`), levelFrom: p.named === "labels" ? "labels" as const : "title" as const, scale,
      layers: [...lay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, lines]) => ({ name, lines })),
      found, labels,
    };
  });

  /* ---- the building ---- */
  let building: Building | null = null;
  try {
    const typ = outParts.find((p) => p.kind === "plan" && p.level.typical) ?? outParts.find((p) => p.kind === "plan");
    building = readBuilding({ texts, unitToM, parts, section: drawingSection(model), said: opts.said ?? {}, planName: opts.planName, typicalPartN: typ?.n });
  } catch { building = null; }

  /* ---- checks ---- */
  const termList = [...terms.values()].sort((a, b) => b.count - a.count);
  const unknown = termList.filter((t) => !t.meaning && (t.cat === "words" || t.cat === "title"));
  const checks: string[] = [];
  if (model.unitsGuessed) checks.push(`The drawing does not say its units; read as ${model.units}. Check one known dimension.`);
  if (![...L.values()].some((x) => x.role === "walls")) checks.push("No wall layer was found — choose the wall layer(s) below.");
  else if ([...L.values()].some((x) => x.from === "geometry")) checks.push("The wall layer was found from its geometry only (its name does not say so) — please confirm it below.");
  if (!outParts.some((p) => p.kind === "plan")) checks.push("No floor plan drawing was recognised by its title.");
  if (building?.levels.every((l) => l.src === "assumed")) checks.push("No level list was found (no level table, level marks or section level names) — floors are assumed.");
  if (unknown.length) checks.push(`${unknown.length} word(s) on the drawing are not in the dictionary yet — teach the ones that matter below (lift, duct, stair, wall …).`);

  return {
    v: 1, builtAt: new Date().toISOString(), units: model.units, unitToM, unitsGuessed: model.unitsGuessed, bbox: model.bbox,
    counts: { lines: model.paths.length, texts: texts.length, layers: L.size, drawings: outParts.length, known: termList.length - unknown.length, unknown: unknown.length },
    parts: outParts, layers: [...L.values()].sort((a, b) => (b.lines + b.texts) - (a.lines + a.texts)), terms: termList.slice(0, 3000), texts: rows, textLayers,
    building, checks,
  };
}

/* ---------- reading from a stored index (for later steps) ---------- */
/** Texts of one meaning (e.g. "lift") inside a drawing / box. */
export function labelsOf(ix: DrawingIndex, key: string, box?: number[]): { text: string; x: number; y: number; h: number }[] {
  return ix.texts.filter((r) => r[7] === key && (!box || inBox(box, r[1], r[2]))).map((r) => ({ text: r[0], x: r[1], y: r[2], h: r[3] }));
}
/** Back to plain texts (with their layer) for readers that take DxfText[]. */
export function textsOf(ix: DrawingIndex): DxfText[] {
  return ix.texts.map((r) => ({ text: r[0], x: r[1], y: r[2], h: r[3], layer: ix.textLayers[r[4]] }));
}
