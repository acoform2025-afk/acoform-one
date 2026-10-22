/**
 * Columns drawn on layers named by the floors they run through — structural consultants' layer sets such as
 * "S-C1-UP TO BAS", "S-C1-ABOVE BAS TO HP", "S-C3-ABOVE HP TO 14", "S-C4-ABOVE 14 TO 16", "S-C10-ABOVE 21 TO ST",
 * "SC-UP TO TER", "S-C0-THRU". One location plan often serves several floors ("05, 07, 11, 16, 20TH FLOOR",
 * "2ND TO 13TH FLOOR"), so a column that stops at the 14th floor is drawn on the plan of the 16th as well. Mivan
 * rule: a column that ends below a floor gets no column panels on that floor, and one that starts above it neither.
 *
 * Levels are ranks: basements −1, −2 …; ground / plinth / stilt 0; podium / "HP" 0.5 (between ground and 1st);
 * numbered floors 1, 2 …; terrace / top / "ST" 999. A range "ABOVE a TO b" holds the floors above a up to b.
 */
export type ColRange = { above?: number; to?: number; all?: boolean };

const TER = 999;
function rankOf(tok: string): number | undefined {
  const t = tok.trim().toUpperCase().replace(/[.\s]+$/g, "");
  if (!t) return undefined;
  let m = t.match(/^B(?:AS(?:E(?:MENT)?)?)?[-_ ]?(\d)?$/); if (m && (t.startsWith("BAS") || /^B\d$/.test(t) || t === "B")) return -(Number(m[1] ?? 1));
  if (/^(BASEMENT|BSMT|CELLAR)/.test(t)) { const n = t.match(/(\d)/); return -(n ? +n[1] : 1); }
  if (/^(PL|PLINTH|GF|G|GR|GROUND|GL|STILT|STL|FOOTING|FDN|FOUNDATION)$/.test(t)) return 0;
  if (/^(HP|POD|PODIUM|LP|UP)$/.test(t)) return 0.5;
  if (/^(TER|TE|TERR|TERRACE|TOP|ROOF|RF|ST|OHT|LMR|HR|MUMTY|STAIR)$/.test(t)) return TER;
  m = t.match(/^(\d{1,3})(?:ST|ND|RD|TH)?(?:\s*(?:FL|FLR|FLOOR))?$/); if (m) return +m[1];
  return undefined;
}

/** Floor range of a column layer from its name; null when the name carries none. */
export function columnLayerRange(layer: string): ColRange | null {
  const n = layer.trim().replace(/^.*\$0\$/, "").toUpperCase();
  const m = n.match(/^S[-_ ]?C\d{0,2}[-_ ]+(.*)$/) ?? n.match(/^S[-_ ]?C[-_ ]?((?:UP|ABOVE|TO|BELOW|FROM|THRU|THROUGH)\b.*)$/);
  if (!m) return null;
  const s = m[1].replace(/[_]+/g, " ").trim();
  if (/^(THRU|THROUGH|ALL)\b/.test(s)) return { all: true };
  let r = s.match(/^(?:ABOVE|FROM)\s+(.+?)\s+(?:TO|UPTO|UP TO)\s+(.+)$/);
  if (r) { const a = rankOf(r[1]), b = rankOf(r[2]); return a == null && b == null ? null : { above: a, to: b }; }
  r = s.match(/^(?:UP\s*TO|UPTO|TO|BELOW)\s+(.+)$/); if (r) { const b = rankOf(r[1]); return b == null ? null : { to: b }; }
  r = s.match(/^(?:ABOVE|FROM)\s+(.+)$/); if (r) { const a = rankOf(r[1]); return a == null ? null : { above: a }; }
  return null;
}

export const coversLevel = (r: ColRange, lvl: number) => r.all || ((r.above == null || lvl > r.above) && (r.to == null || lvl <= r.to));

const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
/** Levels a plan title stands for: "05, 07,11, 16, 20TH FLOOR" → 5, 7, 11, 16, 20; "2ND TO 13TH FLOOR" → 2 … 13;
 *  "BASEMENT-2" → −2; "GROUND FLOOR" → 0; "FIRST FLOOR" → 1. Empty when the title names no level (a typical plan). */
export function titleLevels(title?: string): number[] {
  if (!title) return [];
  const t = title.toUpperCase().replace(/\\[A-Z]/g, "").replace(/\s+/g, " ");
  if (/TYPICAL|\bTYP\b/.test(t) && !/\d/.test(t)) return [];
  const b = t.match(/BASEMENT[-\s]*(\d)|\bB[-\s]?(\d)\s*(?:PLAN|FLOOR|LVL|LEVEL)/); if (b) return [-(+(b[1] ?? b[2]))];
  if (/\bBASEMENT\b|\bCELLAR\b/.test(t)) return [-1];
  if (/\b(GROUND|STILT|PLINTH)\b|\bG\.?F\.?\b/.test(t) && !/\d{1,2}\s*(ST|ND|RD|TH)\b/.test(t)) return [0];
  if (/\bPODIUM\b/.test(t) && !/\d{1,2}\s*(ST|ND|RD|TH)\b/.test(t)) return [0.5];
  if (/\b(TERRACE|ROOF)\s*(PLAN|LEVEL|LVL|FLOOR PLAN)\b/.test(t) && !/\d{1,2}\s*(ST|ND|RD|TH)\b/.test(t)) return [TER];
  if (/\bTERRACE\b|\bROOF\b/.test(t) && !/FLOOR/.test(t)) return [];
  if (!/FLOOR|FLR|\bFL\b|LEVEL|LVL/.test(t)) return [];
  const r = t.match(/(\d{1,3})\s*(?:ST|ND|RD|TH)?\s*(?:FLOOR\s*)?(?:TO|-|–|UPTO|UP TO)\s*(\d{1,3})\s*(?:ST|ND|RD|TH)?/);
  if (r && +r[2] >= +r[1] && +r[2] - +r[1] < 150) return Array.from({ length: +r[2] - +r[1] + 1 }, (_, i) => +r[1] + i);
  const head = t.split(/FLOOR|FLR|\bFL\b|LEVEL|LVL/)[0];
  const nums = [...head.matchAll(/\b0?(\d{1,3})\s*(?:ST|ND|RD|TH)?\b/g)].map((x) => +x[1]).filter((x) => x > 0 && x < 150);
  if (nums.length) return [...new Set(nums)];
  for (const [w, n] of Object.entries(ORD)) if (new RegExp(`\\b${w.toUpperCase()}\\b`).test(head)) return [n];
  return [];
}

export const levelLabel = (l: number) => l >= TER ? "terrace" : l === 0.5 ? "podium" : l === 0 ? "ground" : l < 0 ? `basement ${-l}` : `${l}${["th", "st", "nd", "rd"][l % 10 > 3 || (l % 100 >= 11 && l % 100 <= 13) ? 0 : l % 10]}`;
export const rangeLabel = (r: ColRange) => r.all ? "all floors" : `${r.above != null ? `above ${levelLabel(r.above)} ` : ""}${r.to != null ? `up to ${levelLabel(r.to)}` : ""}`.trim();
/** The floor words of a column layer as the consultant wrote them: "S-C3-ABOVE HP TO 14" → "above HP to 14". */
export const colLayerWords = (layer: string) => layer.trim().replace(/^.*\$0\$/, "").replace(/^S[-_ ]?C\d{0,2}[-_ ]+/i, "").replace(/\b(ABOVE|UP TO|UPTO|TO|THRU|FROM|BELOW)\b/g, (w) => w.toLowerCase());
