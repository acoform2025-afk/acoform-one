/**
 * Slab thickness and floor height read from a building section (the "SECTION 1 / Section 3" views in the drawing).
 * In a section every floor shows as a band of long horizontal lines: the floor top (FFL), sometimes a finish /
 * screed line 25–75 mm below it, and the slab soffit, with open storey height below the soffit. The band repeats
 * every floor-to-floor height. Formwork walls run from the concrete top of one slab to the soffit of the next, so
 * the concrete slab (total − finish) is what the take-off uses.
 */
export type SectionLevels = { floorMm: number; totalMm: number; finishMm: number; slabMm: number; floors: number; name?: string; beamMm?: number };

/** lines: horizontal lines of one section (drawing units: x0 < x1, y); unitToM: metres per drawing unit. */
export function sectionLevels(lines: { x0: number; x1: number; y: number }[], unitToM: number, name?: string): SectionLevels | null {
  const mm = unitToM * 1000;
  const L = lines.filter((l) => (l.x1 - l.x0) * unitToM >= 1);
  if (L.length < 6) return null;
  const W = Math.max(...L.map((l) => l.x1)) - Math.min(...L.map((l) => l.x0));
  if (W * unitToM < 6) return null;
  // levels: lines at the same height (5 mm) added up; a floor line runs across a good part of the section
  const lv = new Map<number, number>();
  for (const l of L) { const k = Math.round((l.y * mm) / 5); lv.set(k, (lv.get(k) ?? 0) + (l.x1 - l.x0)); }
  const ys = [...lv.entries()].filter(([, len]) => len >= 0.25 * W).map(([k]) => k * 5).sort((a, b) => b - a);   // mm, top first
  if (ys.length < 4) return null;
  // floor band: levels lying within 350 mm of each other (floor top, finish line, soffit); a single level well
  // below a band (≤ 1.2 m) is the underside of the beams / lintels of that floor
  const groups: number[][] = [];
  for (const y of ys) { const g = groups[groups.length - 1]; if (g && g[g.length - 1] - y <= 350) g.push(y); else groups.push([y]); }
  const bands: { top: number; soffit: number; finish: number; drop?: number }[] = [];
  groups.forEach((g, gi) => {
    const top = g[0], soffit = g[g.length - 1], total = top - soffit;
    if (g.length < 2 || total < 90 || total > 350) return;
    const fin = g.filter((y) => top - y >= 25 && top - y <= 75)[0];
    const nx = groups[gi + 1];
    const drop = nx && nx.length === 1 && soffit - nx[0] >= 150 && soffit - nx[0] <= 1200 ? soffit - nx[0] : undefined;
    bands.push({ top, soffit, finish: fin != null ? top - fin : 0, drop });
  });
  if (bands.length < 2) return null;
  const mode = (v: number[]) => { const c = new Map<number, number>(); for (const x of v) c.set(x, (c.get(x) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]; };
  const steps: number[] = [];
  for (let i = 1; i < bands.length; i++) { const d = Math.round((bands[i - 1].top - bands[i].top) / 10) * 10; if (d >= 2400 && d <= 6000) steps.push(d); }
  if (!steps.length) return null;
  const [floorMm, n] = mode(steps);
  if (n < Math.max(1, Math.floor(steps.length / 3))) return null;
  const [totalMm] = mode(bands.map((b) => Math.round((b.top - b.soffit) / 5) * 5));
  const [finishMm] = mode(bands.filter((b) => Math.abs(b.top - b.soffit - totalMm) <= 5).map((b) => Math.round(b.finish / 5) * 5));
  const drops = bands.filter((b) => b.drop != null).map((b) => Math.round(b.drop! / 5) * 5);
  const [dropMm, dn] = drops.length ? mode(drops) : [0, 0];
  const slabMm = totalMm - finishMm;
  // beams / lintels: depth measured from the concrete top of the slab
  return { floorMm, totalMm, finishMm, slabMm, floors: n + 1, name, ...(dropMm && dn >= Math.max(2, bands.length / 2) ? { beamMm: dropMm + slabMm } : {}) };
}

/** Several sections (one per tower …): the reading most of them agree on. */
export function agreedSection(list: SectionLevels[]): SectionLevels | null {
  if (!list.length) return null;
  const key = (s: SectionLevels) => `${s.floorMm}|${s.totalMm}|${s.finishMm}`;
  const c = new Map<string, SectionLevels[]>();
  for (const s of list) (c.get(key(s)) ?? c.set(key(s), []).get(key(s))!).push(s);
  const best = [...c.values()].sort((a, b) => b.length - a.length || b[0].floors - a[0].floors)[0];
  const beams = best.map((s) => s.beamMm).filter((b): b is number => !!b);
  const beamMm = beams.length ? beams.sort((a, b) => beams.filter((x) => x === b).length - beams.filter((x) => x === a).length)[0] : undefined;
  return { ...best[0], floors: Math.max(...best.map((s) => s.floors)), name: best.map((s) => s.name).filter(Boolean).join(", ") || undefined, ...(beamMm ? { beamMm } : {}) };
}

/** Marker text written by the DWG converter: "SECTION|floorMm|totalMm|finishMm|floors|beamMm|name". */
export const SECTION_LAYER = "ACOFORM-SECTIONS";
export const sectionMarker = (s: SectionLevels) => ["SECTION", s.floorMm, s.totalMm, s.finishMm, s.floors, s.beamMm ?? 0, (s.name ?? "").replace(/[|\r\n]/g, " ").slice(0, 100)].join("|");
export function parseSectionMarker(raw: string): SectionLevels | null {
  const [tag, f, t, fi, n, bm, ...name] = raw.split("|");
  if (tag !== "SECTION") return null;
  const floorMm = Number(f), totalMm = Number(t), finishMm = Number(fi) || 0, floors = Number(n) || 0;
  if (!(floorMm > 0 && totalMm > 0)) return null;
  return { floorMm, totalMm, finishMm, slabMm: totalMm - finishMm, floors, name: name.join("|").trim() || undefined, ...(Number(bm) > 0 ? { beamMm: Number(bm) } : {}) };
}
