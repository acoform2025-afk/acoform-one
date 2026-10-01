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
export type ColumnRun = { code: string; w: number; d: number; h: number; qty: number; round: boolean; perimeter: number };   // mm
export type ElementRow = { kind: "column" | "beam" | "deck"; code: string; size: string; qty: number; area: number; detail: string };
export type PanelOptions = { stairSets?: { code: string; label: string; area: number }[]; tieH?: number; tieV?: number; columns?: ColumnRun[]; stdHeight: number; kgPerM2: number; propSpacing: number; deckLen: number; soffitArea: number; slabMm: number; endMax?: number; tolerance?: number; openings?: OpeningCut[] };

export type BomRow = { code: string; description: string; group: "wall" | "wall-top" | "column" | "end" | "corner" | "deck" | "beam" | "filler" | "accessory"; w: number; h: number; qty: number; area: number; weight: number; custom: boolean; unit?: string };
export type FaceLayout = { code: string; length: number; height: number; panels: number[]; filler: number; top: number; geo?: FaceGeo };
export type PanelResult = {
  bom: BomRow[]; faces: FaceLayout[]; elements: ElementRow[];
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
  // deck panels: the most common length (1200) is the strip length; other lengths are for specials
  const deckAll = cat("deck_panel");
  const lenCount = new Map<number, number>(); deckAll.forEach((p) => lenCount.set(p.height_mm, (lenCount.get(p.height_mm) ?? 0) + 1));
  const deckLen = [...lenCount.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0] - 1200) - Math.abs(b[0] - 1200))[0]?.[0] || o.deckLen;
  const deckCat = deckAll.filter((p) => p.height_mm === deckLen); const deckW = deckCat.map((p) => p.width_mm);
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

  // ---- columns: panels on each of the 4 faces + 4 external corners; round columns as a custom form set
  const elements: ElementRow[] = [];
  const ecCat = cat("external_corner")[0];
  for (const c of o.columns ?? []) {
    const q = Math.max(0, Math.round(c.qty)); if (!q) continue;
    const H = Math.round(c.h);
    const area = ((c.perimeter * c.h) / 1e6) * q;
    if (c.round) {
      const dia = r5(Math.max(c.w, c.d));
      add(`col:RCF-${dia}-${H}`, { code: `RCF-${dia}-${H}`, description: `Round column form Ø${dia} × ${H} (set)`, group: "column", w: Math.round(c.perimeter), h: H, custom: true }, q);
      elements.push({ kind: "column", code: c.code, size: `Ø${dia}`, qty: q, area, detail: `round form set Ø${dia} × ${H}` });
      continue;
    }
    const top = Math.max(0, H - o.stdHeight);
    const parts: string[] = [];
    for (const [X, n] of [[Math.round(c.w), 2], [Math.round(c.d), 2]] as [number, number][]) {
      const fit = wallW.length ? fillRun(X, wallW) : { panels: [], left: X };
      const left = fit.left < tol ? 0 : r5(fit.left);
      for (const w of fit.panels) {
        const p = wallCat.find((x) => x.width_mm === w)!;
        add(`col:${p.panel_code}`, { code: p.panel_code, description: "Column panel", group: "column", w, h: o.stdHeight, custom: false }, n * q, Number(p.weight_kg));
        if (top > 0) add(`col:WT-${w}-${top}`, { code: `WT-${w}-${top}`, description: "Column top panel (custom height)", group: "column", w, h: top, custom: true }, n * q);
      }
      if (left > 0) add(`col:CF-${left}-${H}`, { code: `CF-${left}-${H}`, description: "Column filler (custom width)", group: "column", w: left, h: H, custom: true }, n * q);
      parts.push(`${X}: ${[...fit.panels.map(String), ...(left ? [`F${left}`] : [])].join("+") || "—"}`);
    }
    add("col:EC", { code: ecCat?.panel_code ?? "EC", description: "Column external corner", group: "column", w: ecCat?.width_mm ?? 65, h: H, custom: !ecCat }, 4 * q, ecCat ? Number(ecCat.weight_kg) : undefined);
    elements.push({ kind: "column", code: c.code, size: `${Math.round(c.w)}×${Math.round(c.d)}`, qty: q, area, detail: `${parts.join(" · ")} · 4 corners${top ? ` · top ${top}` : ""}` });
  }

  // ---- corners
  const ic = widest("internal_corner"), ec = widest("external_corner");
  if (corners > 0) {
    const c = ic ?? ec;
    add("CORNER", { code: c ? `${ic?.panel_code ?? ""}${ic && ec ? " / " : ""}${ec?.panel_code ?? ""}` : "IC/EC", description: "Corner piece 65 mm (IC/EC — confirm type)", group: "corner", w: c?.width_mm ?? 65, h: o.stdHeight, custom: false }, corners, c ? Number(c.weight_kg) : undefined);
  }

  // ---- deck: strips across each slab, scaled to the net soffit area
  let fillArea = 0; const deckCount = new Map<number, number>(); let deckFiller = 0;
  const L = deckLen / 1000;
  const deckRows: { code: string; size: string; area: number; n: number; special: number }[] = [];
  for (const d of decks) {
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
  const scale = fillArea > 0 && o.soffitArea > 0 ? Math.min(1, o.soffitArea / fillArea) : 1;
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
  const ph = item("prop_head"), mb = item("deck_beam");
  const lineSp = (deckLen + (ph?.width_mm ?? 100)) / 1000;                              // e.g. 1200 + 100 = 1.30 m
  const alongSp = Math.min(o.propSpacing, mb ? (mb.height_mm + (ph?.width_mm ?? 100)) / 1000 : o.propSpacing);  // e.g. 1150 + 100 = 1.25 m
  if (lineSp > 1.3 + 1e-6 || alongSp > 1.3 + 1e-6) warnings.push(`Prop grid ${lineSp.toFixed(2)} × ${alongSp.toFixed(2)} m is wider than 1.3 m (JGJ 386 practice) — check deflection.`);
  const props = deckArea > 0 ? Math.ceil(deckArea / (lineSp * alongSp)) : 0;
  if (props) {
    byCode.set("PH", { code: ph?.panel_code ?? "PH", description: `Prop head (grid ${lineSp.toFixed(2)} × ${alongSp.toFixed(2)} m)`, group: "accessory", w: 0, h: 0, qty: props, area: 0, weight: props * (ph ? Number(ph.weight_kg) : 4.5), custom: false, unit: "nos" });
    byCode.set("MB", { code: mb?.panel_code ?? "MB", description: "Mid beam (deck support between prop heads)", group: "accessory", w: 0, h: 0, qty: props, area: 0, weight: props * (mb ? Number(mb.weight_kg) : 8), custom: false, unit: "nos" });
    const pr = item("accessory", /^PROP/);
    byCode.set("PROP", { code: pr?.panel_code ?? "PROP", description: "Adjustable steel prop", group: "accessory", w: 0, h: 0, qty: props, area: 0, weight: props * (pr ? Number(pr.weight_kg) : 14), custom: false, unit: "nos" });
  }
  const faceLen = layouts.reduce((s, f) => s + f.length, 0);
  if (faceLen && deckArea > 0) {
    const scp = item("soffit_corner");
    const L = scp?.height_mm ?? 1200;
    const sc = Math.ceil(faceLen / L);
    add("SC", { code: scp?.panel_code ?? `SC-100-${L}`, description: "Soffit corner (top of wall faces)", group: "corner", w: scp?.width_mm ?? 100, h: L, custom: !scp }, sc, scp ? Number(scp.weight_kg) : undefined);
  }
  // external kicker along the outer slab edge (next lift's wall panels sit on it)
  const kp = item("kicker");
  let outer = 0;
  for (const d of decks) for (let i = 0, j = d.pts.length - 1; i < d.pts.length; j = i++) outer += Math.hypot(d.pts[i][0] - d.pts[j][0], d.pts[i][1] - d.pts[j][1]);
  if (outer > 0) {
    const L = kp?.height_mm ?? 1200;
    add("KP", { code: kp?.panel_code ?? `KP-100-${L}`, description: `External kicker along slab edge (${outer.toFixed(1)} m)`, group: "corner", w: kp?.width_mm ?? 100, h: L, custom: !kp }, Math.ceil((outer * 1000) / L), kp ? Number(kp.weight_kg) : undefined);
  }

  // ---- beams: length made up of 1200/900/600/300 panels (+ filler); 2 sides and a bottom for drawn beams; beam props
  const BEAM_LEN = [1200, 900, 600, 300];
  let beamProps = 0;
  const beamAgg = new Map<string, { code: string; size: string; n: number; len: number; area: number; pieces: Map<number, number>; sides: number; bottom: boolean; props: number }>();
  for (const b of beams) {
    const side = Math.max(0, Math.round(b.d - o.slabMm)), bw = Math.round(b.b);
    const fit = fillRun(b.length, BEAM_LEN);
    const left = fit.left < tol ? 0 : Math.ceil(fit.left / 50) * 50;      // beam fillers in 50 mm steps
    const pieces = [...fit.panels, ...(left ? [left] : [])];
    for (const Lp of pieces) {
      const cust = !BEAM_LEN.includes(Lp);
      if (side > 0) add(`BS-${side}-${Lp}`, { code: `BS-${side}-${Lp}`, description: `Beam side panel ${side} × ${Lp}${cust ? " (filler)" : ""}`, group: "beam", w: side, h: Lp, custom: true }, b.sides);
      if (b.bottom && bw > 0) add(`BB-${bw}-${Lp}`, { code: `BB-${bw}-${Lp}`, description: `Beam bottom panel ${bw} × ${Lp}${cust ? " (filler)" : ""}`, group: "beam", w: bw, h: Lp, custom: true }, 1);
    }
    const props = b.bottom && bw > 0 ? Math.ceil(b.length / 1200) + 1 : 0;
    beamProps += props;
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

  // staircases: made as a project-specific set (area as measured / company allowance)
  for (const st of o.stairSets ?? []) {
    byCode.set(`ST:${st.code}`, { code: st.code, description: `${st.label} — staircase formwork set (custom)`, group: "filler", w: 0, h: 0, qty: 1, area: st.area, weight: st.area * o.kgPerM2, custom: true, unit: "set" });
  }

  // pins & wedges on every panel edge (≤ 300 mm c/c, each joint shared by two panels) + 5% spares
  let edge = 0;
  for (const r of byCode.values()) if (r.group !== "accessory" && r.w > 0 && r.h > 0) edge += 2 * (r.w + r.h) * r.qty;
  const pins = Math.ceil((edge / 600) * 1.05);
  if (pins) {
    const pn = item("accessory", /^PIN/), wd = item("accessory", /^WEDGE/);
    byCode.set("PIN", { code: pn?.panel_code ?? "PIN", description: "Round pins (panel joints @ 300 mm)", group: "accessory", w: 0, h: 0, qty: pins, area: 0, weight: pins * (pn ? Number(pn.weight_kg) : 0.07), custom: false, unit: "nos" });
    byCode.set("WEDGE", { code: wd?.panel_code ?? "WEDGE", description: "Wedges", group: "accessory", w: 0, h: 0, qty: pins, area: 0, weight: pins * (wd ? Number(wd.weight_kg) : 0.05), custom: false, unit: "nos" });
  }
  // wall ties through both faces at the engineering spacing (Settings → Engineering), ≤ 800 mm practice
  const tH = o.tieH && o.tieH > 0 ? o.tieH : 800, tV = o.tieV && o.tieV > 0 ? o.tieV : 800;
  let ties = 0;
  for (const f of layouts) ties += (Math.ceil(f.length / tH) + 1) * Math.max(1, Math.ceil(f.height / tV));
  ties = Math.ceil(ties / 2);                                    // one tie serves the two faces of a wall
  if (ties) {
    const ft = item("accessory", /^FTIE|^TR/);
    byCode.set("TIE", { code: ft?.panel_code ?? "TIE", description: `Wall ties (@ ${tH} h × ${tV} v mm)`, group: "accessory", w: 0, h: 0, qty: ties, area: 0, weight: ties * (ft ? Number(ft.weight_kg) : 0.15), custom: false, unit: "nos" });
  }
  if (tH > 800) warnings.push(`Tie spacing ${tH} mm is wider than the usual 800 mm.`);

  if (ends) warnings.push(`${ends} short faces (≤ ${endMax} mm) treated as wall ends (stop-ends).`);
  const order: BomRow["group"][] = ["wall", "wall-top", "filler", "end", "corner", "column", "beam", "deck", "accessory"];
  const bom = [...byCode.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.w - a.w || a.code.localeCompare(b.code))
    .map((r) => ({ ...r, area: Math.round(r.area * 100) / 100, weight: Math.round(r.weight * 10) / 10 }));
  const panelArea = bom.reduce((s, r) => s + r.area, 0);
  const stdArea = bom.filter((r) => !r.custom).reduce((s, r) => s + r.area, 0);
  const weight = bom.filter((r) => r.group !== "accessory").reduce((s, r) => s + r.weight, 0);
  const accessoryWeight = bom.filter((r) => r.group === "accessory").reduce((s, r) => s + r.weight, 0);
  return {
    bom, faces: layouts, elements,
    summary: {
      specials: (() => { const c = bom.filter((r) => r.custom && r.group !== "accessory"); return { types: c.length, pcs: c.reduce((s, r) => s + r.qty, 0), area: Math.round(c.reduce((s, r) => s + r.area, 0) * 100) / 100 }; })(),
      panelArea: Math.round(panelArea * 100) / 100, weight: Math.round(weight), accessoryWeight: Math.round(accessoryWeight), standardPct: panelArea ? Math.round((stdArea / panelArea) * 1000) / 10 : 0,
      faceCount: layouts.length, faceLength: Math.round(faceLen) / 1000, deckFillArea: Math.round(fillArea * 100) / 100, props,
      kgPerM2: panelArea ? Math.round((weight / panelArea) * 10) / 10 : 0, warnings,
    },
  };
}
