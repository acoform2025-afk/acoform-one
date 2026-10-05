/**
 * The whole building, level by level — read from the drawing so a quote / set size / 3D covers every floor, not only
 * the typical one. Three readings, best first:
 *   1. a level table (Chinese drawings: 层号 / 标高 / 层高 columns; also "LEVEL | FFL | HEIGHT" schedules),
 *   2. level marks down a section ("LVL +4500" / "FFL +7.830" with its name "1ST FLOOR" written just above or below),
 *   3. the level names written down the side of a section ("-01 BASEMENT LVL", "00 STILT LVL", "01 FIRST FLOOR LVL" …
 *      "13 TERRACE FLOOR LVL") — their spacing on the section is the floor height,
 *   4. nothing readable: the stated floors × floor height (ground + N floors + terrace).
 * Every level is then matched to its drawing in the file (BASEMENT FLOOR PLAN, STILT FLOOR PLAN, 2ND TO 12TH FLOOR
 * PLAN …). What could not be found becomes a question for the architect / structural engineer.
 */
import type { DxfText, DrawingPart } from "./dxf";
import type { SectionLevels } from "./section-read";
import { meaningOf } from "./vocab";

export type LevelKind = "service" | "basement" | "stilt" | "ground" | "podium" | "floor" | "refuge" | "terrace" | "headroom" | "other";
export type LevelUse = "typical" | "own" | "none";
export type Level = {
  key: string;                 // b2, b1, stilt, g, p1, f1 … f12, refuge7, terrace, hr
  name: string;                // as written on the drawing
  kind: LevelKind;
  no?: number;                 // floor number (kind "floor"); basement number (kind "basement" / "service")
  elevMm?: number;             // finished floor level read from the drawing
  floorMm?: number;            // floor-to-floor height to the level above
  partN?: number; partTitle?: string;   // the drawing of this level in the file
  planId?: string | null;      // measured separately in the app (its own plan)
  use: LevelUse;               // counted with the typical plan / its own plan / not formed with this formwork
  src: "table" | "names" | "section" | "assumed";
};
export type Question = { id: string; to: "architect" | "structure" | "client"; text: string; why: string; done?: boolean };
export type Building = { v: 1; levels: Level[]; questions: Question[]; note: string; edited?: boolean };

export const KIND_LABEL: Record<LevelKind, string> = {
  service: "Service floor", basement: "Basement", stilt: "Stilt / parking", ground: "Ground floor", podium: "Podium", floor: "Floor",
  refuge: "Refuge floor", terrace: "Terrace", headroom: "Head room / LMR", other: "Level",
};
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, eight: 8, ninth: 9, nineth: 9, tenth: 10, eleventh: 11, twelfth: 12, twelth: 12, twelve: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, "twenty first": 21, "twenty second": 22, "twenty third": 23, "twenty fourth": 24, "twenty fifth": 25 };
const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const cnNum = (s: string): number | undefined => {
  if (/^\d+$/.test(s)) return +s;
  if (s.length === 1) return CN_NUM[s];
  const m = s.match(/^(.)?十(.)?$/); if (!m) return undefined;
  return (m[1] ? CN_NUM[m[1]] : 1) * 10 + (m[2] ? CN_NUM[m[2]] : 0);
};

/** What a level name / drawing title says: its kind and floor number(s). "2ND TO 12TH FLOOR PLAN" → floor 2…12. */
export function parseLevelName(raw: string): { kind: LevelKind; nos: number[]; typical: boolean; tower?: string } {
  const t = raw.replace(/\\[A-Za-z]/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  const tw = t.match(/\b(?:tower|block|wing|bldg|building)\s*-?\s*([A-Z0-9]{1,3})\b/i) ?? t.match(/(\d{1,3})\s*号楼/);
  const tower = tw ? tw[1].toUpperCase() : undefined;
  const typical = /typical|标准层|\btyp\b/i.test(t);
  const nos: number[] = [];
  const range = (a: number, b: number) => { if (b >= a && b - a < 150) for (let i = a; i <= b; i++) nos.push(i); };
  let m = low.match(/(\d{1,3})\s*(?:st|nd|rd|th)?\s*(?:floor|flr|fl)?\s*(?:to|-|–|~|&|upto|up to|and)\s*(\d{1,3})\s*(?:st|nd|rd|th)?/);
  if (m) range(+m[1], +m[2]);
  m = t.match(/(\d{1,3})\s*[-~–至]\s*(\d{1,3})\s*层/); if (m && !nos.length) range(+m[1], +m[2]);
  if (!nos.length) {
    for (const w of low.matchAll(/\b(\d{1,3})\s*(?:st|nd|rd|th)\b/g)) nos.push(+w[1]);
    for (const w of low.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|eight|ninth|nineth|tenth|eleventh|twelfth|twelth|twelve|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty (?:first|second|third|fourth|fifth))\b/g)) nos.push(ORD[w[1]]);
    m = t.match(/(?:^|[^\d])(\d{1,3}|[一二三四五六七八九十]{1,3})\s*层(?!高)/); if (m && !nos.length) { const n = cnNum(m[1]); if (n != null) nos.push(n); }
    const lead = t.match(/^(-?\d{1,2})\s+[A-Z]/i); if (lead && !nos.length && +lead[1] > 0) nos.push(+lead[1]);   // "01 FIRST FLOOR LVL" style
    if (!nos.length) { const o = low.match(/\b(\d{1,3})\s*(?:floor|flr|fl)\b/); if (o) nos.push(+o[1]); }
  }
  const uniq = [...new Set(nos.filter((n) => n >= 0 && n < 150))].sort((a, b) => a - b);
  let kind: LevelKind = "other";
  if (/service\s*(floor|lvl|level)|below\s*basement|\bb2\b|plant\s*room\s*lvl/i.test(t)) kind = "service";
  else if (/basement|bsmt|cellar|\bb-?\d\b|地下/i.test(t)) kind = "basement";
  else if (/stilt|pilotis|parking\s*(floor|lvl|level|plan)/i.test(t)) kind = "stilt";
  else if (/head\s*room|stair\s*cabin|mumty|mumtee|\blmr\b|machine\s*room|\boht\b|屋顶构架|roof\s*slab\s*plan|above\s*terrace/i.test(t)) kind = "headroom";
  else if (/terrace|\broof\b|屋面/i.test(t)) kind = "terrace";
  else if (/refuge/i.test(t)) kind = "refuge";
  else if (/podium/i.test(t)) kind = "podium";
  else if (/ground|\bgf\b|\bg\.f\b|plinth|首层|^一层/i.test(t) || (uniq.length === 1 && uniq[0] === 0)) kind = "ground";
  else if (uniq.length || typical || /\bfloor\b|\bflr\b|标准层/i.test(t)) kind = "floor";
  // the drawing dictionary knows other spellings ("MUMTY", "LMR", "LOWER GROUND", "PILOTIS" …)
  if (kind === "other") {
    const m = meaningOf(t);
    const k = m && ({ basement: "basement", stilt: "stilt", ground: "ground", podium: "podium", refuge: "refuge", terrace: "terrace", headroom: "headroom", typical: "floor" } as Record<string, LevelKind>)[m.key];
    if (k) kind = k;
  }
  if (kind === "basement" || kind === "service") {
    const bn = t.match(/\bb-?(\d)\b/i) ?? t.match(/basement\s*-?\s*(\d)\b/i) ?? t.match(/地下\s*(\d|[一二三])\s*层/);
    const n = bn ? cnNum(bn[1]) ?? +bn[1] : t.match(/^-(\d{1,2})\s/) ? +t.match(/^-(\d{1,2})\s/)![1] : kind === "service" ? 2 : 1;
    return { kind, nos: [n], typical: false, tower };
  }
  return { kind, nos: kind === "floor" ? uniq.filter((n) => n > 0) : [], typical, tower };
}

const keyOf = (kind: LevelKind, no?: number) => kind === "floor" ? `f${no}` : kind === "basement" ? `b${no ?? 1}` : kind === "service" ? `s${no ?? 2}` : kind === "refuge" ? `refuge${no ?? ""}` : kind === "podium" ? `p${no ?? ""}` : kind === "ground" ? "g" : kind === "stilt" ? "stilt" : kind === "terrace" ? "terrace" : kind === "headroom" ? "hr" : `o${no ?? ""}`;
/** Sort order from the bottom of the building up. */
export function levelRank(l: Level): number {
  switch (l.kind) {
    case "service": return -100 - (l.no ?? 2);
    case "basement": return -50 - (l.no ?? 1);
    case "stilt": return -2;
    case "ground": return -1;
    case "podium": return 0.5;
    case "floor": case "refuge": return l.no ?? 1;
    case "terrace": return 900;
    case "headroom": return 950;
    default: return l.elevMm != null ? l.elevMm / 1000 : 500;
  }
}

/* ---------- reading 1: level table ---------- */
function levelTable(texts: DxfText[], unitToM: number): Level[] | null {
  // rows = texts on one line (same y within half a text height) holding an elevation like 95.650 / -0.050 / +3.000
  const isElev = (s: string) => /^[+-]?\d{1,3}\.\d{2,3}$/.test(s);
  const isHeight = (s: string) => /^\d\.\d{2,3}$/.test(s) || /^\d{4}$/.test(s);
  const elevs = texts.filter((t) => isElev(t.text.trim()));
  if (elevs.length < 4) return null;
  // the column with most elevations (same x within 2 text heights)
  const cols = new Map<number, DxfText[]>();
  for (const t of elevs) { const k = Math.round(t.x / Math.max(1, t.h * 2)); cols.set(k, [...(cols.get(k) ?? []), t]); }
  // the same table drawn twice (one per building) → each elevation once
  const col0 = [...cols.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const col = col0.filter((t, i) => col0.findIndex((o) => Math.abs(+o.text - +t.text) < 0.001) === i);
  if (col.length < 4) return null;
  const h = col[0].h || 1;
  const rows = col.map((e) => {
    const row = texts.filter((t) => t !== e && Math.abs(t.y - e.y) <= h * 0.6 && Math.abs(t.x - e.x) <= h * 40);
    const right = row.filter((t) => t.x > e.x && isHeight(t.text.trim())).sort((a, b) => a.x - b.x)[0];
    const label = row.filter((t) => !isElev(t.text.trim()) && t !== right).sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
    const ht = right ? (right.text.includes(".") ? Math.round(+right.text * 1000) : +right.text) : undefined;
    return { elevMm: Math.round(+e.text * 1000), ht, label: label?.text.trim() ?? "", y: e.y };
  }).sort((a, b) => a.elevMm - b.elevMm);
  if (rows.length < 4) return null;
  // consistent: elevations rise with the rows and the gaps are storey-like
  const gaps = rows.slice(1).map((r, i) => r.elevMm - rows[i].elevMm);
  if (gaps.filter((g) => g >= 2200 && g <= 7000).length < gaps.length * 0.7) return null;
  const out: Level[] = [];
  rows.forEach((r, i) => {
    const p = parseLevelName(r.label || (/^\d+$/.test(r.label) ? `${r.label} floor` : ""));
    const numeric = /^\d{1,3}$/.test(r.label) ? +r.label : undefined;
    let kind: LevelKind = p.kind, no: number | undefined = numeric ?? p.nos[0];
    if (numeric != null) { kind = numeric === 0 ? "ground" : "floor"; no = numeric; }
    else if (kind === "other" && /屋面|roof/i.test(r.label)) kind = "terrace";
    else if (kind === "other" && r.elevMm < -500) { kind = "basement"; no = 1; }
    const nextElev = rows[i + 1]?.elevMm;
    const floorMm = r.ht && r.ht >= 2000 && r.ht <= 8000 ? r.ht : nextElev != null ? nextElev - r.elevMm : undefined;
    out.push({ key: keyOf(kind, no), name: r.label || KIND_LABEL[kind], kind, no, elevMm: r.elevMm, floorMm, use: "typical", src: "table" });
  });
  return dedupe(out);
}

/* ---------- reading 2: level marks down a section ---------- */
/** "LVL +4500", "LVL 00", "FFL +7.830", "EL. -5000", "+3.000 LVL" → the level in mm (a dot = metres, else mm). */
export function levelMark(raw: string): number | undefined {
  const s = raw.replace(/\\[A-Za-z]/g, "").replace(/\s+/g, " ").trim();
  const m = s.match(/^(?:lvl|level|lev|ffl|sfl|tos|el\.?)\s*:?\s*([+-]?)\s*(\d{1,6}(?:\.\d{1,3})?)\s*(?:mm|m)?$/i) ?? s.match(/^([+-]?)\s*(\d{1,6}(?:\.\d{1,3})?)\s*(?:lvl|level|ffl|sfl)$/i);
  if (!m) return undefined;
  const v = m[2].includes(".") ? Math.round(+m[2] * 1000) : +m[2];
  return m[1] === "-" ? -v : v;
}
function levelMarks(texts: DxfText[], unitToM: number): Level[] | null {
  type M = { t: DxfText; mm: number };
  const marks: M[] = [];
  for (const t of texts) { const mm = levelMark(t.text); if (mm != null && Math.abs(mm) < 400000) marks.push({ t, mm }); }
  if (marks.length < 4) return null;
  const col = new Map<number, M[]>();
  for (const k of marks) { const c = Math.round((k.t.x * unitToM) / 1.5); col.set(c, [...(col.get(c) ?? []), k]); }
  const columns = [...col.values()].map((c) => c.filter((k, i) => c.findIndex((o) => o.mm === k.mm) === i).sort((a, b) => a.mm - b.mm)).filter((c) => c.length >= 4).sort((a, b) => b.length - a.length);
  if (!columns.length) return null;
  // the name of each mark: the nearest other text in the same column, just above or below (within 3 text heights)
  const isMark = (t: DxfText) => levelMark(t.text) != null;
  const read = (c: M[]): Level[] => {
    const out: Level[] = [];
    for (const k of c) {
      const h = k.t.h || 1;
      const name = texts.filter((t) => t !== k.t && !isMark(t) && Math.abs(t.x - k.t.x) <= h * 4 && Math.abs(t.y - k.t.y) <= h * 3 && t.text.trim().length <= 40)
        .sort((a, b) => Math.abs(a.y - k.t.y) + Math.abs(a.x - k.t.x) * 0.5 - (Math.abs(b.y - k.t.y) + Math.abs(b.x - k.t.x) * 0.5))[0];
      const label = name?.text.trim() ?? "";
      if (/road|ngl|existing\s*ground|water|sump|tank|o\.?h\.?w\.?t|parapet|lintel|sill|beam|footing|raft|pcc/i.test(label) && !/floor|basement|stilt|terrace|plinth/i.test(label)) continue;
      const p = parseLevelName(label);
      let kind = p.kind, no = p.nos[0];
      if (kind === "floor" && no == null) kind = "other";
      if (kind === "other") continue;          // a mark without a level name (a beam top, a sill) is not a floor
      out.push({ key: keyOf(kind, no), name: label || KIND_LABEL[kind], kind, no, elevMm: k.mm, use: "typical", src: "names" });
    }
    return out;
  };
  const main = read(columns[0]);
  for (const c of columns.slice(1)) for (const l of read(c)) if (!main.some((m) => m.key === l.key)) main.push(l);
  if (main.length < 3) return null;
  const ls = dedupe(main);
  // the floor height of each level = the next level mark up
  const up = [...ls].filter((l) => l.elevMm != null).sort((a, b) => a.elevMm! - b.elevMm!);
  up.forEach((l, i) => { const n = up[i + 1]; if (n && l.kind !== "terrace" && l.kind !== "headroom") { const d = n.elevMm! - l.elevMm!; if (d >= 1500 && d <= 9000) l.floorMm = d; } });
  return ls;
}

/* ---------- reading 3: level names down a section ---------- */
function levelNames(texts: DxfText[], unitToM: number): Level[] | null {
  type L = { t: DxfText; p: ReturnType<typeof parseLevelName>; lead?: number };
  const ls: L[] = [];
  for (const t of texts) {
    const s = t.text.trim();
    if (s.length > 50 || !/\b(lvl|level|lev|ffl|sfl)\b|层标高/i.test(s)) continue;
    if (/road|plinth|ngl|ground\s*level\s*[+-]|existing|water|sump|tank/i.test(s) && !/floor|basement|stilt|terrace/i.test(s)) continue;
    const lead = s.match(/^(-?\d{1,2})\b/);
    ls.push({ t, p: parseLevelName(s), lead: lead ? +lead[1] : undefined });
  }
  if (ls.length < 3) return null;
  // columns of names (same x within 1.5 m); the same text drawn twice on one spot counts once
  const col = new Map<number, L[]>();
  for (const l of ls) { const k = Math.round((l.t.x * unitToM) / 1.5); col.set(k, [...(col.get(k) ?? []), l]); }
  const columns = [...col.values()].map((c) => c.filter((l, i) => c.findIndex((o) => o.t.text === l.t.text && Math.abs(o.t.y - l.t.y) < Math.max(1, l.t.h)) === i).sort((a, b) => a.t.y - b.t.y)).sort((a, b) => b.length - a.length);
  if (columns[0].length < 3) return null;
  const read = (c: L[]): Level[] => {
    const out: Level[] = [];
    for (let i = 0; i < c.length; i++) {
      const l = c[i];
      let kind = l.p.kind, no = l.p.nos[0];
      if (kind === "other" && l.lead != null) { kind = l.lead < 0 ? "basement" : l.lead === 0 ? "ground" : "floor"; no = Math.abs(l.lead); }
      if (kind === "floor" && no == null && l.lead != null && l.lead > 0) no = l.lead;
      const elev = l.t.text.match(/[+-]\s*(\d{1,3}\.\d{2,3})/);
      const nxt = c[i + 1];
      const floorMm = nxt ? Math.round(((nxt.t.y - l.t.y) * unitToM * 1000) / 5) * 5 : undefined;
      out.push({ key: keyOf(kind, no), name: l.t.text.trim().replace(/\s*(lvl|level)\.?$/i, ""), kind, no, elevMm: elev ? Math.round(+elev[1].replace(/\s/g, "") * 1000 * (elev[0].startsWith("-") ? -1 : 1)) : undefined, floorMm: floorMm && floorMm >= 1500 && floorMm <= 9000 ? floorMm : undefined, use: "typical", src: "names" });
    }
    return out;
  };
  const main = read(columns[0]);
  // a level only shown on another section (e.g. the service floor under the basement on the basement section) joins the stack
  for (const c of columns.slice(1)) for (const l of read(c)) if (l.kind !== "other" && !main.some((m) => m.key === l.key)) main.push(l);
  // a level name only makes a stack when it reads as floors
  return main.filter((l) => l.kind !== "other").length >= 3 ? dedupe(main) : null;
}

function dedupe(ls: Level[]): Level[] {
  const seen = new Map<string, Level>();
  for (const l of ls) if (!seen.has(l.key)) seen.set(l.key, l);
  return [...seen.values()].sort((a, b) => levelRank(a) - levelRank(b));
}

/* ---------- reading 4: assumed from the stated figures ---------- */
function assumedLevels(floors: number, floorMm: number): Level[] {
  const out: Level[] = [{ key: "g", name: "Ground floor", kind: "ground", floorMm, use: "typical", src: "assumed" }];
  for (let i = 1; i <= floors - 1; i++) out.push({ key: `f${i}`, name: `Floor ${i}`, kind: "floor", no: i, floorMm, use: "typical", src: "assumed" });
  out.push({ key: "terrace", name: "Terrace", kind: "terrace", use: "none", src: "assumed" });
  return out;
}

export type BuildingInput = {
  texts: DxfText[]; unitToM: number; parts: DrawingPart[]; section: SectionLevels | null;
  said: { floors?: number; floorMm?: number; slabMm?: number };
  planName?: string;           // "Tarya Block A" → tower A: only block-A drawings (or drawings of no particular tower) match
  typicalPartN?: number;       // the drawing counted as the typical floor (its region)
};

/** The building read from the drawing + its questions. */
export function readBuilding(inp: BuildingInput): Building {
  const said = inp.said;
  const myTower = inp.planName ? parseLevelName(inp.planName).tower : undefined;
  let levels = levelTable(inp.texts, inp.unitToM);
  let note = levels ? "levels from the level table on the drawing" : "";
  if (!levels) { levels = levelMarks(inp.texts, inp.unitToM); if (levels) note = "levels from the level marks on the section"; }
  if (!levels) { levels = levelNames(inp.texts, inp.unitToM); if (levels) note = "levels from the level names on the section"; }
  const Q: Question[] = [];
  const ask = (to: Question["to"], text: string, why: string) => Q.push({ id: `q${Q.length + 1}`, to, text, why });
  // the typical floor height: as stated, else the height most floors have, else the sections
  const mode = (v: number[]) => { const c = new Map<number, number>(); for (const x of v) c.set(x, (c.get(x) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };
  const floorMm = said.floorMm ?? (levels ? mode(levels.filter((l) => l.kind === "floor" && l.floorMm).map((l) => l.floorMm!)) : undefined) ?? inp.section?.floorMm ?? 3000;
  if (!levels) {
    const n = Math.max(1, said.floors ?? inp.section?.floors ?? 1);
    levels = assumedLevels(n, floorMm);
    note = `no level list could be read — assumed ground + ${n - 1} floors + terrace at ${floorMm} mm`;
    ask("architect", "Please share the building section with all floor levels (basement, stilt / ground, typical floors, terrace, head room).", "No level table or section level names were found in the drawing, so the floors and their heights are assumed.");
  }
  // floor heights the drawing does not give: the typical height
  for (const l of levels) if (l.floorMm == null && l.kind !== "terrace" && l.kind !== "headroom") l.floorMm = floorMm;
  // terrace / head room: never formed by default; basement & service floor: usually conventional — asked
  for (const l of levels) {
    if (l.kind === "terrace" || l.kind === "headroom") l.use = "none";
    if (l.kind === "basement" || l.kind === "service") l.use = "none";
  }
  // drawings of this tower (or of no tower) matched to the levels
  // drawings the architect marked for the formwork ("FOR Alu. Formwork") are matched to the levels first
  const parts = [...inp.parts].sort((a, b) => (b.scope === "formwork" ? 1 : 0) - (a.scope === "formwork" ? 1 : 0)).filter((p) => p.kind === "plan" || p.kind === "other").map((p) => ({ p, lv: parseLevelName(`${p.title} ${p.sub ?? ""}`) }))
    .filter((x) => !x.lv.tower || !myTower || x.lv.tower === myTower);
  const typicalParts = parts.filter((x) => x.lv.typical || (x.p.n === inp.typicalPartN));
  const tp = inp.parts.find((p) => p.n === inp.typicalPartN);
  const towerSized = (p: DrawingPart) => !tp || (p.w * p.h >= 0.4 * tp.w * tp.h && p.w * p.h <= 2.5 * tp.w * tp.h);
  // floors of the tower itself must be drawings of this tower (a "SECOND FLOOR" of the clubhouse is not floor 2 of block A)
  const towerKind = (k: LevelKind) => k === "floor" || k === "refuge" || k === "terrace" || k === "headroom";
  for (const l of levels) {
    const own = parts.find((x) => x.lv.kind === l.kind && (l.kind !== "floor" || (x.lv.nos.includes(l.no ?? -1) && towerSized(x.p))) && !((l.kind === "basement" || l.kind === "service") && l.no != null && x.lv.nos.length && !x.lv.nos.includes(l.no)) && (!towerKind(l.kind) || !myTower || x.lv.tower === myTower) && !(x.lv.kind === "floor" && x.lv.typical && x.p.n === inp.typicalPartN));
    const typ = l.kind === "floor" ? typicalParts.find((x) => !x.lv.nos.length || x.lv.nos.includes(l.no ?? -1)) : undefined;
    const hit = own ?? typ;
    if (hit) { l.partN = hit.p.n; l.partTitle = hit.p.title; if (own && own.p.n !== inp.typicalPartN && l.use !== "none") l.use = "own"; }
    if (hit && hit.p.n === inp.typicalPartN && l.use === "own") l.use = "typical";
  }
  // levels of the typical kind with no drawing: the typical plan stands for them
  const floorsNoDrawing = levels.filter((l) => l.kind === "floor" && !l.partN);
  const formed = levels.filter((l) => l.use !== "none");
  const missing = formed.filter((l) => !l.partN && l.kind !== "floor");
  if (missing.length) ask("architect", `No plan drawing was found for: ${missing.map((l) => l.name).join(", ")}. Please share these floor plans (or confirm they are the same as the typical floor).`, "Every formed level needs its own plan to count walls, slab and beams; until then the typical floor is used for them.");
  if (floorsNoDrawing.length && inp.typicalPartN) {
    const rng = `${floorsNoDrawing[0].name}–${floorsNoDrawing[floorsNoDrawing.length - 1].name}`;
    if (tp && !parseLevelName(tp.title).typical) ask("architect", `Is "${tp.title}" the typical floor for ${rng}? Please confirm these floors are identical (no refuge floor, no odd / even variation, no change of wall thickness higher up).`, "Only one floor plan is in the file; it is being used for all these floors.");
  }
  const refuge = levels.filter((l) => l.kind === "refuge");
  if (refuge.length) ask("architect", `Refuge floor(s) ${refuge.map((l) => l.name).join(", ")}: please share the refuge floor plan — the open refuge area changes the wall and slab layout on that floor.`, "A refuge floor is not the same as the typical floor.");
  const bsm = levels.filter((l) => l.kind === "basement" || l.kind === "service" || l.kind === "stilt");
  if (bsm.length) ask("client", `${bsm.map((l) => l.name).join(", ")}: is this to be cast with the aluminium formwork too, or by conventional shuttering? (Retaining walls, ramps and bigger column grids usually go conventional.)`, "Decides whether these levels are in the set and the quoted area.");
  const tall = levels.filter((l) => l.use !== "none" && (l.floorMm ?? 0) > floorMm + 50);
  if (tall.length) ask("client", `${tall.map((l) => `${l.name} (${l.floorMm} mm)`).join(", ")} ${tall.length > 1 ? "are" : "is"} taller than the typical floor (${floorMm} mm): extension panels / a second lift of wall panels will be needed there. Confirm the heights.`, "Taller floors need extra wall formwork height; it is priced separately.");
  if (!inp.section && inp.said.slabMm == null) ask("structure", "Please confirm the slab thickness and beam sizes (no section with slab / beam depths was found in the drawing).", "Slab and beam depths set the deck and beam-side formwork areas.");
  const hr = levels.find((l) => l.kind === "headroom");
  if (hr) ask("client", `${hr.name}: is the lift machine room / head room above the terrace to be formed with the set (one extra pour), or by conventional shuttering?`, "Usually left out of the aluminium set; confirm.");
  const ter = levels.find((l) => l.kind === "terrace");
  if (ter) ask("client", "Terrace: parapet walls, lift / stair head room and water tanks — which of these are cast with the formwork?", "Parapets are counted as upstands on the top floor only when confirmed.");
  const hasGround = levels.some((l) => l.kind === "ground");
  const nFloors = levels.filter((l) => l.kind === "floor" || l.kind === "ground" || l.kind === "refuge" || l.kind === "podium" || (l.kind === "stilt" && !hasGround)).length;
  if (said.floors && nFloors !== said.floors) {
    const n = nFloors;
    ask("architect", `The drawing shows ${n} floors (ground to top floor) but the project note says ${said.floors}. Which is right?`, "The floor count sets the number of pours and the quoted area.");
  }
  return { v: 1, levels, questions: Q, note };
}

/** Consecutive levels that are alike (same kind, use, height, drawing) shown as one row: "Floors 2–12 (11)". */
export type LevelGroup = { keys: string[]; name: string; kind: LevelKind; count: number; floorMm?: number; partN?: number; partTitle?: string; planId?: string | null; use: LevelUse; first: Level; src: Level["src"] };
export function groupLevels(levels: Level[]): LevelGroup[] {
  const sorted = [...levels].sort((a, b) => levelRank(a) - levelRank(b));
  const out: LevelGroup[] = [];
  for (const l of sorted) {
    const g = out[out.length - 1];
    const alike = g && g.kind === "floor" && l.kind === "floor" && g.use === l.use && g.floorMm === l.floorMm && g.partN === l.partN && (g.planId ?? null) === (l.planId ?? null) && (g.first.no ?? 0) + g.count === l.no;
    if (alike) { g.keys.push(l.key); g.count++; g.name = `Floors ${g.first.no}–${l.no}`; continue; }
    out.push({ keys: [l.key], name: l.kind === "floor" ? `Floor ${l.no}` : l.name, kind: l.kind, count: 1, floorMm: l.floorMm, partN: l.partN, partTitle: l.partTitle, planId: l.planId, use: l.use, first: l, src: l.src });
  }
  return out;
}

/** Whole-building figures: contact area of every formed level (typical plan or its own plan) and the set size. */
export function buildingTotals(b: Building, typical: { contact: number; quote: number }, own: Record<string, { contact: number; quote: number }>): { contact: number; quote: number; floors: number; levels: { key: string; contact: number; quote: number; from: "typical" | "own" | "missing" }[]; heightMm: number } {
  const levels = b.levels.filter((l) => l.use !== "none").map((l) => {
    const o = l.use === "own" && l.planId ? own[l.planId] : undefined;
    const from = l.use === "own" ? (o ? "own" : "missing") : "typical";
    const v = o ?? typical;
    return { key: l.key, contact: from === "missing" ? typical.contact : v.contact, quote: from === "missing" ? typical.quote : v.quote, from: from as "typical" | "own" | "missing" };
  });
  const heightMm = b.levels.reduce((s, l) => s + (l.use !== "none" ? (l.floorMm ?? 0) : 0), 0);
  return { contact: levels.reduce((s, l) => s + l.contact, 0), quote: levels.reduce((s, l) => s + l.quote, 0), floors: levels.length, levels, heightMm };
}
