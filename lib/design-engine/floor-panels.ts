/**
 * ACOFORM floor panel layout (v1, standard aluminium-formwork rules — to be tuned with ACOFORM's own drawings).
 * Pure functions: shell-plan geometry in, panel runs + BOM out.
 *
 *  • Wall faces: every face is filled with catalogue wall panels (fewest panels, 50 mm steps); the rest is a custom filler.
 *    Walls taller than the standard panel get a top strip of the same widths (custom height).
 *  • Corners: every joint between wall faces gets one 65 mm corner piece (IC/EC split to confirm on the drawing).
 *  • Deck: the slab is cut into 1200 mm strips; each strip is filled across with deck panels (600/450/300 × 1200);
 *    counts are scaled to the net soffit area (so wall tops, ducts and columns are not decked).
 *  • Props / prop heads at the chosen spacing; soffit corner along the top of every wall face.
 *  • Beams: two side panels of (depth − slab) and a bottom panel of the beam width, in 1200 mm lengths.
 */
import type { Pt } from "@/lib/floor-plans/calc";

export type CatPanel = { id: string; panel_code: string; panel_category: string; width_mm: number; height_mm: number; weight_kg: number; area_sqm: number };
export type FaceGeo = { a: Pt; b: Pt; off: number };                                    // plan px; off = sideways offset (px)
export type Face = { code: string; length: number; height: number; geo?: FaceGeo; part?: "above" | "below" };   // part: short piece over a door/window or below a window sill
export type OpeningCut = { kind: "door" | "window"; w: number; h: number; t: number };                        // mm, one per opening (for reveals)                 // mm
export type DeckPoly = { code: string; pts: Pt[]; holes: Pt[][] };                     // metres
export type BeamRun = { code: string; length: number; b: number; d: number; sides: 1 | 2; bottom: boolean }; // mm
export type PanelOptions = { stdHeight: number; kgPerM2: number; propSpacing: number; deckLen: number; soffitArea: number; slabMm: number; endMax?: number; tolerance?: number; openings?: OpeningCut[] };

export type BomRow = { code: string; description: string; group: "wall" | "wall-top" | "end" | "corner" | "deck" | "beam" | "filler" | "accessory"; w: number; h: number; qty: number; area: number; weight: number; custom: boolean; unit?: string };
export type FaceLayout = { code: string; length: number; height: number; panels: number[]; filler: number; top: number; geo?: FaceGeo };
export type PanelResult = {
  bom: BomRow[]; faces: FaceLayout[];
  summary: { panelArea: number; weight: number; standardPct: number; faceCount: number; faceLength: number; deckFillArea: number; props: number; kgPerM2: number; warnings: string[] };
};

const STEP = 50;

/** Fewest panels covering as much of `run` as possible (exact DP over 50 mm steps). */
export function fillRun(run: number, widths: number[]): { panels: number[]; left: number } {
  const units = Math.floor((run + 0.5) / STEP);          // +0.5 mm so 1599.99 counts as 1600
  const u = [...new Set(widths.map((w) => Math.round(w / STEP)).filter((x) => x > 0))];
  const best: (number | null)[] = Array(units + 1).fill(null); const pick: number[] = Array(units + 1).fill(0);
  best[0] = 0;
  for (let i = 1; i <= units; i++) for (const w of u) {
    const prev = i >= w ? best[i - w] : null;
    if (prev != null && (best[i] == null || prev + 1 < best[i]!)) { best[i] = prev + 1; pick[i] = w; }
  }
  let i = units; while (i > 0 && best[i] == null) i--;
  const panels: number[] = []; let covered = 0;
  while (i > 0) { panels.push(pick[i] * STEP); covered += pick[i] * STEP; i -= pick[i]; }
  return { panels: panels.sort((a, b) => b - a), left: Math.max(0, Math.round(run - covered)) };
}

function inside(p: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** y-intervals of polygon (minus holes) along the vertical line x. */
function intervalsAt(x: number, poly: Pt[], holes: Pt[][]): [number, number][] {
  const ys: number[] = [];
  const cut = (pl: Pt[]) => { for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
    const [x1, y1] = pl[j], [x2, y2] = pl[i];
    if ((x1 <= x && x2 > x) || (x2 <= x && x1 > x)) ys.push(y1 + ((x - x1) * (y2 - y1)) / (x2 - x1));
  } };
  cut(poly); holes.forEach(cut);
  ys.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ys.length; i += 2) {
    const mid: Pt = [x, (ys[i] + ys[i + 1]) / 2];
    if (inside(mid, poly) && !holes.some((h) => inside(mid, h))) out.push([ys[i], ys[i + 1]]);
  }
  return out;
}
function overlap(a: [number, number][], b: [number, number][]) {
  const out: [number, number][] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (hi > lo) out.push([lo, hi]); }
  return out;
}

export function layoutFloor(faces: Face[], decks: DeckPoly[], beams: BeamRun[], corners: number, catalog: CatPanel[], o: PanelOptions): PanelResult {
  const warnings: string[] = [];
  const cat = (c: string) => catalog.filter((p) => p.panel_category === c);
  const wallCat = cat("wall_panel").filter((p) => Math.abs(p.height_mm - o.stdHeight) < 1);
  const wallW = wallCat.map((p) => p.width_mm);
  if (!wallW.length) warnings.push(`No ${o.stdHeight} mm wall panels in the panel catalogue.`);
  const deckCat = cat("deck_panel"); const deckW = deckCat.map((p) => p.width_mm);
  const deckLen = deckCat[0]?.height_mm || o.deckLen;
  const byCode = new Map<string, BomRow>();
  const add = (key: string, row: Omit<BomRow, "qty" | "area" | "weight">, qty: number, unitWeight?: number) => {
    if (!qty) return;
    const r = byCode.get(key) ?? { ...row, qty: 0, area: 0, weight: 0 };
    const a = ((row.w * row.h) / 1e6) * qty;
    r.qty += qty; r.area += a; r.weight += unitWeight != null ? unitWeight * qty : a * o.kgPerM2;
    byCode.set(key, r);
  };

  // ---- wall faces
  const layouts: FaceLayout[] = [];
  const endMax = o.endMax ?? 250, tol = o.tolerance ?? 25;
  let ends = 0;
  const r5 = (v: number) => Math.round(v / 5) * 5;
  for (const f of faces) {
    if (f.length < 60) continue;
    if (f.part) {                        // piece over a door/window (lintel) or below a window sill
      const w = r5(f.length), h = r5(f.height);
      if (w <= 0 || h < 50) continue;
      const code = `${f.part === "above" ? "OH" : "OS"}-${w}-${h}`;
      add(code, { code, description: f.part === "above" ? "Panel over opening (lintel / head)" : "Panel below window sill", group: "filler", w, h, custom: true }, 1);
      continue;
    }
    if (f.length <= endMax) {           // wall end / return: closed with a stop-end, not wall panels
      ends++;
      const w = Math.round(f.length / 5) * 5;
      add(`SE-${w}-${Math.round(f.height)}`, { code: `SE-${w}-${Math.round(f.height)}`, description: "Wall end closure (stop-end)", group: "end", w, h: Math.round(f.height), custom: true }, 1);
      continue;
    }
    const fit = wallW.length ? fillRun(f.length, wallW) : { panels: [], left: Math.round(f.length) };
    const panels = fit.panels;
    const left = fit.left < tol ? 0 : Math.round(fit.left / 5) * 5;   // small gaps are taken up in the joints
    const top = Math.max(0, Math.round(f.height - o.stdHeight));
    layouts.push({ code: f.code, length: Math.round(f.length), height: Math.round(f.height), panels, filler: left, top, geo: f.geo });
    for (const w of panels) {
      const p = wallCat.find((x) => x.width_mm === w)!;
      add(p.panel_code, { code: p.panel_code, description: "Wall panel", group: "wall", w, h: o.stdHeight, custom: false }, 1, Number(p.weight_kg));
      if (top > 0) add(`WT-${w}-${top}`, { code: `WT-${w}-${top}`, description: "Wall top panel (custom height)", group: "wall-top", w, h: top, custom: true }, 1);
    }
    if (left > 0) {
      add(`WF-${left}-${Math.round(f.height)}`, { code: `WF-${left}-${Math.round(f.height)}`, description: "Wall filler (custom width)", group: "filler", w: left, h: Math.round(f.height), custom: true }, 1);
    }
    if (f.height < o.stdHeight - 1) warnings.push(`Face ${f.code} is only ${Math.round(f.height)} mm tall — standard panels need cutting.`);
  }

  // ---- door / window reveals (sides, head soffit, window sill bottom)
  for (const op of o.openings ?? []) {
    const t = r5(op.t), h = r5(op.h), w = r5(op.w);
    if (t <= 0 || w <= 0) continue;
    add(`RV-${t}-${h}`, { code: `RV-${t}-${h}`, description: `Opening side (reveal) ${t} × ${h}`, group: "end", w: t, h, custom: true }, 2);
    add(`OT-${w}-${t}`, { code: `OT-${w}-${t}`, description: `Opening head soffit ${w} × ${t}`, group: "end", w, h: t, custom: true }, 1);
    if (op.kind === "window") add(`OB-${w}-${t}`, { code: `OB-${w}-${t}`, description: `Window sill bottom ${w} × ${t}`, group: "end", w, h: t, custom: true }, 1);
  }
  if (o.openings?.length) warnings.push(`${o.openings.length} doors / windows cut out of the wall panels (lintel, sill and reveal pieces added).`);

  // ---- corners
  const ic = cat("internal_corner")[0], ec = cat("external_corner")[0];
  if (corners > 0) {
    const c = ic ?? ec;
    add("CORNER", { code: c ? `${ic?.panel_code ?? ""}${ic && ec ? " / " : ""}${ec?.panel_code ?? ""}` : "IC/EC", description: "Corner piece 65 mm (IC/EC — confirm type)", group: "corner", w: c?.width_mm ?? 65, h: o.stdHeight, custom: false }, corners, c ? Number(c.weight_kg) : undefined);
  }

  // ---- deck: strips across each slab, scaled to the net soffit area
  let fillArea = 0; const deckCount = new Map<number, number>(); let deckFiller = 0;
  const L = deckLen / 1000;
  for (const d of decks) {
    const xs = d.pts.map((p) => p[0]); const x0 = Math.min(...xs), x1 = Math.max(...xs);
    for (let x = x0; x < x1 - 0.05; x += L) {
      const xa = x + 0.02, xb = Math.min(x + L, x1) - 0.02;
      const ints = overlap(intervalsAt(xa, d.pts, d.holes), intervalsAt(xb, d.pts, d.holes));
      const stripLen = Math.min(L, x1 - x);
      for (const [lo, hi] of ints) {
        const run = (hi - lo) * 1000;
        const { panels, left } = deckW.length ? fillRun(run, deckW) : { panels: [], left: run };
        if (stripLen >= L - 0.001) for (const w of panels) deckCount.set(w, (deckCount.get(w) ?? 0) + 1);
        else deckFiller += (run * stripLen * 1000) / 1e6;       // short strip at the slab end → special panels
        deckFiller += (left * stripLen * 1000) / 1e6;
        fillArea += (run * stripLen * 1000) / 1e6;
      }
    }
  }
  const scale = fillArea > 0 && o.soffitArea > 0 ? Math.min(1, o.soffitArea / fillArea) : 1;
  if (fillArea > 0 && scale < 0.98) warnings.push(`Deck counts scaled to ${(scale * 100).toFixed(0)}% for wall tops / columns not decked (net soffit ${o.soffitArea.toFixed(2)} m²).`);
  for (const [w, n] of deckCount) {
    const p = deckCat.find((x) => x.width_mm === w)!;
    add(p.panel_code, { code: p.panel_code, description: "Deck panel", group: "deck", w, h: deckLen, custom: false }, Math.round(n * scale), Number(p.weight_kg));
  }
  if (deckFiller * scale > 0.01) {
    const a = deckFiller * scale;
    byCode.set("DF", { code: "DF", description: "Deck specials / fillers (custom)", group: "filler", w: 0, h: 0, qty: 1, area: a, weight: a * o.kgPerM2, custom: true, unit: "set" });
  }
  if (!decks.length && o.soffitArea > 0) warnings.push("No slab outline — deck panels not laid out. Mark the slab outline (Slab area tool or a slab layer).");

  // props, prop heads, soffit corner
  const deckArea = o.soffitArea;
  const props = deckArea > 0 ? Math.ceil(deckArea / (o.propSpacing * o.propSpacing)) : 0;
  if (props) {
    byCode.set("PH", { code: "PH", description: `Prop head (@ ${o.propSpacing.toFixed(2)} m grid)`, group: "accessory", w: 0, h: 0, qty: props, area: 0, weight: props * 4.5, custom: false, unit: "nos" });
    byCode.set("PROP", { code: "PROP", description: "Adjustable steel prop", group: "accessory", w: 0, h: 0, qty: props, area: 0, weight: 0, custom: false, unit: "nos" });
  }
  const faceLen = layouts.reduce((s, f) => s + f.length, 0);
  if (faceLen && deckArea > 0) {
    const sc = Math.ceil(faceLen / 1200);
    add("SC-100-1200", { code: "SC-100-1200", description: "Soffit corner 100 × 1200 (top of wall faces)", group: "corner", w: 100, h: 1200, custom: true }, sc);
  }

  // ---- beams
  for (const b of beams) {
    const pieces = Math.ceil(b.length / 1200);
    const side = Math.max(0, Math.round(b.d - o.slabMm));
    if (side > 0) add(`BS-${side}-1200`, { code: `BS-${side}-1200`, description: `Beam side panel ${side} × 1200`, group: "beam", w: side, h: 1200, custom: true }, pieces * b.sides);
    if (b.bottom && b.b > 0) add(`BB-${Math.round(b.b)}-1200`, { code: `BB-${Math.round(b.b)}-1200`, description: `Beam bottom panel ${Math.round(b.b)} × 1200`, group: "beam", w: Math.round(b.b), h: 1200, custom: true }, pieces);
  }

  if (ends) warnings.push(`${ends} short faces (≤ ${endMax} mm) treated as wall ends (stop-ends).`);
  const order: BomRow["group"][] = ["wall", "wall-top", "filler", "end", "corner", "deck", "beam", "accessory"];
  const bom = [...byCode.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.w - a.w || a.code.localeCompare(b.code))
    .map((r) => ({ ...r, area: Math.round(r.area * 100) / 100, weight: Math.round(r.weight * 10) / 10 }));
  const panelArea = bom.reduce((s, r) => s + r.area, 0);
  const stdArea = bom.filter((r) => !r.custom).reduce((s, r) => s + r.area, 0);
  const weight = bom.reduce((s, r) => s + r.weight, 0);
  return {
    bom, faces: layouts,
    summary: {
      panelArea: Math.round(panelArea * 100) / 100, weight: Math.round(weight), standardPct: panelArea ? Math.round((stdArea / panelArea) * 1000) / 10 : 0,
      faceCount: layouts.length, faceLength: Math.round(faceLen) / 1000, deckFillArea: Math.round(fillArea * 100) / 100, props,
      kgPerM2: panelArea ? Math.round((weight / panelArea) * 10) / 10 : 0, warnings,
    },
  };
}
