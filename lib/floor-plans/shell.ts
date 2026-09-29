/**
 * Shell plan geometry: the concrete elements of one typical floor, ready to draw (PDF) or export (DXF).
 * Everything is in "plan pixels" (the take-off's coordinate system); toMm() turns a point into drawing mm.
 */
import { OPENING_DEFAULTS, shapeMeasure, UNIT_TO_M, type LayerRole, type Pt, type Shape, type Takeoff } from "./calc";
import { dxfFrame, type DxfModel } from "./dxf";

export type ShellLine = { pts: Pt[]; closed: boolean };
export type ShellTag = { at: Pt; text: string; kind: Shape["kind"] | "dxf" };
export type ShellGeometry = {
  box: [number, number, number, number];             // x0, y0, x1, y1 in plan px
  mpp: number;                                        // metres per plan px
  dxf: Partial<Record<LayerRole, ShellLine[]>>;       // DXF layers by role (inside the plan region)
  shapes: (Shape & { code: string })[];
  tags: ShellTag[];
  toMm: (p: Pt) => Pt;                                // plan px → drawing mm (y up)
  schedules: {
    openings: { code: string; kind: "Door" | "Window"; w: number; h: number; sill: number; lintel: number }[];
    beams: { code: string; b: number; d: number; len: number }[];
    slabs: { code: string; t: number; lvl: number; area: number }[];
    lofts: { code: string; t: number; lvl: number; area: number }[];
    walls: { t: number; len: number }[];
  };
};

const PREFIX: Record<Shape["kind"], string> = { slab: "S", opening: "D", wall: "W", column: "C", beam: "B", door: "DR", window: "WN", loft: "L" };

export function buildShell(t: Takeoff, model: DxfModel | null): ShellGeometry {
  const mpp = t.metersPerPx ?? 0;
  const frame = model ? dxfFrame(model, 2400) : null;
  const roles = t.dxf?.layerRoles ?? {};
  const reg = t.dxf?.region ?? null;

  // DXF lines by role, inside the plan region
  const dxf: Partial<Record<LayerRole, ShellLine[]>> = {};
  let segs = 0;
  if (model && frame) {
    for (const p of model.paths) {
      const role = roles[p.layer] ?? "ignore";
      if (role === "ignore") continue;
      const pts = p.pts.map((q) => frame.toPx(q));
      if (reg && !pts.every(([x, y]) => x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3])) continue;
      segs += pts.length;
      if (segs > 60000) break;
      (dxf[role] ??= []).push({ pts, closed: p.closed });
    }
  }

  // drawn elements with their codes (same numbering as the area list)
  const cnt: Record<string, number> = {};
  const shapes = t.shapes.map((s) => {
    const p = PREFIX[s.kind];
    return { ...s, code: s.label?.trim() ? s.label.trim().slice(0, 20) : `${p}${(cnt[p] = (cnt[p] ?? 0) + 1)}` };
  });

  // extent: region, else drawn shapes + DXF lines
  let box: [number, number, number, number];
  if (reg) box = [...reg] as [number, number, number, number];
  else {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = ([x, y]: Pt) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    shapes.forEach((s) => s.pts.forEach(add));
    Object.values(dxf).forEach((ls) => ls?.forEach((l) => l.pts.forEach(add)));
    if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = t.image?.w ?? 1000; y1 = t.image?.h ?? 700; }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.04 + 1;
    box = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }

  const toMm = (p: Pt): Pt => {
    if (frame && model && t.dxf) {
      // back to the client's own drawing coordinates so the DXF overlays their plan
      const [bx0, , , by1] = model.bbox;
      const pad = Math.max(model.bbox[2] - bx0, by1 - model.bbox[1]) * 0.03 || 1;
      const u = UNIT_TO_M[t.dxf.units] * 1000;
      return [(p[0] * frame.unitsPerPx + bx0 - pad) * u, (by1 + pad - p[1] * frame.unitsPerPx) * u];
    }
    return [p[0] * mpp * 1000, -p[1] * mpp * 1000];
  };

  // tags + schedules
  const mm = (v: number) => Math.round(v * 1000);
  const tags: ShellTag[] = [];
  const sch: ShellGeometry["schedules"] = { openings: [], beams: [], slabs: [], lofts: [], walls: [] };
  const wallByT = new Map<number, number>();
  const mid = (pts: Pt[]): Pt => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  for (const s of shapes) {
    const m = mpp ? shapeMeasure(s, mpp) : { area: 0, length: 0, perimeter: 0 };
    if (s.kind === "wall") {
      const th = s.t ?? t.params.wallThkMm ?? 150;
      wallByT.set(th, (wallByT.get(th) ?? 0) + m.length);
      tags.push({ at: mid(s.pts), text: `${s.code} ${th} THK`, kind: "wall" });
    } else if (s.kind === "beam") {
      const b = s.b ?? t.params.beamWidthMm ?? 200, d = s.d ?? t.params.beamDepthMm ?? 600;
      sch.beams.push({ code: s.code, b, d, len: m.length });
      tags.push({ at: mid(s.pts), text: `${s.code} ${b}×${d}`, kind: "beam" });
    } else if (s.kind === "door" || s.kind === "window") {
      const isDoor = s.kind === "door";
      const h = s.h ?? (isDoor ? OPENING_DEFAULTS.doorH : OPENING_DEFAULTS.windowH);
      const sill = isDoor ? 0 : s.sill ?? OPENING_DEFAULTS.windowSill;
      sch.openings.push({ code: s.code, kind: isDoor ? "Door" : "Window", w: mm(m.length), h, sill, lintel: sill + h });
      tags.push({ at: mid(s.pts), text: `${s.code} ${mm(m.length)}×${h}${isDoor ? "" : ` SILL ${sill}`}`, kind: s.kind });
    } else if (s.kind === "slab") {
      const th = s.t ?? t.params.slabMm, lvl = s.lvl ?? 0;
      sch.slabs.push({ code: s.code, t: th, lvl, area: m.area });
      tags.push({ at: mid(s.pts), text: `${s.code} ${th} THK SLAB${lvl ? ` (${lvl > 0 ? "+" : ""}${lvl})` : ""}`, kind: "slab" });
    } else if (s.kind === "loft") {
      const th = s.t ?? OPENING_DEFAULTS.loftT, lvl = s.lvl ?? OPENING_DEFAULTS.loftLvl;
      sch.lofts.push({ code: s.code, t: th, lvl, area: m.area });
      tags.push({ at: mid(s.pts), text: `${s.code} ${th} THK LOFT @ +${lvl}`, kind: "loft" });
    } else if (s.kind === "opening") {
      tags.push({ at: mid(s.pts), text: `${s.code} DUCT`, kind: "opening" });
    } else if (s.kind === "column") {
      const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
      tags.push({ at: mid(s.pts), text: `${s.code} ${mm((Math.max(...xs) - Math.min(...xs)) * mpp)}×${mm((Math.max(...ys) - Math.min(...ys)) * mpp)}`, kind: "column" });
    }
  }
  sch.walls = [...wallByT.entries()].map(([th, len]) => ({ t: th, len })).sort((a, b) => a.t - b.t);
  return { box, mpp, dxf, shapes, tags, toMm, schedules: sch };
}

/** Wall centre line → the outline of the wall strip (thickness in plan px). */
export function stripOutline(pts: Pt[], halfPx: number): Pt[][] {
  const out: Pt[][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (!L) continue;
    const nx = (-dy / L) * halfPx, ny = (dx / L) * halfPx;
    out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
  }
  return out;
}

/** Minimal AutoCAD R12 DXF (LINE + TEXT on named layers, mm) — opens in any AutoCAD / BricsCAD / LibreCAD. */
export function shellToDxf(g: ShellGeometry): string {
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const line = (layer: string, a: Pt, b: Pt) => {
    const [x1, y1] = g.toMm(a), [x2, y2] = g.toMm(b);
    out.push("0", "LINE", "8", layer, "10", x1.toFixed(1), "20", y1.toFixed(1), "30", "0", "11", x2.toFixed(1), "21", y2.toFixed(1), "31", "0");
  };
  const poly = (layer: string, pts: Pt[], closed: boolean) => {
    for (let i = 1; i < pts.length; i++) line(layer, pts[i - 1], pts[i]);
    if (closed && pts.length > 2) line(layer, pts[pts.length - 1], pts[0]);
  };
  const text = (layer: string, at: Pt, s: string, hMm: number) => {
    const [x, y] = g.toMm(at);
    out.push("0", "TEXT", "8", layer, "10", x.toFixed(1), "20", y.toFixed(1), "30", "0", "40", hMm.toFixed(0), "1", s.replace(/[\r\n]/g, " "), "72", "1", "11", x.toFixed(1), "21", y.toFixed(1), "31", "0");
  };
  const LAYER: Record<string, string> = { walls: "SHELL-WALL", slab: "SHELL-SLAB", opening: "SHELL-DUCT", columns: "SHELL-COLUMN", beams: "SHELL-BEAM" };
  for (const [role, ls] of Object.entries(g.dxf)) for (const l of ls ?? []) poly(LAYER[role] ?? "SHELL-OTHER", l.pts, l.closed);
  const pxPerM = g.mpp > 0 ? 1 / g.mpp : 1;
  for (const s of g.shapes) {
    if (s.kind === "wall" || s.kind === "beam") {
      const th = (s.kind === "wall" ? s.t ?? 150 : s.b ?? 200) / 1000;
      for (const q of stripOutline(s.pts, (th / 2) * pxPerM)) poly(s.kind === "wall" ? "SHELL-WALL" : "SHELL-BEAM", q, true);
    } else if (s.kind === "door" || s.kind === "window") poly(s.kind === "door" ? "SHELL-DOOR" : "SHELL-WINDOW", s.pts, false);
    else poly({ slab: "SHELL-SLAB", opening: "SHELL-DUCT", column: "SHELL-COLUMN", loft: "SHELL-LOFT" }[s.kind as "slab"] ?? "SHELL-OTHER", s.pts, true);
  }
  const textH = Math.max(50, Math.min(400, ((g.box[2] - g.box[0]) * (g.mpp || 0.01) * 1000) / 120));
  for (const tg of g.tags) text("SHELL-TEXT", tg.at, tg.text, textH);
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\r\n");
}
