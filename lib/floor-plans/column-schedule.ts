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

/** "13th FLOOR SLAB LVL TO 14th FLOOR SLAB LVL" → from 13th floor to 14th floor; "FOOTING TO PLINTH"; "COLUMN UP TO 3RD FLOOR". */
export function levelRange(label: string): { from?: ColRow["from"]; to?: ColRow["to"] } {
  const s = label.replace(/column (above|up to)/gi, " ").replace(/\s+/g, " ").trim();
  const parts = s.split(/\bto\b/i).map((p) => p.trim()).filter(Boolean);
  const one = (p: string) => { const l = parseLevelName(p); return l.kind === "other" && !l.nos.length ? undefined : { kind: l.kind, no: l.nos[0] }; };
  if (parts.length >= 2) return { from: one(parts[0]), to: one(parts[1]) };
  if (parts.length === 1) return /up to|upto/i.test(label) ? { to: one(parts[0]) } : { from: one(parts[0]) };
  return {};
}

/** Column sizes at one level (by mark) from the schedule: the row whose range holds the level. Floors are numbered;
 *  ground = 0, basements below. */
export function sizesAtLevel(sch: ColumnSchedule, kind: LevelKind, no?: number): Record<string, ColSize> | null {
  const rank = (k: LevelKind, n?: number) => k === "basement" || k === "service" ? -(n ?? 1) : k === "ground" || k === "stilt" || k === "podium" ? 0 : k === "floor" ? (n ?? 0) : k === "terrace" ? 999 : k === "headroom" ? 1000 : NaN;
  const r = rank(kind, no); if (!Number.isFinite(r)) return null;
  for (const row of sch.rows) {
    const a = row.from ? rank(row.from.kind, row.from.no) : -Infinity, b = row.to ? rank(row.to.kind, row.to.no) : Infinity;
    if (!Number.isFinite(a) && !Number.isFinite(b)) continue;
    // the row "A slab lvl to B slab lvl" is the column between slab A and slab B: the columns of floor A
    if (r >= a && r < (Number.isFinite(b) ? b : Infinity)) return row.sizes;
  }
  return null;
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
