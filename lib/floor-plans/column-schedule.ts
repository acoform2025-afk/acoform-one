/**
 * Column schedule read from the drawing: the structural consultant's table with one column per column mark
 * (C1 … C28 across the top) and one row per level range ("13th FLOOR SLAB LVL TO 14th FLOOR SLAB LVL" down the
 * left), the column size ("300X900") written in each cell. The sizes change on the way up, so the column panels
 * of every floor come from this table, not from the one size drawn on the column location plan.
 */
import type { DxfText } from "./dxf";
import { parseLevelName, type LevelKind } from "./building";
import { minOf, maxOf } from "@/lib/util/minmax";

export type ColSize = { b: number; d: number };
export type ColRow = { label: string; from?: { kind: LevelKind; no?: number }; to?: { kind: LevelKind; no?: number }; sizes: Record<string, ColSize> };
export type ColumnSchedule = { marks: string[]; rows: ColRow[]; title?: string };

const MARK = /^(?:C|CL|COL|KZ|P)[-_ ]?(\d{1,3})([A-Z]?)$/i;
const SIZE = /^(\d{3,4})\s*[xX×*]\s*(\d{3,4})$/;
const LEVEL_WORD = /lvl|level|floor|flr|terrace|plinth|footing|foundation|basement|slab|roof|podium|stilt|ground|parking|top|bottom|\bg\.?f\b|\bfl\b/i;

/** Every column schedule in the drawing (one per block / sheet). */
export function columnSchedules(textsIn: DxfText[], unitToM: number): ColumnSchedule[] {
  const texts = textsIn.map((t) => ({ ...t, text: t.text.replace(/\\[A-Za-z]/g, "").replace(/\s+/g, " ").trim() }));
  const marks = texts.filter((t) => MARK.test(t.text) && t.h > 0);
  if (marks.length < 5) return [];
  // header rows: 5+ column marks on one line
  const byY = new Map<number, typeof marks>();
  for (const t of marks) { const k = Math.round(t.y / Math.max(1, t.h)); byY.set(k, [...(byY.get(k) ?? []), t]); }
  const headersAll = [...byY.values()].filter((r) => r.length >= 5).map((r) => r.sort((a, b) => a.x - b.x)).sort((a, b) => b[0].y - a[0].y);
  // schedules that repeat the marks in every row (each cell "C11 / 300X900"): the same marks at the same x on many
  // lines are the rows of ONE schedule — the topmost line is its header
  const headers: typeof headersAll = [];
  for (const r of headersAll) {
    const same = headers.find((h) => Math.abs(h[0].x - r[0].x) <= h[0].h * 3 && Math.abs(h.length - r.length) <= 4 && Math.abs(h[0].y - r[0].y) <= 80 / unitToM);
    if (!same) headers.push(r);
  }
  const out: ColumnSchedule[] = [];
  const used = new Set<DxfText>();
  for (const hdr of headers) {
    if (hdr.some((t) => used.has(t))) continue;
    // a header row's marks are evenly spaced; the cells below each mark hold its sizes
    const xs = hdr.map((t) => t.x), y0 = hdr[0].y, h = hdr[0].h;
    const pitch = xs.length > 1 ? (maxOf(xs) - minOf(xs)) / (xs.length - 1) : 2 / unitToM;
    const left = minOf(xs) - pitch * 0.6, right = maxOf(xs) + pitch * 0.6;
    // the next header below (another schedule on the same sheet) ends this one
    const nextY = maxOf(headers.filter((o) => o !== hdr && o[0].y < y0 - h && o[0].x < right && o[o.length - 1].x > left).map((o) => o[0].y).concat([-Infinity]));
    const bottom = Number.isFinite(nextY) ? nextY + h : y0 - 60 / unitToM;
    const sizes = texts.filter((t) => SIZE.test(t.text) && t.x >= left && t.x <= right && t.y < y0 && t.y > bottom);
    if (sizes.length < 5) continue;
    // row bands of the sizes (cells of one level range share a line)
    const rowsY = new Map<number, typeof sizes>();
    for (const t of sizes) { const k = Math.round(t.y / Math.max(1, t.h * 2)); rowsY.set(k, [...(rowsY.get(k) ?? []), t]); }
    const bands = [...rowsY.values()].map((r) => ({ y: r.reduce((s, t) => s + t.y, 0) / r.length, cells: r })).sort((a, b) => a.y - b.y);   // bottom row (footing / lowest level) first
    if (!bands.length) continue;
    const rowPitch = bands.length > 1 ? (bands[bands.length - 1].y - bands[0].y) / (bands.length - 1) : h * 6;
    // level labels: texts left of the grid on the band's line
    const labels = texts.filter((t) => t.x < minOf(xs) - pitch * 0.4 && t.x > minOf(xs) - pitch * 12 && t.y < y0 && t.y > bottom && LEVEL_WORD.test(t.text) && t.text.length <= 60);
    const rows: ColRow[] = [];
    for (const b of bands) {
      const lab = labels.filter((t) => Math.abs(t.y - b.y) <= rowPitch * 0.55).sort((a, b2) => a.x - b2.x);
      const label = lab.map((t) => t.text).join(" ").replace(/\s+/g, " ").trim();
      const cells: Record<string, ColSize> = {};
      for (const t of b.cells) {
        // nearest header mark by x
        let best = 0; for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - t.x) < Math.abs(xs[best] - t.x)) best = i;
        if (Math.abs(xs[best] - t.x) > pitch * 0.6) continue;
        const m = t.text.match(SIZE)!; const mark = hdr[best].text.toUpperCase().replace(/[-_ ]/g, "");
        if (!cells[mark]) cells[mark] = { b: Number(m[1]), d: Number(m[2]) };
      }
      if (!Object.keys(cells).length) continue;
      rows.push({ label, ...levelRange(label), sizes: cells });
    }
    if (!rows.length) continue;
    hdr.forEach((t) => used.add(t));
    const title = texts.filter((t) => /schedule/i.test(t.text) && Math.abs(t.y - y0) < rowPitch * 4 && t.x >= left - pitch * 12 && t.x <= right).sort((a, b) => b.h - a.h)[0]?.text;
    out.push({ marks: hdr.map((t) => t.text.toUpperCase().replace(/[-_ ]/g, "")), rows, title });
  }
  return out;
}

/** "13th FLOOR SLAB LVL TO 14th FLOOR SLAB LVL" → from 13th floor to 14th floor; "FOOTING TO PLINTH"; "COLUMN UP TO 3RD FLOOR";
 *  "(GROUND FL. ROOF SLAB) TO (5th FL. ROOF SLAB)" → from the 1st floor to the 6th (the roof slab of a floor is the floor of the next). */
export function levelRange(label: string): { from?: ColRow["from"]; to?: ColRow["to"] } {
  const s = label.replace(/column (above|up to)/gi, " ").replace(/[()]/g, " ").replace(/\bbase\.?(?=\s|$)/gi, "basement ").replace(/\s+/g, " ").trim();
  const parts = s.split(/\bto\b/i).map((p) => p.trim()).filter(Boolean);
  const one = (p: string) => {
    // "nth FL. ROOF SLAB" / "GROUND FL. ROOF SLAB": the slab over that floor = the next floor's level
    const over = /roof\s*slab|ceiling\s*slab/i.test(p) && !/^\s*roof\b|terrace/i.test(p);
    const l = parseLevelName(over ? p.replace(/roof\s*slab|ceiling\s*slab/gi, "slab") : p); if (l.kind === "other" && !l.nos.length) return undefined;
    if (over) { if (l.kind === "basement") return l.nos[0] != null && l.nos[0] > 1 ? { kind: "basement" as LevelKind, no: l.nos[0] - 1 } : { kind: "ground" as LevelKind }; if (l.kind === "ground" || l.kind === "stilt") return { kind: "floor" as LevelKind, no: 1 }; if (l.kind === "floor" && l.nos[0] != null) return { kind: "floor" as LevelKind, no: l.nos[0] + 1 }; }
    return { kind: l.kind, no: l.nos[0] };
  };
  if (parts.length >= 2) return { from: one(parts[0]), to: one(parts[1]) };
  if (parts.length === 1) return /up to|upto/i.test(label) ? { to: one(parts[0]) } : { from: one(parts[0]) };
  return {};
}

/** Column sizes at one level (by mark) from the schedule: the row whose range holds the level. Floors are numbered;
 *  ground = 0, basements below. */
export function sizesAtLevel(sch: ColumnSchedule, kind: LevelKind, no?: number): Record<string, ColSize> | null {
  const rank = (k: LevelKind, n?: number) => k === "basement" || k === "service" ? -(n ?? 1) : k === "ground" || k === "stilt" || k === "podium" ? 0 : k === "floor" ? (n ?? 0) : k === "terrace" ? 999 : k === "headroom" ? 1000 : NaN;
  const r = rank(kind, no); if (!Number.isFinite(r)) return null;
  // every row whose range holds the level gives the sizes of its marks (a dimensioned schedule has one range per
  // column, so the rows hold different marks); the first row naming a mark wins
  let out: Record<string, ColSize> | null = null;
  for (const row of sch.rows) {
    const a = row.from ? rank(row.from.kind, row.from.no) : -Infinity, b = row.to ? rank(row.to.kind, row.to.no) : Infinity;
    if (!Number.isFinite(a) && !Number.isFinite(b)) continue;
    // the row "A slab lvl to B slab lvl" is the column between slab A and slab B: the columns of floor A
    if (r >= a && r < (Number.isFinite(b) ? b : Infinity)) { out = out ?? {}; for (const [k, v] of Object.entries(row.sizes)) if (!out[k]) out[k] = v; }
  }
  // a level the schedule skips (its row not read, or "same as below"): the nearest row below it, up to 3 levels down
  if (!out) {
    const below = sch.rows.filter((row) => row.from && Number.isFinite(rank(row.from.kind, row.from.no)) && rank(row.from.kind, row.from.no) <= r && r - rank(row.from.kind, row.from.no) <= 3)
      .sort((x, y) => rank(y.from!.kind, y.from!.no) - rank(x.from!.kind, x.from!.no))[0];
    if (below) out = { ...below.sizes };
  }
  return out;
}

/** One line for the read-out: "28 columns · sizes change at 2nd, 7th and 13th floor". */
export function scheduleSummary(sch: ColumnSchedule): string {
  const changes: string[] = [];
  const rows = sch.rows.filter((r) => r.from || r.to);     // footing / unlabelled rows under the grid are not levels
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].sizes, b = rows[i].sizes;
    const diff = Object.keys(b).some((k) => a[k] && (a[k].b !== b[k].b || a[k].d !== b[k].d));
    const w = rows[i].from ? levelWord(rows[i].from!) : rows[i].to ? `up to ${levelWord(rows[i].to!)}` : "";
    if (diff && w && !changes.includes(w)) changes.push(w);
  }
  return `${sch.marks.length} columns, ${rows.length} levels${changes.length ? ` · sizes change at ${changes.join(", ")}` : rows.length ? " · one size throughout" : ""}`;
}
const levelWord = (l: { kind: LevelKind; no?: number }) => l.kind === "floor" && l.no != null ? `${l.no}${["th", "st", "nd", "rd"][l.no % 10 > 3 || (l.no % 100 >= 11 && l.no % 100 <= 13) ? 0 : l.no % 10]} floor` : l.kind === "basement" ? `basement ${l.no ?? 1}` : l.kind;

/** Total column perimeter (mm, all marks) at each of the building's levels, by level key — the level's column
 *  panels grow or shrink with it. Levels the schedule does not cover are left out. */
export function perimeterByLevel(sch: ColumnSchedule, levels: { key: string; kind: LevelKind; no?: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of levels) {
    const sz = sizesAtLevel(sch, l.kind, l.no); if (!sz) continue;
    out[l.key] = Object.values(sz).reduce((s, c) => s + 2 * (c.b + c.d), 0);
  }
  return out;
}

/**
 * Column schedules drawn as sections with DIMENSIONS instead of a written size (one strip per column mark, the mark
 * under the strip, each level range a cell headed "(GROUND FL. ROOF SLAB) TO (5th FL. ROOF SLAB)" with the column
 * drawn below it and dimensioned): the column's size is its overall horizontal dimension × overall vertical one.
 */
export function dimColumnSchedules(textsIn: DxfText[], unitToM: number): ColumnSchedule[] {
  const texts = textsIn.map((t) => ({ ...t, text: t.text.replace(/\\[A-Za-z]/g, "").replace(/\s+/g, " ").trim() }));
  const dims = texts.filter((t) => t.kind === "dim" && /^\d{3,4}$/.test(t.text));
  if (dims.length < 6) return [];
  const LV = /(fl\b|fl\.|floor|slab|lvl|level|footing|plinth|foundation|terrace|basement|stilt|ground)/i;
  const tos = texts.filter((t) => /^to$/i.test(t.text));
  // cell titles: "<level>" / "TO" / "<level>" stacked (or on one line)
  type Cell = { x: number; y: number; yLow: number; label: string };
  const cells: Cell[] = [];
  for (const t of tos) {
    const up = texts.filter((o) => LV.test(o.text) && o.text.length <= 50 && Math.abs(o.x - t.x) <= 2 * t.h && o.y > t.y && o.y - t.y <= 4 * t.h).sort((a, b) => a.y - b.y)[0];
    const dn = texts.filter((o) => LV.test(o.text) && o.text.length <= 50 && Math.abs(o.x - t.x) <= 2 * t.h && o.y < t.y && t.y - o.y <= 4 * t.h).sort((a, b) => b.y - a.y)[0];
    if (up && dn) cells.push({ x: t.x, y: up.y, yLow: dn.y, label: `${up.text} TO ${dn.text}` });
  }
  for (const t of texts) if (/\bto\b/i.test(t.text) && LV.test(t.text) && t.text.length <= 70 && /^\(?.{3,}\bto\b.{3,}$/i.test(t.text)) cells.push({ x: t.x, y: t.y, yLow: t.y, label: t.text });
  if (cells.length < 3) return [];
  const marks = texts.filter((t) => MARK.test(t.text));
  // strip pitch: the usual x gap between neighbouring title columns
  const xsU = [...new Set(cells.map((c) => Math.round(c.x / 50) * 50))].sort((a, b) => a - b);
  const gaps = xsU.slice(1).map((x, i) => x - xsU[i]).filter((g) => g > 0.5 / unitToM).sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 4 / unitToM;
  const rows = new Map<string, ColRow>(); const markSet = new Set<string>();
  for (const c of cells) {
    // the cell's drawing: below its title, down to the next title in the same strip
    const below = cells.filter((o) => o !== c && Math.abs(o.x - c.x) < pitch * 0.3 && o.y < c.yLow).sort((a, b) => b.y - a.y)[0];
    const yMin = below ? below.y : c.yLow - pitch;
    const inC = dims.filter((d) => d.x > c.x - pitch * 0.1 && d.x < c.x + pitch * 0.9 && d.y < c.yLow && d.y > yMin);
    const vert = inC.filter((d) => Math.abs(Math.abs(d.r ?? 0) - Math.PI / 2) < 0.2).map((d) => +d.text);
    const hor = inC.filter((d) => Math.abs(d.r ?? 0) < 0.2 || Math.abs(Math.abs(d.r ?? 0) - Math.PI) < 0.2).map((d) => +d.text);
    if (!vert.length || !hor.length) continue;
    const b = Math.max(...hor), d = Math.max(...vert);
    if (b < 150 || d < 150 || b > 4000 || d > 4000) continue;
    // the strip's mark: below the strip (or above it), nearest in x
    const mk = marks.filter((m) => m.x > c.x - pitch * 0.1 && m.x < c.x + pitch * 0.9).sort((a, b2) => Math.abs(a.x - (c.x + pitch * 0.4)) - Math.abs(b2.x - (c.x + pitch * 0.4)))[0];
    if (!mk) continue;
    const mark = mk.text.toUpperCase().replace(/[-_ ]/g, ""); markSet.add(mark);
    const key = c.label.toUpperCase().replace(/\s+/g, " ");
    const row = rows.get(key) ?? { label: c.label, ...levelRange(c.label), sizes: {} };
    if (!row.sizes[mark]) row.sizes[mark] = { b: Math.min(b, d), d: Math.max(b, d) };
    rows.set(key, row);
  }
  const rk = (r: ColRow) => r.from?.kind === "floor" ? r.from.no ?? 0 : r.from?.kind === "ground" ? 0 : r.from?.kind === "basement" ? -(r.from.no ?? 1) : 500;
  const out = [...rows.values()].filter((r) => Object.keys(r.sizes).length).sort((a, b) => rk(a) - rk(b));
  return markSet.size >= 2 && out.length ? [{ marks: [...markSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), rows: out, title: "column schedule (dimensioned sections)" }] : [];
}

/**
 * Column schedules drawn as a GRID of dimensioned sections: a row of marks (C1 C2 … C15) under every level's row of
 * column sections, the level written at the left ("3RD BASEMENT ROOF SLAB LEVEL" — the storey under that slab), the
 * size of each section from its overall horizontal × vertical dimension.
 */
export function dimGridSchedules(textsIn: DxfText[], unitToM: number): ColumnSchedule[] {
  const texts = textsIn.map((t) => ({ ...t, text: t.text.replace(/\\[A-Za-z]/g, "").replace(/\s+/g, " ").trim() }));
  const dims = texts.filter((t) => t.kind === "dim" && /^\d{3,4}$/.test(t.text));
  if (dims.length < 10) return [];
  const marks = texts.filter((t) => MARK.test(t.text) && t.h > 0);
  const byY = new Map<number, typeof marks>();
  for (const t of marks) { const k = Math.round(t.y / Math.max(1, t.h * 2)); byY.set(k, [...(byY.get(k) ?? []), t]); }
  const rowsM = [...byY.values()].filter((r) => r.length >= 5).map((r) => r.sort((a, b) => a.x - b.x));
  if (rowsM.length < 2) return [];
  // stacks of mark rows sharing their x span = one schedule
  const stacks: (typeof rowsM)[] = [];
  for (const r of rowsM.sort((a, b) => a[0].x - b[0].x || a[0].y - b[0].y)) {
    const st = stacks.find((S) => Math.abs(S[0][0].x - r[0].x) < 3 * r[0].h * 10 && Math.abs(S[0][S[0].length - 1].x - r[r.length - 1].x) < 30 * r[0].h);
    if (st) st.push(r); else stacks.push([r]);
  }
  const LV = /(floor|slab|lvl|level|basement|basemnet|footing|foundation|plinth|terrace|stilt|podium)/i;
  const out: ColumnSchedule[] = [];
  for (const S of stacks) {
    if (S.length < 2) continue;
    S.sort((a, b) => a[0].y - b[0].y);                          // bottom row first
    const x0 = minOf(S.flatMap((r) => r.map((t) => t.x))), x1 = maxOf(S.flatMap((r) => r.map((t) => t.x)));
    const pitch = (x1 - x0) / Math.max(1, S[0].length - 1);
    const rows: ColRow[] = []; const markSet = new Set<string>();
    for (let i = 0; i < S.length; i++) {
      const yb = S[i][0].y - S[i][0].h, yt = i + 1 < S.length ? S[i + 1][0].y - S[i + 1][0].h : S[i][0].y + 3 * pitch;
      // the level written left of the row (most often within the band)
      const labs = texts.filter((t) => LV.test(t.text) && t.text.length <= 50 && t.x < x0 - pitch * 0.3 && t.x > x0 - pitch * 6 && t.y >= yb && t.y <= yt);
      const cnt = new Map<string, number>(); for (const t of labs) cnt.set(t.text.toUpperCase(), (cnt.get(t.text.toUpperCase()) ?? 0) + 1);
      const name = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!name) continue;
      // "X ROOF SLAB LEVEL": the storey X (from X to the slab over it)
      const base = name.replace(/basemnet/gi, "basement").replace(/\b(roof\s*)?slab\s*(level|lvl\.?)?/gi, " ").replace(/\s+/g, " ").trim();
      const l = parseLevelName(base);
      if (l.kind === "other" && !l.nos.length) continue;
      if (l.kind === "basement") { const bn = base.match(/(\d)\s*(?:st|nd|rd|th)?\s*basement|basement\s*-?\s*(\d)/i); if (bn) l.nos = [+(bn[1] ?? bn[2])]; }
      const from = { kind: l.kind, no: l.nos[0] };
      const to = l.kind === "basement" ? ((l.nos[0] ?? 1) > 1 ? { kind: "basement" as LevelKind, no: (l.nos[0] ?? 1) - 1 } : { kind: "ground" as LevelKind }) : l.kind === "ground" || l.kind === "stilt" ? { kind: "floor" as LevelKind, no: 1 } : l.kind === "floor" && l.nos[0] != null ? { kind: "floor" as LevelKind, no: l.nos[0] + 1 } : undefined;
      const sizes: Record<string, ColSize> = {};
      for (const mk of S[i]) {
        const inC = dims.filter((d) => Math.abs(d.x - mk.x) <= pitch * 0.5 && d.y > yb && d.y < yt);
        const vert = inC.filter((d) => Math.abs(Math.abs(d.r ?? 0) - Math.PI / 2) < 0.2).map((d) => +d.text);
        const hor = inC.filter((d) => Math.abs(d.r ?? 0) < 0.2 || Math.abs(Math.abs(d.r ?? 0) - Math.PI) < 0.2).map((d) => +d.text);
        if (!vert.length || !hor.length) continue;
        const b = maxOf(hor), d = maxOf(vert); if (b < 150 || d < 150 || b > 4000 || d > 4000) continue;
        const mark = mk.text.toUpperCase().replace(/[-_ ]/g, ""); markSet.add(mark);
        sizes[mark] = { b: Math.min(b, d), d: Math.max(b, d) };
      }
      if (Object.keys(sizes).length) rows.push({ label: name, from, to, sizes });
    }
    if (rows.length >= 3 && markSet.size >= 3) out.push({ marks: [...markSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), rows, title: "column schedule (dimensioned grid)" });
  }
  return out;
}
