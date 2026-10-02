/**
 * Packing list by zone (YJK-LMB "根据分区构件及编号等生成打包清单"): every deck zone M1, M2 … gets its own bundle —
 * the deck panels of the zone plus the wall panels of the faces around it — so a bundle can be loaded, sent
 * and opened at the room where it is fixed. Faces facing outside the slab go to the "EXT" (external walls) bundle.
 */
import type { Pt } from "./calc";
import type { Zone } from "./zones";
import type { FaceLayout } from "@/lib/design-engine/floor-panels";
import { faceFrames, inRings } from "@/lib/design-engine/design-check";

export type PackLine = { code: string; kind: "Deck" | "Wall"; w: number; h: number; qty: number; kgEach: number; nos: string[] };
export type Pack = { zone: string; area: number; faces: string[]; lines: PackLine[]; pcs: number; kg: number };

export function packingByZone(o: {
  zones: Zone[]; faces: FaceLayout[]; mpp: number; walls: Pt[][];
  wallPanels: { no: string; face: string; code: string; w: number; h: number }[];
  kgOf: (code: string, w: number, h: number) => number;
}): Pack[] {
  // wall face → zone: a point 300 mm in front of the face middle, on the open side
  const faceZone = new Map<string, string>();
  for (const fr of faceFrames(o.faces, o.mpp, o.walls)) {
    const m: Pt = [(fr.a[0] + fr.b[0]) / 2 + fr.n[0] * 0.3, (fr.a[1] + fr.b[1]) / 2 + fr.n[1] * 0.3];
    const z = o.zones.find((q) => m[0] >= q.box[0] && m[0] <= q.box[2] && m[1] >= q.box[1] && m[1] <= q.box[3] && inRings(m, q.rings));
    faceZone.set(fr.f.code, z ? z.code : "EXT");
  }
  // pieces over / under openings (no position of their own) follow the face they were cut from
  const zoneOfFace = (code: string) => {
    if (faceZone.has(code)) return faceZone.get(code)!;
    const parent = code.replace(/-O\d+[HS]$/, "");
    for (const [k, v] of faceZone) if (k === parent || k.startsWith(`${parent}.`)) return v;
    return "EXT";
  };
  const packs = new Map<string, Pack>();
  const get = (zone: string, area = 0) => { let p = packs.get(zone); if (!p) { p = { zone, area, faces: [], lines: [], pcs: 0, kg: 0 }; packs.set(zone, p); } return p; };
  const addLine = (p: Pack, kind: PackLine["kind"], code: string, w: number, h: number, no: string) => {
    let l = p.lines.find((x) => x.code === code && x.kind === kind);
    if (!l) { l = { code, kind, w, h, qty: 0, kgEach: Math.round(o.kgOf(code, w, h) * 100) / 100, nos: [] }; p.lines.push(l); }
    l.qty++; l.nos.push(no); p.pcs++; p.kg += l.kgEach;
  };
  for (const z of o.zones) { const p = get(z.code, z.area); for (const d of z.panels) addLine(p, "Deck", d.code, d.w, d.L, d.no); }
  for (const w of o.wallPanels) {
    const p = get(zoneOfFace(w.face));
    if (!p.faces.includes(w.face)) p.faces.push(w.face);
    addLine(p, "Wall", w.code, w.w, w.h, w.no);
  }
  const order = (z: string) => (z === "EXT" ? 1e9 : Number(z.replace(/\D/g, "")) || 0);
  const out = [...packs.values()].sort((a, b) => order(a.zone) - order(b.zone));
  for (const p of out) { p.kg = Math.round(p.kg); p.lines.sort((a, b) => (a.kind === b.kind ? b.qty - a.qty : a.kind === "Wall" ? -1 : 1)); }
  return out;
}

/** "M12-01 … M12-07, M12-09" style short list of panel numbers. */
export function shortNos(nos: string[], max = 12) {
  return nos.length <= max ? nos.join(", ") : `${nos.slice(0, max).join(", ")} … (+${nos.length - max})`;
}
