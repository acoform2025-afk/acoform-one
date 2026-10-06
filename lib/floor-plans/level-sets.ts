/**
 * Set per level: the typical floor's part list against each level that has its own drawing. One set travels floor by
 * floor, so a different floor needs the typical set PLUS the pieces it has more of (per code), and leaves the pieces it
 * has fewer of idle. The full set is, per code, the most any formed level needs.
 */
export type SetRow = { code: string; description: string; group: string; custom: boolean; kg: number; typical: number; levels: number[]; full: number };
export type LevelCol = { id: string; name: string; floors: string[]; count: number; extraPcs: number; extraKg: number; idlePcs: number };
type Bom = { code: string; description: string; group: string; qty: number; weight: number; custom: boolean }[];

export function levelSets(typical: Bom, own: { id: string; name: string; floors: string[]; bom: Bom }[]): { rows: SetRow[]; cols: LevelCol[]; full: { pcs: number; kg: number }; typ: { pcs: number; kg: number }; extra: { pcs: number; kg: number } } {
  const acc = (b: Bom) => { const m = new Map<string, { description: string; group: string; qty: number; kg: number; custom: boolean }>(); for (const r of b) { if (r.group === "accessory") continue; const e = m.get(r.code); if (e) e.qty += r.qty; else m.set(r.code, { description: r.description, group: r.group, qty: r.qty, kg: r.qty ? r.weight / r.qty : 0, custom: r.custom }); } return m; };
  const T = acc(typical), O = own.map((o) => acc(o.bom));
  const codes = new Set<string>([...T.keys(), ...O.flatMap((m) => [...m.keys()])]);
  const rows: SetRow[] = [];
  for (const code of codes) {
    const src = T.get(code) ?? O.map((m) => m.get(code)).find(Boolean)!;
    const levels = O.map((m) => m.get(code)?.qty ?? 0);
    rows.push({ code, description: src.description, group: src.group, custom: src.custom, kg: src.kg, typical: T.get(code)?.qty ?? 0, levels, full: Math.max(T.get(code)?.qty ?? 0, ...levels) });
  }
  const ord: Record<string, number> = { wall: 0, "wall-top": 1, column: 2, end: 3, corner: 4, deck: 5, beam: 6, upstand: 7, stair: 8, drop: 9, filler: 10 };
  rows.sort((a, b) => (ord[a.group] ?? 20) - (ord[b.group] ?? 20) || b.full - a.full || a.code.localeCompare(b.code));
  const cols: LevelCol[] = own.map((o, i) => {
    let extraPcs = 0, extraKg = 0, idlePcs = 0;
    for (const r of rows) { const d = r.levels[i] - r.typical; if (d > 0) { extraPcs += d; extraKg += d * r.kg; } else idlePcs -= d; }
    return { id: o.id, name: o.name, floors: o.floors, count: o.floors.length, extraPcs, extraKg, idlePcs };
  });
  const sum = (f: (r: SetRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const typ = { pcs: sum((r) => r.typical), kg: sum((r) => r.typical * r.kg) };
  const full = { pcs: sum((r) => r.full), kg: sum((r) => r.full * r.kg) };
  return { rows, cols, full, typ, extra: { pcs: full.pcs - typ.pcs, kg: full.kg - typ.kg } };
}
