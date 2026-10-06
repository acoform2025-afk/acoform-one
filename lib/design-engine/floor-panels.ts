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
import { fabSpec } from "./fabrication";
import type { LayoutRules } from "./layout-rules";

export type CatPanel = { id: string; panel_code: string; panel_category: string; width_mm: number; height_mm: number; weight_kg: number; area_sqm: number };
export type FaceGeo = { a: Pt; b: Pt; off: number };                                    // plan px; off = sideways offset (px)
export type Face = { code: string; length: number; height: number; geo?: FaceGeo; geo3?: FaceGeo & { z0: number }; part?: "above" | "below"; set?: "column" };   // geo3: where a piece over / under an opening sits (3D only; z0 mm above the floor)   // part: short piece over a door/window or below a window sill
export type OpeningCut = { kind: "door" | "window"; w: number; h: number; t: number };                        // mm, one per opening (for reveals)                 // mm
export type DeckPoly = { code: string; pts: Pt[]; holes: Pt[][] };                     // metres
export type BeamRun = { code: string; length: number; b: number; d: number; sides: 1 | 2; bottom: boolean; inner?: number; outer?: number; lintel?: number }; // mm; inner / outer = side-face lengths with / without slab beyond (outer faces are full depth), lintel = length formed by the wall's top panels
export type ColumnRun = { code: string; w: number; d: number; h: number; qty: number; round: boolean; perimeter: number };   // mm
export type ElementRow = { kind: "column" | "beam" | "deck"; code: string; size: string; qty: number; area: number; detail: string };
/** Staircase geometry (mm). `assumed` = typical dog-leg used when only an area allowance is known; `sets` = identical staircases. */
export type StairGeo = { code: string; label: string; width: number; risers: number; riser: number; tread: number; waist: number; openSides: number; landingM2: number; flights: number; sets: number; assumed: boolean };
export type Fit = { panels: number[]; filler: number };
export type ColumnLayout = { code: string; w: number; d: number; h: number; qty: number; round: boolean; faceW: Fit; faceD: Fit; top: number; clamps: number };
export type BeamLayout = { code: string; length: number; b: number; d: number; side: number; sides: number; bottom: boolean; pieces: number[]; props: number };
export type StairRow = { k: "D" | "CPP"; w: number };          // a row of the stair soffit along the slope (mm)
export type StairPart = { code: string; desc: string; size: string; qty: number };   // per staircase (all its flights)
export type StairLayout = StairGeo & { slope: number; angle: number; across: Fit; along: number[]; cheekH: number; landing: { l: number; w: number; across: Fit; along: number[] } | null; props: number; closed?: boolean; style?: "india" | "china"; rows?: StairRow[]; parts?: StairPart[] };
export type PanelOptions = { extCorners?: number; upstands?: { h: number; length: number; label: string }[]; sunk?: { depth: number; perimeter: number; area: number }[]; rules?: LayoutRules; zoneDeck?: { panels: { code: string; w: number; L: number; custom: boolean }[]; specialArea: number; area: number; zones: number }; stairs?: StairGeo[]; stairSets?: { code: string; label: string; area: number }[]; tieH?: number; tieV?: number; columns?: ColumnRun[]; stdHeight: number; kgPerM2: number; propSpacing: number; deckLen: number; soffitArea: number; slabMm: number; endMax?: number; tolerance?: number; openings?: OpeningCut[] };

export type BomRow = { code: string; description: string; group: "wall" | "wall-top" | "column" | "end" | "corner" | "deck" | "beam" | "upstand" | "stair" | "drop" | "filler" | "accessory"; w: number; h: number; qty: number; area: number; weight: number; custom: boolean; unit?: string; sub?: string; basis?: string };
export type FaceLayout = { code: string; length: number; height: number; panels: number[]; filler: number; top: number; geo?: FaceGeo; geo3?: FaceGeo & { z0: number }; set?: "column"; end?: boolean };   // end: a wall end closed by a stop-end panel (filler = its width)
export type PanelResult = {
  bom: BomRow[]; faces: FaceLayout[]; elements: ElementRow[]; columns: ColumnLayout[]; beams: BeamLayout[]; stairs: StairLayout[];
  summary: { specials: { types: number; pcs: number; area: number }; panelArea: number; weight: number; accessoryWeight: number; standardPct: number; faceCount: number; faceLength: number; deckFillArea: number; props: number; kgPerM2: number; warnings: string[] };
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
export function intervalsAt(x: number, poly: Pt[], holes: Pt[][]): [number, number][] {
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
export function overlap(a: [number, number][], b: [number, number][]) {
  const out: [number, number][] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (hi > lo) out.push([lo, hi]); }
  return out;
}

export function layoutFloor(faces: Face[], decks: DeckPoly[], beams: BeamRun[], corners: number, catalog: CatPanel[], o: PanelOptions): PanelResult {
  const warnings: string[] = [];
  const cat = (c: string) => catalog.filter((p) => p.panel_category === c);
  const R = o.rules;
  const sysStd = !!R && R.system !== "acoform";                 // a chosen system's own sizes count as standard panels
  const wallCat = cat("wall_panel").filter((p) => Math.abs(p.height_mm - o.stdHeight) < 1);
  const wallW = R?.wallWidths.length ? R.wallWidths : wallCat.map((p) => p.width_mm);
  // the catalogue panel of this width, or the system's own panel (code WP-w-h, weight from the standard sections)
  const wallPanel = (w: number): CatPanel => wallCat.find((x) => x.width_mm === w)
    ?? { id: "", panel_code: `WP-${w}-${o.stdHeight}`, panel_category: "wall_panel", width_mm: w, height_mm: o.stdHeight, weight_kg: fabSpec(`WP-${w}-${o.stdHeight}`, "", w, o.stdHeight, 1).kgEach, area_sqm: (w * o.stdHeight) / 1e6 };
  if (!wallW.length) warnings.push(`No ${o.stdHeight} mm wall panels in the panel catalogue.`);
  // deck panels: the most common length (1200) is the strip length; other lengths are for specials
  const deckAll = cat("deck_panel");
  const lenCount = new Map<number, number>(); deckAll.forEach((p) => lenCount.set(p.height_mm, (lenCount.get(p.height_mm) ?? 0) + 1));
  const deckLen = R?.deckLengths.length && R.system !== "acoform" ? R.deckLengths[0] : [...lenCount.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0] - 1200) - Math.abs(b[0] - 1200))[0]?.[0] || o.deckLen;
  const deckCatRaw = deckAll.filter((p) => p.height_mm === deckLen);
  const deckW = R?.deckWidths.length ? R.deckWidths : deckCatRaw.map((p) => p.width_mm);
  const deckCat: CatPanel[] = deckW.map((w) => deckCatRaw.find((x) => x.width_mm === w)
    ?? { id: "", panel_code: `DP-${w}-${deckLen}`, panel_category: "deck_panel", width_mm: w, height_mm: deckLen, weight_kg: fabSpec(`DP-${w}-${deckLen}`, "", w, deckLen, 1).kgEach, area_sqm: (w * deckLen) / 1e6 });
  const widest = (c: string) => cat(c).sort((a, b) => b.width_mm - a.width_mm)[0];
  const item = (c: string, re?: RegExp) => cat(c).find((p) => !re || re.test(p.panel_code));
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
  const strip = R?.fullHeight ? R.bottomStrip : 0;
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
      // the stop-end is a panel across the wall end (full height): placed like a filler so the model and the drawings show it
      layouts.push({ code: f.code, length: Math.round(f.length), height: Math.round(f.height), panels: [], filler: w, top: 0, geo: f.geo, geo3: f.geo3, set: f.set, end: true });
      continue;
    }
    const fit = wallW.length ? fillRun(f.length, wallW) : { panels: [], left: Math.round(f.length) };
    const panels = fit.panels;
    // lift cores / shear walls drawn on column layers, cast first with the columns: column set to the first pour,
    // the rest formed with the slab
    if (f.set === "column" && R?.columnsSeparate && R.coresWithColumns && R.columnFirstCast > 0 && f.height > R.columnFirstCast) {
      const first = R.columnFirstCast, rest = Math.round(f.height - first);
      const leftC = fit.left < tol ? 0 : Math.round(fit.left / 5) * 5;
      for (const w of panels) {
        const p = wallPanel(w);
        add(`col:${p.panel_code}`, { code: p.panel_code, description: `Column panel (column set, first pour ${first})`, group: "column", w, h: o.stdHeight, custom: false }, 1, Number(p.weight_kg));
        if (first > o.stdHeight) add(`col:WT-${w}-${first - o.stdHeight}`, { code: `WT-${w}-${first - o.stdHeight}`, description: "Column top panel (custom height)", group: "column", w, h: first - o.stdHeight, custom: !sysStd }, 1);
        if (rest >= 50) add(`col:CT-${w}-${rest}`, { code: `CT-${w}-${rest}`, description: `Column top above the first pour (${rest} mm, cast with the slab)`, group: "wall-top", w, h: rest, custom: !sysStd }, 1);
      }
      if (leftC > 0) add(`col:CF-${leftC}-${first}`, { code: `CF-${leftC}-${first}`, description: "Column filler (custom width)", group: "column", w: leftC, h: first, custom: true }, 1);
      layouts.push({ code: f.code, length: Math.round(f.length), height: Math.round(f.height), panels, filler: leftC, top: rest, geo: f.geo, geo3: f.geo3, set: f.set });
      continue;
    }
    const left = fit.left < tol ? 0 : Math.round(fit.left / 5) * 5;   // small gaps are taken up in the joints
    const top = Math.max(0, Math.round(f.height - o.stdHeight));
    layouts.push({ code: f.code, length: Math.round(f.length), height: Math.round(f.height), panels, filler: left, top, geo: f.geo, geo3: f.geo3, set: f.set });
    // ACOFORM RK panels: a wall a little taller than the standard panel (25 … 175 mm, 25 steps) gets one W(RK) panel
    // (WRA 25, WRB 50 … WRG 175) instead of a standard panel + a wall-top piece
    const rk = !sysStd && top > 0 && top <= 175 && top % 25 === 0 ? `WR${"ABCDEFG"[top / 25 - 1]}` : null;
    const isStrip = strip > 0 && top > 0 && top <= strip + 10;   // full-height system: the rest is the bottom strip
    for (const w of panels) {
      const p = wallPanel(w);
      if (rk) { add(`${rk}-${w}`, { code: `${rk}-${w}`, description: `Wall panel ${o.stdHeight + top} (${o.stdHeight} W + RK ${top}, ${rk})`, group: "wall", w, h: o.stdHeight + top, custom: false }, 1, Number(wallCat.find((x) => x.panel_code === `${rk}-${w}`)?.weight_kg) || fabSpec(`${rk}-${w}`, "", w, o.stdHeight + top, 1).kgEach); continue; }
      add(p.panel_code, { code: p.panel_code, description: R?.fullHeight ? "Wall panel (full height)" : "Wall panel", group: "wall", w, h: o.stdHeight, custom: false }, 1, Number(p.weight_kg));
      if (isStrip) add(`WS-${w}-${top}`, { code: `WS-${w}-${top}`, description: `Bottom strip under full-height panel (${top} mm)`, group: "wall", w, h: top, custom: false }, 1);
      else if (top > 0) add(`WT-${w}-${top}`, { code: `WT-${w}-${top}`, description: "Wall top panel (custom height)", group: "wall-top", w, h: top, custom: !sysStd }, 1);
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

  // ---- columns: panels on each of the 4 faces + 4 external corners; round columns as a custom form set
  const elements: ElementRow[] = [];
  const colLayouts: ColumnLayout[] = [];
  const ecCat = cat("external_corner")[0];
  for (const c of o.columns ?? []) {
    const q = Math.max(0, Math.round(c.qty)); if (!q) continue;
    const H = Math.round(c.h);
    const area = ((c.perimeter * c.h) / 1e6) * q;
    if (c.round) {
      const dia = r5(Math.max(c.w, c.d));
      add(`col:RCF-${dia}-${H}`, { code: `RCF-${dia}-${H}`, description: `Round column form Ø${dia} × ${H} (set)`, group: "column", w: Math.round(c.perimeter), h: H, custom: true }, q);
      elements.push({ kind: "column", code: c.code, size: `Ø${dia}`, qty: q, area, detail: `round form set Ø${dia} × ${H}` });
      colLayouts.push({ code: c.code, w: dia, d: dia, h: H, qty: q, round: true, faceW: { panels: [], filler: 0 }, faceD: { panels: [], filler: 0 }, top: 0, clamps: Math.ceil(H / 600) });
      continue;
    }
    // columns cast first with their own formwork: panels up to the first pour; the rest is formed with the slab
    const first = R?.columnsSeparate && R.columnFirstCast > 0 ? Math.min(H, R.columnFirstCast) : H;
    const rest = H - first;
    const top = Math.max(0, first - o.stdHeight);
    const parts: string[] = [];
    const fits: Fit[] = [];
    for (const [X, n] of [[Math.round(c.w), 2], [Math.round(c.d), 2]] as [number, number][]) {
      const fit = wallW.length ? fillRun(X, wallW) : { panels: [], left: X };
      const left = fit.left < tol ? 0 : r5(fit.left);
      fits.push({ panels: fit.panels, filler: left });
      for (const w of fit.panels) {
        const p = wallPanel(w);
        add(`col:${p.panel_code}`, { code: p.panel_code, description: rest > 0 ? `Column panel (column set, first pour ${first})` : "Column panel", group: "column", w, h: o.stdHeight, custom: false }, n * q, Number(p.weight_kg));
        if (top > 0 && strip > 0 && top <= strip + 10) add(`col:WS-${w}-${top}`, { code: `WS-${w}-${top}`, description: `Bottom strip under full-height panel (${top} mm)`, group: "column", w, h: top, custom: false }, n * q);
        else if (top > 0) add(`col:WT-${w}-${top}`, { code: `WT-${w}-${top}`, description: "Column top panel (custom height)", group: "column", w, h: top, custom: !sysStd }, n * q);
        if (rest >= 50) add(`col:CT-${w}-${rest}`, { code: `CT-${w}-${rest}`, description: `Column top above the first pour (${rest} mm, cast with the slab)`, group: "wall-top", w, h: rest, custom: !sysStd }, n * q);
      }
      if (left > 0) add(`col:CF-${left}-${first}`, { code: `CF-${left}-${first}`, description: "Column filler (custom width)", group: "column", w: left, h: first, custom: true }, n * q);
      parts.push(`${X}: ${[...fit.panels.map(String), ...(left ? [`F${left}`] : [])].join("+") || "—"}`);
    }
    const ecLeg = R && R.system !== "acoform" ? R.externalCorner : (ecCat?.width_mm ?? 65);
    add("col:EC", { code: R && R.system !== "acoform" ? `EC-${ecLeg}-${first}` : ecCat?.panel_code ?? "EC", description: `Column external corner (${ecLeg} + ${ecLeg})`, group: "column", w: ecLeg, h: first, custom: !ecCat && !sysStd }, 4 * q, ecCat && !sysStd ? Number(ecCat.weight_kg) : undefined);
    elements.push({ kind: "column", code: c.code, size: `${Math.round(c.w)}×${Math.round(c.d)}`, qty: q, area, detail: `${parts.join(" · ")} · 4 corners${top ? ` · top ${top}` : ""}${rest > 0 ? ` · cast first to ${first}, top ${rest} with the slab` : ""}` });
    colLayouts.push({ code: c.code, w: Math.round(c.w), d: Math.round(c.d), h: first, qty: q, round: false, faceW: fits[0], faceD: fits[1], top, clamps: Math.ceil(H / 600) });
  }

  // ---- corners
  const ic = widest("internal_corner"), ec = widest("external_corner");
  const legs = (a: number, b: number) => (R?.bothLegs ? a + b : a);    // corner area on both legs (Indian BOM practice) or one leg
  if (sysStd && (corners > 0 || (o.extCorners ?? 0) > 0)) {
    const ia = R!.internalCorner, ib = R!.internalCornerLeg || ia, ea = Math.round(R!.externalCorner * 10) / 10;
    if (corners > 0) add("CORNER", { code: `IC-${ia}x${ib}-${o.stdHeight}`, description: `Internal corner ${ia} × ${ib}${R!.bothLegs ? " (area on both legs)" : ""}`, group: "corner", w: legs(ia, ib), h: o.stdHeight, custom: false }, corners);
    if ((o.extCorners ?? 0) > 0 && R!.wallEcAngles) add("ECW", { code: `EC-${ea}x${ea}-${o.stdHeight}`, description: `External corner angle ${ea} × ${ea} (outside corners of walls)${R!.bothLegs ? " (area on both legs)" : ""}`, group: "corner", w: legs(ea, ea), h: o.stdHeight, custom: false }, o.extCorners!);
  } else if (corners > 0) {
    const c = ic ?? ec;
    add("CORNER", { code: c ? `${ic?.panel_code ?? ""}${ic && ec ? " / " : ""}${ec?.panel_code ?? ""}` : "IC/EC", description: "Corner piece 65 mm (IC/EC — confirm type)", group: "corner", w: c?.width_mm ?? 65, h: o.stdHeight, custom: false }, corners, c ? Number(c.weight_kg) : undefined);
  }

  // ---- deck: strips across each slab, scaled to the net soffit area
  let fillArea = 0; const deckCount = new Map<number, number>(); let deckFiller = 0;
  const L = deckLen / 1000;
  const deckRows: { code: string; size: string; area: number; n: number; special: number }[] = [];
  const zd = o.zoneDeck && o.zoneDeck.panels.length ? o.zoneDeck : null;
  if (zd) {
    // the numbered room-by-room deck layout (installation drawing) is the deck BOM: rows sized to each room
    const cnt = new Map<string, { w: number; L: number; custom: boolean; n: number }>();
    for (const p of zd.panels) { const c = cnt.get(p.code) ?? { w: p.w, L: p.L, custom: p.custom, n: 0 }; c.n++; cnt.set(p.code, c); }
    for (const [code, c] of cnt) {
      const cp = deckAll.find((x) => x.panel_code === code);
      add(code, { code, description: c.custom ? "Deck panel (special length / width)" : "Deck panel", group: "deck", w: c.w, h: c.L, custom: c.custom }, c.n, cp ? Number(cp.weight_kg) : fabSpec(code, "", c.w, c.L, 1).kgEach);
    }
    if (zd.specialArea > 0.01) byCode.set("DF", { code: "DF", description: "Deck specials / plywood (odd corners left in the rooms)", group: "filler", w: 0, h: 0, qty: 1, area: zd.specialArea, weight: zd.specialArea * o.kgPerM2, custom: true, unit: "set" });
    fillArea = zd.area;
    const lens = [...new Set(zd.panels.map((p) => p.L))].sort((a, b) => b - a);
    elements.push({ kind: "deck", code: `M1–M${zd.zones}`, size: `${zd.zones} rooms / bays`, qty: 1, area: zd.area, detail: `${zd.panels.length} deck panels, lengths ${lens.slice(0, 6).join(" / ")} · specials ${zd.specialArea.toFixed(2)} m²` });
  }
  for (const d of zd ? [] : decks) {
    const xs = d.pts.map((p) => p[0]); const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const ys = d.pts.map((p) => p[1]);
    const before = { fill: fillArea, spec: deckFiller, n: [...deckCount.values()].reduce((a, b) => a + b, 0) };
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
    deckRows.push({ code: d.code, size: `${(x1 - x0).toFixed(2)} × ${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} m`, area: fillArea - before.fill, n: [...deckCount.values()].reduce((a, b) => a + b, 0) - before.n, special: deckFiller - before.spec });
  }
  const scale = !zd && fillArea > 0 && o.soffitArea > 0 ? Math.min(1, o.soffitArea / fillArea) : 1;
  for (const r of deckRows) elements.push({ kind: "deck", code: r.code, size: r.size, qty: 1, area: r.area * scale, detail: `${Math.round(r.n * scale)} deck panels × ${deckLen} long · specials ${(r.special * scale).toFixed(2)} m²${scale < 0.98 ? ` (net of wall tops / columns, ×${scale.toFixed(2)})` : ""}` });
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

  // deck support (Mivan drop-head system): mid beams span between prop heads; beam lines at deck length + prop head
  const deckArea = o.soffitArea;
  const ph = sysStd ? undefined : item("prop_head"), mb = sysStd ? undefined : item("deck_beam");
  const phW = sysStd ? R!.propHead[0] : (ph?.width_mm ?? 100), mbW = sysStd ? R!.midBeam : (ph?.width_mm ?? 100);
  const lineSp = (deckLen + mbW) / 1000;                                                // e.g. 1200 + 100 = 1.30 m
  const alongSp = Math.min(o.propSpacing, mb ? (mb.height_mm + phW) / 1000 : o.propSpacing);  // e.g. 1150 + 100 = 1.25 m
  if (lineSp > 1.3 + 1e-6 || alongSp > 1.3 + 1e-6) warnings.push(`Prop grid ${lineSp.toFixed(2)} × ${alongSp.toFixed(2)} m is wider than 1.3 m (JGJ 386 practice) — check deflection.`);
  const props = deckArea > 0 ? Math.ceil(deckArea / (lineSp * alongSp)) : 0;
  if (props) {
    byCode.set("PH", { code: ph?.panel_code ?? (sysStd ? `PH-${R!.propHead[0]}x${R!.propHead[1]}` : "PH"), description: `Prop head${sysStd ? ` ${R!.propHead[0]} × ${R!.propHead[1]}` : ""} (grid ${lineSp.toFixed(2)} × ${alongSp.toFixed(2)} m)`, group: "accessory", w: 0, h: 0, qty: props, area: 0, weight: props * (ph ? Number(ph.weight_kg) : 4.5), custom: false, unit: "nos" });
    byCode.set("MB", { code: mb?.panel_code ?? (sysStd ? `MB-${R!.midBeam}-${Math.round(alongSp * 1000 - phW)}` : "MB"), description: `Mid beam${sysStd ? ` ${R!.midBeam} wide` : ""} (deck support between prop heads)`, group: "accessory", w: 0, h: 0, qty: props, area: 0, weight: props * (mb ? Number(mb.weight_kg) : 8), custom: false, unit: "nos" });
    const pr = item("accessory", /^PROP/);
    byCode.set("PROP", { code: pr?.panel_code ?? "PROP", description: "Adjustable steel prop", group: "accessory", w: 0, h: 0, qty: props, area: 0, weight: props * (pr ? Number(pr.weight_kg) : 14), custom: false, unit: "nos" });
  }
  const faceLen = layouts.reduce((s, f) => s + f.length, 0);
  // the deck meets the top of every wall face, every inner beam side and every column face: a soffit corner runs along each
  const beamScLen = beams.reduce((s, b) => s + (b.inner != null ? b.inner : b.bottom && b.b > 0 ? b.length * b.sides : 0), 0);
  const colScLen = (o.columns ?? []).reduce((s, c) => s + c.perimeter * c.qty, 0);
  if (faceLen + beamScLen + colScLen > 0 && deckArea > 0) {
    const scp = sysStd ? undefined : item("soffit_corner");
    const L = sysStd ? R!.soffitCornerLen : scp?.height_mm ?? 1200;
    const w = scp?.width_mm ?? 100;
    if (sysStd && (R!.soffitCornerLeg > 0 || R!.beamCapLeg > 0)) {
      // soffit corner w × leg along wall tops and column faces; beam cap w × deeper leg along beam sides (own line)
      const sl = R!.soffitCornerLeg || 100, bl = R!.beamCapLeg || sl, ww = R!.soffitCornerW || 100;
      const nW = (faceLen > 50 ? Math.ceil(faceLen / L) : 0) + (colScLen > 50 ? Math.ceil(colScLen / L) : 0);
      const where = [faceLen > 50 ? `wall tops ${(faceLen / 1000).toFixed(1)} m` : "", colScLen > 50 ? `column faces ${(colScLen / 1000).toFixed(1)} m` : ""].filter(Boolean).join(", ");
      if (nW) add("SC", { code: `SC-${ww}x${sl}-${L}`, description: `Soffit corner ${ww} × ${sl} (${where})${R!.bothLegs ? " — area on both legs" : ""}`, group: "corner", w: legs(ww, sl), h: L, custom: false }, nW);
      if (beamScLen > 50) add("SCB", { code: `SCB-${ww}x${bl}-${L}`, description: `Beam cap (soffit corner on beam sides) ${ww} × ${bl} (${(beamScLen / 1000).toFixed(1)} m)${R!.bothLegs ? " — area on both legs" : ""}`, group: "corner", w: legs(ww, bl), h: L, custom: false }, Math.ceil(beamScLen / L));
    } else {
    const n = [faceLen, beamScLen, colScLen].reduce((s2, len) => s2 + (len > 50 ? Math.ceil(len / L) : 0), 0);
    const where = [faceLen > 50 ? `wall tops ${(faceLen / 1000).toFixed(1)} m` : "", beamScLen > 50 ? `beam sides ${(beamScLen / 1000).toFixed(1)} m` : "", colScLen > 50 ? `column faces ${(colScLen / 1000).toFixed(1)} m` : ""].filter(Boolean).join(", ");
    if (n) add("SC", { code: scp?.panel_code ?? `SC-${w}-${L}`, description: `Soffit corner (${where})`, group: "corner", w, h: L, custom: !scp }, n, scp ? Number(scp.weight_kg) : undefined);
    }
  }
  // external kicker along the outer slab edge (next lift's wall panels sit on it)
  const kp = sysStd ? undefined : item("kicker");
  let outer = 0;
  for (const d of decks) for (let i = 0, j = d.pts.length - 1; i < d.pts.length; j = i++) outer += Math.hypot(d.pts[i][0] - d.pts[j][0], d.pts[i][1] - d.pts[j][1]);
  if (outer > 0 && sysStd && R!.kickerMm > 0) {
    add("KP", { code: `K-${R!.kickerMm}-1200`, description: `External kicker ${R!.kickerMm} high along slab edge (${outer.toFixed(1)} m)`, group: "corner", w: R!.kickerMm, h: 1200, custom: false }, Math.ceil((outer * 1000) / 1200));
    // kicker corner pieces at every corner of the slab edge: external (outside corner) and internal (re-entrant corner)
    if (R!.kickerCornerLen > 0) {
      let kce = 0, kic = 0;
      for (const d of decks) {
        const P = d.pts, n = P.length; if (n < 3) continue;
        let A = 0; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
        for (let i = 0; i < n; i++) {
          const a = P[(i + n - 1) % n], v = P[i], c = P[(i + 1) % n];
          const x1 = v[0] - a[0], y1 = v[1] - a[1], x2 = c[0] - v[0], y2 = c[1] - v[1];
          const l1 = Math.hypot(x1, y1), l2 = Math.hypot(x2, y2); if (l1 < 0.05 || l2 < 0.05) continue;
          const cr = (x1 * y2 - y1 * x2) / (l1 * l2); if (Math.abs(cr) < 0.5) continue;      // only real corners (not straight runs)
          if (Math.sign(cr) === Math.sign(A)) kce++; else kic++;
        }
      }
      const kl = R!.kickerCornerLen, kw = legs(R!.kickerMm, R!.kickerMm);
      if (kce) add("KCE", { code: `KCE-${R!.kickerMm}-${kl}`, description: `Kicker external corner ${R!.kickerMm} × ${R!.kickerMm} (outside corners of the slab edge)`, group: "corner", w: kw, h: kl, custom: false }, kce);
      if (kic) add("KIC", { code: `KIC-${R!.kickerMm}-${kl}`, description: `Kicker internal corner ${R!.kickerMm} × ${R!.kickerMm} (re-entrant corners of the slab edge)`, group: "corner", w: kw, h: kl, custom: false }, kic);
    }
  } else if (outer > 0 && !sysStd) {
    const L = kp?.height_mm ?? 1200;
    add("KP", { code: kp?.panel_code ?? `KP-100-${L}`, description: `External kicker along slab edge (${outer.toFixed(1)} m)`, group: "corner", w: kp?.width_mm ?? 100, h: L, custom: !kp }, Math.ceil((outer * 1000) / L), kp ? Number(kp.weight_kg) : undefined);
  }

  // ---- upstands / planters on the slab: both faces, panels of the upstand height in 1200 / 900 / 600 / 300 lengths
  for (const up of o.upstands ?? []) {
    const h = Math.round(up.h || R?.upstandMm || 250), run = up.length * 1000;
    const f = fillRun(run, [1200, 900, 600, 300]); const left = f.left < tol ? 0 : Math.ceil(f.left / 25) * 25;
    for (const Lp of [...f.panels, ...(left ? [left] : [])]) add(`UP-${h}-${Lp}`, { code: `UP-${h}-${Lp}`, description: `Upstand / planter panel ${h} × ${Lp} (${up.label})`, group: "upstand", w: h, h: Lp, custom: true }, 1);
  }

  // ---- beams: length made up of 1200/900/600/300 panels (+ filler); 2 sides and a bottom for drawn beams; beam props
  const BEAM_LEN = [1200, 900, 600, 300];
  let beamProps = 0;
  const beamLayouts: BeamLayout[] = [];
  const beamAgg = new Map<string, { code: string; size: string; n: number; len: number; area: number; pieces: Map<number, number>; sides: number; bottom: boolean; props: number }>();
  for (const b of beams) {
    const side = Math.max(0, Math.round(b.d - o.slabMm)), bw = Math.round(b.b);
    const fit = fillRun(b.length, BEAM_LEN);
    const bStep = R?.beamLenStep && R.beamLenStep > 5 ? R.beamLenStep : 5;
    const left = fit.left < tol ? 0 : Math.ceil(fit.left / bStep) * bStep;  // beam filler made to the system's length step
    const pieces = [...fit.panels, ...(left ? [left] : [])];
    const faceRun = (run: number) => { const f = fillRun(run, BEAM_LEN); const l = f.left < tol ? 0 : Math.ceil(f.left / bStep) * bStep; return [...f.panels, ...(l ? [l] : [])]; };
    const faces = b.inner != null || b.outer != null;
    for (const Lp of pieces) {
      const cust = !BEAM_LEN.includes(Lp);
      if (side > 0 && !faces) add(`BS-${side}-${Lp}`, { code: `BS-${side}-${Lp}`, description: `Beam side panel ${side} × ${Lp}${cust ? " (filler)" : ""}`, group: "beam", w: side, h: Lp, custom: true }, b.sides);
      if (b.bottom && bw > 0) add(`BB-${bw}-${Lp}`, { code: `BB-${bw}-${Lp}`, description: `Beam bottom panel ${bw} × ${Lp}${cust ? " (filler)" : ""}`, group: "beam", w: bw, h: Lp, custom: true }, 1);
    }
    if (faces) {
      // side faces measured on the drawing: inner faces (slab beyond) depth − slab, outer faces (slab edge / opening) full depth
      if (side > 0 && (b.inner ?? 0) > 50) for (const Lp of faceRun(b.inner!)) add(`BS-${side}-${Lp}`, { code: `BS-${side}-${Lp}`, description: `Beam side panel ${side} × ${Lp}${BEAM_LEN.includes(Lp) ? "" : " (filler)"}`, group: "beam", w: side, h: Lp, custom: true }, 1);
      const full = Math.round(b.d);
      if ((b.outer ?? 0) > 50) for (const Lp of faceRun(b.outer!)) add(`BSE-${full}-${Lp}`, { code: `BSE-${full}-${Lp}`, description: `Beam outer side panel (slab edge / opening, full depth) ${full} × ${Lp}`, group: "beam", w: full, h: Lp, custom: true }, 1);
      // lintels in a wall line: both faces are the wall's top panels over the opening
      if (side > 0 && (b.lintel ?? 0) > 50) for (const Lp of faceRun(b.lintel!)) add(`T-${side}-${Lp}`, { code: `T-${side}-${Lp}`, description: `Wall top panel over opening (lintel ${bw} × ${Math.round(b.d)}) ${side} × ${Lp}`, group: "wall-top", w: side, h: Lp, custom: true }, 2);
    }
    const props = b.bottom && bw > 0 ? Math.ceil(b.length / 1200) + 1 : 0;
    beamProps += props;
    beamLayouts.push({ code: b.code, length: Math.round(b.length), b: bw, d: Math.round(b.d), side, sides: b.sides, bottom: b.bottom && bw > 0, pieces, props });
    const size = bw > 0 ? `${bw}×${Math.round(b.d)}` : `D ${Math.round(b.d)}`;
    const key = `${b.code}|${size}|${b.sides}|${b.bottom}`;
    const g = beamAgg.get(key) ?? { code: b.code, size, n: 0, len: 0, area: 0, pieces: new Map<number, number>(), sides: b.sides, bottom: b.bottom && bw > 0, props: 0 };
    g.n++; g.len += b.length; g.props += props;
    g.area += (b.length * side * b.sides + (b.bottom ? b.length * bw : 0)) / 1e6;
    for (const Lp of pieces) g.pieces.set(Lp, (g.pieces.get(Lp) ?? 0) + 1);
    beamAgg.set(key, g);
  }
  for (const g of beamAgg.values()) {
    const std = BEAM_LEN.filter((L) => g.pieces.get(L)).map((L) => `${g.pieces.get(L)}×${L}`);
    const fill = [...g.pieces.entries()].filter(([L]) => !BEAM_LEN.includes(L)).reduce((a, [, n]) => a + n, 0);
    elements.push({ kind: "beam", code: g.n > 1 ? `${g.code} (${g.n} runs)` : g.code, size: g.size, qty: g.n, area: g.area,
      detail: `${(g.len / 1000).toFixed(2)} m: ${[...std, ...(fill ? [`${fill} fillers`] : [])].join(" + ") || "—"} per side · ${g.sides} side${g.sides > 1 ? "s" : ""}${g.bottom ? " + bottom" : ""}${g.props ? ` · ${g.props} beam props` : ""}` });
  }
  if (beamProps) {
    byCode.set("BPH", { code: "BPH", description: "Beam prop head (under beam bottoms @ 1.2 m)", group: "accessory", w: 0, h: 0, qty: beamProps, area: 0, weight: beamProps * (ph ? Number(ph.weight_kg) : 4.5), custom: false, unit: "nos" });
    const pr = byCode.get("PROP");
    if (pr) { pr.weight += (pr.weight / Math.max(1, pr.qty)) * beamProps; pr.qty += beamProps; pr.description = "Adjustable steel prop (deck + beams)"; }
    else byCode.set("PROP", { code: "PROP", description: "Adjustable steel prop (beams)", group: "accessory", w: 0, h: 0, qty: beamProps, area: 0, weight: 0, custom: false, unit: "nos" });
  }

  // ---- staircases (aluminium-formwork stair, cast with the floor). Two drawing conventions (layout rule stairStyle):
  //  india (Indian Mivan practice): soffit in rows along the slope — deck panels "450 D 700" (450 along the slope ×
  //    700 across) between 150 wide prop strips "150 SPCPP {flight width}" carried on props; L-shaped step panels
  //    "250+158 SPTR {w}" (tread + riser) with a "65+65 SPTREC" corner angle at every nosing; serrated side panels:
  //    SPGUN on the wall side, SPCOVER on the open (well) side; special wall panels SPW under the flight;
  //  china (dog-tooth system): soffit panels 400 across (200 at each edge — free-edge / anti-penetration), lengths
  //    1200/900/600/300 along the slope; dog-tooth side panels DT both sides; L-step panels TS; trapezoidal TZ-400 +
  //    triangular wall panels.
  //  Both: riser shutter on the top step, C-channel at the foot, stop panel at the top, landing soffit panels, props,
  //  pins @ ≤ 300 (200 on step panels). Open stair (rule stairClosed off): riser shutters only, treads by hand.
  const stairLayouts: StairLayout[] = [];
  const ALONG = [1200, 900, 600, 300];
  // a short end piece (< 300) is not made on its own: the last panel is made longer to close the run
  const along = (L: number) => { const f = fillRun(L, ALONG); const left = f.left < tol ? 0 : Math.ceil(f.left / 5) * 5; if (left && left < 300 && f.panels.length) { const p = [...f.panels]; p[p.length - 1] += left; return p; } return [...f.panels, ...(left ? [left] : [])]; };
  const acrossFit = (W: number): Fit => { const f = deckW.length ? fillRun(W, deckW) : { panels: [], left: W }; return { panels: f.panels, filler: f.left < tol ? 0 : r5(f.left) }; };
  // china: soffit across the flight: 200 | 400 … 400 | (filler) | 200
  const stairAcross = (W: number): Fit => {
    if (W < 600) return { panels: [r5(W)], filler: 0 };
    const inner = W - 400, n = Math.floor(inner / 400), left = r5(inner - n * 400);
    return { panels: [200, ...Array(n).fill(400), 200], filler: left >= 25 ? left : 0 };
  };
  // india: rows along the slope — D 450, CPP 150, D 450, CPP 150 … D (last one made to suit); D lengths across
  const stairRows = (L: number): StairRow[] => {
    const k = Math.max(1, Math.ceil((L + 150) / 600)), rows: StairRow[] = [];
    for (let i = 0; i < k - 1; i++) rows.push({ k: "D", w: 450 }, { k: "CPP", w: 150 });
    let last = r5(L - (k - 1) * 600);
    if (last < 150 && rows.length >= 2) { rows.pop(); const prev = rows.pop()!; last = r5(prev.w + 150 + last); }
    rows.push({ k: "D", w: Math.max(50, last) });
    return rows;
  };
  const dAcross = (W: number): Fit => { const f = fillRun(W, [700, 600, 500, 400, 300]); return { panels: f.panels, filler: f.left < tol ? 0 : r5(f.left) }; };
  const closed = R ? R.stairClosed : true;
  const style: "india" | "china" = R?.stairStyle ?? "india";
  let stairProps = 0, riserBrackets = 0, stepPins = 0;
  for (const g of o.stairs ?? []) {
    if (!(g.width > 0 && g.risers > 0 && g.riser > 0 && g.tread > 0)) continue;
    const hyp = Math.hypot(g.riser, g.tread), slope = Math.round(g.risers * hyp), cos = g.tread / hyp;
    const cheekH = r5(g.waist / cos + g.riser);
    const india = style === "india";
    const acr = india ? dAcross(g.width) : stairAcross(g.width), alg = along(slope);
    const rows = india ? stairRows(slope) : undefined;
    let landing: StairLayout["landing"] = null;
    if (g.landingM2 > 0) {
      const lw = g.width, ll = Math.round((g.landingM2 * 1e6) / lw);
      landing = { l: ll, w: lw, across: acrossFit(ll), along: along(lw) };
    }
    const nCpp = rows ? rows.filter((r) => r.k === "CPP").length : 0;
    const flightProps = india ? (nCpp + 1) * (Math.ceil(g.width / 1200) + 1) : (Math.ceil(slope / 1200) + 1) * (Math.ceil(g.width / 1200) + 1);
    const props = flightProps + (landing ? Math.ceil(g.landingM2 / 1.44) + 1 : 0);
    const parts: StairPart[] = [];
    const lay: StairLayout = { ...g, slope, angle: Math.round((Math.atan2(g.riser, g.tread) * 180) / Math.PI), across: acr, along: alg, cheekH, landing, props, closed, style, rows, parts };
    stairLayouts.push(lay);
    if (g.assumed) continue;                                  // area allowance only: priced as a set below, drawing shows a typical stair
    const n = g.flights * g.sets, wallSides = Math.max(0, 2 - g.openSides), openSides = Math.min(2, g.openSides);
    // one line of this staircase: q per flight → BOM (all flights of all identical stairs) + the stair's own list
    const put = (row: Omit<BomRow, "qty" | "area" | "weight">, q: number, unitWeight?: number) => {
      if (q <= 0) return;
      add(row.code, row, q * n, unitWeight);
      const pp = parts.find((x) => x.code === row.code);
      const size = row.w && row.h ? `${row.w} × ${row.h}` : row.h ? `L ${row.h}` : row.w ? `${row.w}` : "—";
      if (pp) pp.qty += q * g.flights; else parts.push({ code: row.code, desc: row.description, size, qty: q * g.flights });
    };
    const rw = r5(g.width), rh = r5(g.riser), tw = r5(g.tread);
    if (india && rows) {
      // soffit rows: deck panels across each D row, one prop strip per CPP row
      for (const r of rows) {
        if (r.k === "CPP") { put({ code: `150 SPCPP ${rw}`, description: "Stair prop strip 150 across the flight (props under it)", group: "stair", w: 150, h: rw, custom: true }, 1); continue; }
        for (const L of [...acr.panels, ...(acr.filler ? [acr.filler] : [])]) {
          const std = r.w === 450 && [700, 600].includes(L);
          put({ code: `${r.w} D ${L}`, description: std ? "Stair soffit deck panel" : "Stair soffit deck panel (special size)", group: "stair", w: r.w, h: L, custom: !std }, 1);
        }
      }
      // side panels: SPGUN against the wall, SPCOVER on the open (well) side — one piece per flight up to 3 m
      const pcs = Math.max(1, Math.ceil(slope / 3000)), pl = r5(slope / pcs);
      if (wallSides) put({ code: `SPGUN ${cheekH}-${pl}`, description: "Stair side panel, wall side (serrated)", group: "stair", w: cheekH, h: pl, custom: true }, wallSides * pcs);
      if (openSides) put({ code: `SPCOVER ${cheekH}-${pl}`, description: "Stair side panel, open / well side (serrated)", group: "stair", w: cheekH, h: pl, custom: true }, openSides * pcs);
    } else {
      for (const L of alg) {
        for (const [i, w] of acr.panels.entries()) {
          const edge = i === 0 || i === acr.panels.length - 1;
          put({ code: `SS-${w}-${L}`, description: edge && w === 200 ? "Stair soffit edge panel 200 (free-edge support / anti-penetration)" : "Stair soffit panel", group: "stair", w, h: L, custom: true }, 1);
        }
        if (acr.filler) put({ code: `SS-${acr.filler}-${L}`, description: `Stair soffit filler ${acr.filler} × ${L}`, group: "stair", w: acr.filler, h: L, custom: true }, 1);
        put({ code: `DT-${cheekH}-${L}`, description: "Dog-tooth (serrated) side panel — teeth form the step ends", group: "stair", w: cheekH, h: L, custom: true }, 2);
      }
    }
    // step panels: one piece up to 1500 wide (5 mm clearance), wider flights in equal pieces
    const pieces = Math.max(1, Math.ceil(rw / 1500)), pw = r5(rw / pieces) - (india ? 5 : 0);
    if (closed) {
      if (india) {
        put({ code: `${tw}+${rh} SPTR ${pw}`, description: `Step panel (tread ${tw} + riser ${rh})${pieces > 1 ? `, ${pieces} per step` : ""}, Ø20 vents`, group: "stair", w: pw, h: tw + rh, custom: true }, (g.risers - 1) * pieces);
        put({ code: `65+65 SPTREC ${pw}`, description: "Nosing corner angle 65 + 65 (every step)", group: "stair", w: 65, h: pw, custom: true }, (g.risers - 1) * pieces);
      } else put({ code: `TS-${pw}-${tw}x${rh}`, description: `L-shaped step panel (tread ${tw} + riser ${rh})${pieces > 1 ? `, ${pieces} pieces per step` : ""} — Ø20 vent holes every 2nd tread`, group: "stair", w: pw, h: tw + rh, custom: true }, (g.risers - 1) * pieces);
      put({ code: `RS-${pw}-${rh}`, description: "Riser shutter (top step at the landing)", group: "stair", w: pw, h: rh, custom: true }, pieces);
      stepPins += n * (g.risers - 1) * pieces * (2 * Math.ceil(pw / 200) + 2 * Math.ceil((tw + rh) / 200));
    } else {
      put({ code: `RS-${pw}-${rh}`, description: `Riser shutter${pieces > 1 ? ` (${pieces} pieces per step)` : ""}`, group: "stair", w: pw, h: rh, custom: true }, g.risers * pieces);
    }
    riserBrackets += 2 * n * g.risers;
    // C-channel at the foot of the flight (std 1400) and stop panel at the top
    const cc = fillRun(rw, [1400, 1200, 900, 600, 300]);
    for (const L of [...cc.panels, ...(cc.left >= 50 ? [r5(cc.left)] : [])]) put({ code: `CC-${L}`, description: "Stair C-channel (foot of the flight)", group: "stair", w: 0, h: L, custom: false, unit: "nos" }, 1);
    put({ code: `STP-${rw}-${cheekH}`, description: "Stair stop panel (top of the flight / construction joint)", group: "stair", w: rw, h: cheekH, custom: true }, 1);
    // wall side: special wall panels under the flight, top cut to the slope (400 wide) + a triangular one at the foot
    if (wallSides) {
      const run = (g.risers - 1) * g.tread, nT = Math.max(1, Math.floor(run / 400));
      put({ code: india ? "SPW-400" : "TZ-400", description: "Special wall panel 400 under the flight (top cut to the slope)", group: "stair", w: 400, h: 0, custom: true, unit: "nos" }, wallSides * nT);
      put({ code: india ? "SPW-TRI" : "TRI", description: "Triangular wall panel (foot of the flight at the wall)", group: "stair", w: 0, h: 0, custom: true, unit: "nos" }, wallSides);
    }
    if (landing) for (const L of landing.along) {
      for (const w of landing.across.panels) {
        const dp = L === deckLen ? deckCat.find((x) => x.width_mm === w) : undefined;
        if (dp) put({ code: dp.panel_code, description: "Deck panel (landing)", group: "deck", w, h: L, custom: false }, 1, Number(dp.weight_kg));
        else put({ code: `LS-${w}-${L}`, description: `Landing soffit panel ${w} × ${L}`, group: "stair", w, h: L, custom: true }, 1);
      }
      if (landing.across.filler) put({ code: `LS-${landing.across.filler}-${L}`, description: `Landing soffit filler ${landing.across.filler} × ${L}`, group: "stair", w: landing.across.filler, h: L, custom: true }, 1);
    }
    parts.push({ code: "RBR", desc: "Riser bracket / step clamp", size: "—", qty: 2 * g.flights * g.risers });
    parts.push({ code: "PROP-ST", desc: india ? "Stair prop under the prop strips and landing" : "Stair prop with swivel head", size: "adjustable", qty: props * g.flights });
    if (closed) parts.push({ code: "PIN-ST", desc: "Pins & wedges on step panels (@ 200)", size: "—", qty: g.flights * (g.risers - 1) * pieces * (2 * Math.ceil(pw / 200) + 2 * Math.ceil((tw + rh) / 200)) });
    stairProps += props * n;
  }
  // staircases known only as an area (company allowance / lump sum): a project-specific set
  for (const st of o.stairSets ?? []) {
    byCode.set(`ST:${st.code}`, { code: st.code, description: `${st.label} — staircase formwork set (custom, see typical stair modulation)`, group: "stair", w: 0, h: 0, qty: 1, area: st.area, weight: st.area * o.kgPerM2, custom: true, unit: "set" });
  }

  // ---- drop (suspended) formwork round sunk slabs: edge plates of the drop depth in 1200 lengths, hung on square tubes
  let dropTube = 0;
  for (const sk of o.sunk ?? []) {
    if (!(sk.depth >= 25 && sk.perimeter > 0)) continue;
    const n = Math.ceil((sk.perimeter * 1000) / 1200);
    add(`SK-${sk.depth}-1200`, { code: `SK-${sk.depth}-1200`, description: `Drop form plate ${sk.depth} high (sunk slab edge)`, group: "drop", w: sk.depth, h: 1200, custom: false }, n);
    dropTube += sk.perimeter;
  }

  // ======== accessories (elaborated) — every line says how it was counted ========
  const accW = (re: RegExp, d: number) => { const p = item("accessory", re); return { code: p?.panel_code, kg: p ? Number(p.weight_kg) : d }; };
  const acc = (key: string, sub: string, code: string, description: string, qty: number, kg: number, basis: string, unit = "nos") => {
    if (!(qty > 0)) return;
    byCode.set(key, { code, description, group: "accessory", w: 0, h: 0, qty, area: 0, weight: Math.round(qty * kg * 10) / 10, custom: false, unit, sub, basis });
  };
  // deck support rows made above get their sub-group + basis
  const tag = (key: string, sub: string, basis: string) => { const r = byCode.get(key); if (r) { r.sub = sub; r.basis = basis; } };
  tag("PH", "Deck support", `net soffit ${deckArea.toFixed(1)} m² ÷ prop grid ${lineSp.toFixed(2)} × ${alongSp.toFixed(2)} m`);
  tag("MB", "Deck support", "one mid beam per prop head");
  tag("BPH", "Deck support", "beam bottoms: length ÷ 1.2 m + 1 per beam");

  // 1 · joints: pins & wedges on every panel edge (≤ 300 mm c/c, each joint shared by two panels) + 5% spares
  let edge = 0;
  for (const r of byCode.values()) if (r.group !== "accessory" && r.w > 0 && r.h > 0) edge += 2 * (r.w + r.h) * r.qty;
  const loss = 1 + (R ? R.lossPct : 5) / 100;
  const pins = Math.ceil((edge / 600) * loss);
  const pn = accW(/^PIN/, 0.07), wd = accW(/^WEDGE/, 0.05);
  acc("PIN", "Joints", pn.code ?? "PIN", "Round pin (panel to panel)", pins, pn.kg, `panel edges ${(edge / 1000).toFixed(0)} m ÷ 0.6 m (pin @ 300, shared edge) + ${Math.round((loss - 1) * 100)}% loss`);
  acc("WEDGE", "Joints", wd.code ?? "WEDGE", "Wedge pin", pins, wd.kg, "one per round pin");
  const scRow = byCode.get("SC"), kpRow = byCode.get("KP");
  const longPins = 4 * ((scRow?.qty ?? 0) + (kpRow?.qty ?? 0)) + 4 * beamLayouts.reduce((a, bl) => a + bl.pieces.length * bl.sides, 0);
  acc("LPIN", "Joints", accW(/^LPIN|^LONG/, 0.12).code ?? "LPIN", "Long pin (soffit corner / kicker / beam side to deck)", longPins, accW(/^LPIN|^LONG/, 0.12).kg, "4 per soffit-corner, kicker and beam-side piece");

  // 2 · wall ties through both faces at the engineering spacing (Settings → Engineering), ≤ 800 mm practice
  const tH = R && R.system !== "acoform" ? R.tieH : o.tieH && o.tieH > 0 ? o.tieH : 800, tV = R && R.system !== "acoform" ? R.tieV : o.tieV && o.tieV > 0 ? o.tieV : 800;
  // ties sit at the panel joints (one per tH along the face; the corners are held by corner pins, so no extra tie at
  // the ends) in rows tV apart; the top of the panel is held by the soffit corner / deck, so a part row at the top is
  // not tied (rows = height ÷ tV rounded down). One tie serves the two faces of a wall → the face count halved.
  // Checked against the Guangzhou Motian package: 2,688 vs their 2,660 flat ties (+1 %).
  const rowsOf = (h: number) => Math.max(1, Math.floor(h / tV));
  let ties = 0;
  for (const f of layouts) ties += Math.max(1, Math.ceil(f.length / tH)) * rowsOf(f.height);
  ties = Math.ceil(ties / 2);
  // beams formed on both sides are tied through the beam too
  let beamTies = 0;
  for (const bl of beamLayouts) if (bl.sides === 2 && bl.side > 0) beamTies += Math.max(1, Math.ceil(bl.length / tH)) * Math.max(1, Math.ceil(bl.side / tV));
  let colTies = 0;
  for (const c of colLayouts) if (!c.round) for (const X of [c.w, c.d]) if (X > 600) colTies += (Math.ceil(X / tH) - 0) * Math.max(1, Math.ceil(c.h / tV)) * c.qty;
  const allTies = ties + beamTies + colTies;
  const ft = accW(/^FTIE|^TR/, 0.15);
  if (R?.tie === "flat") {
    acc("TIE", "Ties", "FLAT-TIE", `Flat tie, one-use (@ ${tH} h × ${tV} v mm)`, Math.ceil(allTies * loss), 0.12, `walls: joints (face ÷ ${tH}) × rows ÷ 2 (one tie holds both faces) = ${ties}${beamTies ? ` · beams ${beamTies}` : ""}${colTies ? ` · columns wider than 600: ${colTies}` : ""} + ${Math.round((loss - 1) * 100)}% loss · consumable, order by wall thickness`);
    acc("FTW", "Ties", "FT-WEDGE", "Flat-tie wedge pin", 2 * allTies, 0.05, "two per flat tie (re-used)");
  } else {
    acc("TIE", "Ties", ft.code ?? "TIE", `Tie rod (@ ${tH} h × ${tV} v mm)`, allTies, ft.kg, `walls: joints (face ÷ ${tH}) × rows ÷ 2 (one tie holds both faces) = ${ties}${beamTies ? ` · beams ${beamTies}` : ""}${colTies ? ` · columns wider than 600: ${colTies}` : ""}`);
    acc("SLEEVE", "Ties", accW(/^SLV|^PVC/, 0.02).code ?? "PVC-SL", "PVC sleeve for tie (lost each pour)", Math.ceil(allTies * loss), accW(/^SLV|^PVC/, 0.02).kg, `one per tie + ${Math.round((loss - 1) * 100)}% loss · consumable`);
    acc("CONE", "Ties", accW(/^CONE/, 0.03).code ?? "CONE", "Tie cone", 2 * allTies, accW(/^CONE/, 0.03).kg, "two per tie");
    acc("WNUT", "Ties", accW(/^WN|^NUT/, 0.35).code ?? "WNUT", "Wing nut with plate washer", 2 * allTies, accW(/^WN|^NUT/, 0.35).kg, "two per tie rod");
  }
  if (tH > 800) warnings.push(`Tie spacing ${tH} mm is wider than the usual 800 mm.`);

  // 3 · wall alignment: walers on one face (2 rows), waler clips, push-pull props
  const oneFace = faceLen / 2;
  const walers = oneFace > 0 ? Math.ceil(oneFace / 2400) * 2 : 0;
  acc("WALER", "Wall alignment", accW(/^WAL/, 9).code ?? "WALER-2400", "Alignment waler 2.4 m (rectangular hollow section)", walers, accW(/^WAL/, 9).kg, `one wall face ${(oneFace / 1000).toFixed(0)} m ÷ 2.4 m × 2 rows`);
  acc("WCLIP", "Wall alignment", accW(/^WCL|^CLIP/, 0.6).code ?? "WCLIP", "Waler clip / waler pin", walers * 4, accW(/^WCL|^CLIP/, 0.6).kg, "4 per waler (@ 600 mm)");
  const pp = oneFace > 0 ? Math.ceil(oneFace / 3000) : 0;
  acc("PPP", "Wall alignment", accW(/^PPP|^PUSH/, 12).code ?? "PPP", "Push-pull prop (wall plumbing)", pp, accW(/^PPP|^PUSH/, 12).kg, "one wall face ÷ 3.0 m");
  acc("ANCH", "Wall alignment", "ANCH", "Anchor bolt / base plate for push-pull prop", pp, 0.4, "one per push-pull prop");

  // 4 · kicker, columns, beams, stairs
  acc("KBR", "Kicker & edges", accW(/^KBR|^KB/, 1.2).code ?? "KBR", "Kicker bracket", kpRow?.qty ?? 0, accW(/^KBR|^KB/, 1.2).kg, "one per external kicker piece");
  const clamps = colLayouts.reduce((a, c) => a + c.clamps * c.qty, 0);
  acc("CCL", "Columns & beams", accW(/^CCL|^YOKE/, 6).code ?? "CCL", "Column clamp / yoke set", clamps, accW(/^CCL|^YOKE/, 6).kg, "every 600 mm of column height, per column");
  const beamClamps = beamLayouts.reduce((a, bl) => a + (Math.ceil(bl.length / 1200) + 1), 0);
  acc("BCL", "Columns & beams", accW(/^BCL/, 2.5).code ?? "BCL", "Beam side clamp / tie", beamClamps, accW(/^BCL/, 2.5).kg, "every 1.2 m along each beam + 1");
  acc("SPROP", "Staircase", "PROP-ST", "Stair soffit prop with swivel head", stairProps, 14, "per flight: (slope ÷ 1.2 + 1) × (width ÷ 1.2 + 1) + landing");
  acc("RBR", "Staircase", "RBR", "Riser bracket / step clamp", riserBrackets, 0.8, "two per step");
  if (stepPins) acc("SPIN", "Staircase", "PIN-ST", "Pins & wedges on step panels (@ 200)", Math.ceil(stepPins * loss), 0.12, "step panel edges ÷ 200 mm");

  if (dropTube > 0) acc("FT-DROP", "Kicker & edges", "FT-50x50", "Square tube for drop forms (hung across the sunk slab)", Math.ceil(dropTube * 1.1 * 10) / 10, 2.1, `sunk slab edges ${dropTube.toFixed(1)} m + 10 %`, "m");

  // 5 · safety & site
  if (outer > 0) {
    const br = Math.ceil(outer / 1.5);
    acc("PLAT", "Safety", accW(/^PLAT|^BRK/, 11).code ?? "PLAT-BRK", "External working platform bracket", br, accW(/^PLAT|^BRK/, 11).kg, `outer slab edge ${outer.toFixed(1)} m ÷ 1.5 m`);
    acc("PLANK", "Safety", "PLANK", "Platform plank / walkway (per bay)", br, 18, "one per bracket bay");
    acc("GRAIL", "Safety", "GRAIL", "Guard rail post", br, 4, "one per bracket");
  }
  const totalPanelArea = [...byCode.values()].filter((r) => r.group !== "accessory").reduce((a2, r) => a2 + r.area, 0);
  acc("TOOLS", "Tools & consumables", "TOOLKIT", "Stripping tool kit (pin puller, stripping bar, hammer)", Math.max(1, Math.ceil(totalPanelArea / 150)), 6, "one kit per 150 m² of panels", "kits");
  acc("RELEASE", "Tools & consumables", "RA", "Release agent (per pour)", Math.ceil(totalPanelArea / 15), 0.9, "panel area ÷ 15 m² per litre", "litres");

  // deck support / props carry their sub-group; stair & beam props join the prop count
  const prop = byCode.get("PROP");
  if (prop) { prop.sub = "Deck support"; prop.basis = `one per prop head${beamProps ? ` + ${beamProps} under beams` : ""}`; }
  tag("PROP", "Deck support", prop?.basis ?? "");
  // early stripping: panels move up after one floor, props and support heads stay for the floors below
  if (R && R.supportSets > 1) {
    const extra = R.supportSets - 1;
    for (const k of ["PH", "BPH", "PROP"]) {
      const r = byCode.get(k); if (!r) continue;
      acc(`${k}-SETS`, "Deck support", r.code, `${r.description} — ${extra === 1 ? "2nd set" : `sets 2–${R.supportSets}`} (stay up under the floors below)`, r.qty * extra, r.qty ? r.weight / r.qty : 0, `${r.qty} × ${extra} more set${extra > 1 ? "s" : ""} (props kept for ${R.supportSets} floors)`);
    }
  }

  if (ends) warnings.push(`${ends} short faces (≤ ${endMax} mm) treated as wall ends (stop-ends).`);
  const order: BomRow["group"][] = ["wall", "wall-top", "filler", "end", "corner", "column", "beam", "upstand", "deck", "stair", "drop", "accessory"];
  const SUBS = ["Deck support", "Joints", "Ties", "Wall alignment", "Kicker & edges", "Columns & beams", "Staircase", "Safety", "Tools & consumables"];
  // weights of made-to-size pieces (and items without a catalogue weight) from the ACOFORM standard sections in Al 6061
  for (const r of byCode.values()) {
    if (r.group === "accessory" || !(r.w > 0 && r.h > 0) || !(r.custom || !(r.weight > 0))) continue;
    r.weight = fabSpec(r.code, r.description, r.w, r.h, 1).kgEach * r.qty;
  }
  // column sets bought for this project: a share of all column faces (the sets are re-used column after column)
  if (R && R.columnSetPct < 100) {
    for (const [k, row] of byCode) if (row.group === "column" && row.qty > 0) {
      const n = Math.max(1, Math.ceil((row.qty * R.columnSetPct) / 100));
      byCode.set(k, { ...row, qty: n, area: (row.area / row.qty) * n, weight: (row.weight / row.qty) * n, description: `${row.description} — ${R.columnSetPct} % of all columns (sets re-used)` });
    }
  }
  // site spares learned from site reports: N extra pieces per panel family (the most-used sizes)
  for (const [grp, pct] of Object.entries(R?.sparePct ?? {})) {
    if (!(pct > 0)) continue;
    const rows = [...byCode.values()].filter((x) => x.group === grp && x.qty > 0 && x.w > 0 && !x.code.startsWith("SPARE"));
    const pcs = rows.reduce((s, x) => s + x.qty, 0); if (!pcs) continue;
    const top = rows.sort((a, b) => b.qty - a.qty)[0];
    const n = Math.ceil((pcs * pct) / 100);
    byCode.set(`SPARE-${grp}`, { code: `SPARE-${top.code}`, description: `Site spare ${pct} % of ${pcs} pcs (learned from site reports) — ${top.description}`, group: top.group, w: top.w, h: top.h, qty: n, area: (n * top.w * top.h) / 1e6, weight: top.qty ? (top.weight / top.qty) * n : 0, custom: top.custom, sub: top.sub });
  }
  const bom = [...byCode.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || SUBS.indexOf(a.sub ?? "") - SUBS.indexOf(b.sub ?? "") || b.w - a.w || a.code.localeCompare(b.code))
    .map((r) => ({ ...r, area: Math.round(r.area * 100) / 100, weight: Math.round(r.weight * 10) / 10 }));
  const panelArea = bom.reduce((s, r) => s + r.area, 0);
  const stdArea = bom.filter((r) => !r.custom).reduce((s, r) => s + r.area, 0);
  const weight = bom.filter((r) => r.group !== "accessory").reduce((s, r) => s + r.weight, 0);
  const accessoryWeight = bom.filter((r) => r.group === "accessory").reduce((s, r) => s + r.weight, 0);
  return {
    bom, faces: layouts, elements, columns: colLayouts, beams: beamLayouts, stairs: stairLayouts,
    summary: {
      specials: (() => { const c = bom.filter((r) => r.custom && r.group !== "accessory"); return { types: c.length, pcs: c.reduce((s, r) => s + r.qty, 0), area: Math.round(c.reduce((s, r) => s + r.area, 0) * 100) / 100 }; })(),
      panelArea: Math.round(panelArea * 100) / 100, weight: Math.round(weight), accessoryWeight: Math.round(accessoryWeight), standardPct: panelArea ? Math.round((stdArea / panelArea) * 1000) / 10 : 0,
      faceCount: layouts.length, faceLength: Math.round(faceLen) / 1000, deckFillArea: Math.round(fillArea * 100) / 100, props,
      kgPerM2: panelArea ? Math.round((weight / panelArea) * 10) / 10 : 0, warnings,
    },
  };
}
