/**
 * Shop details for special (made-to-size) aluminium panels: pin-hole pattern on every edge, stiffeners,
 * cutting list and weight — so every special matches the pin holes of the standard panels beside it.
 *
 * Pattern from ACOFORM STD FAB drawings (ACOFORM WORK PVT LTD. PATTERN):
 *  - pin holes Ø16 +0.1 on the 65 mm edge rails, hole centre 40 mm from the concrete face, skin 4 mm Al plate
 *  - wall panels (W, WT, fillers, stop-ends): height edges — first hole 100 mm from the bottom, then @200
 *    (2400 panel: 100 … 2300; WT 1075: 100 … 900); top / bottom edges — 50 from the side, then @50
 *  - deck panels: long edges @100 from 50, short edges @50 from 50; I-stiffeners @300 from the left (dim 'A')
 *  - beam side / bottom panels, corners: hole c/d 50 mm continued up to full length
 *  - wall stiffeners U / Y-stiff @300, WT / deck I-stiff
 */
import type { BomRow } from "./floor-panels";

export const FAB = { skin: 4, railDepth: 65, holeFromFace: 40, railT: 8, ribPitch: 300, holeDia: 16, density: 2700, grade: "6061-T6" };
/**
 * Section areas measured on ACOFORM STD FAB drawing (mm²) → kg/m in aluminium 6061 (2.70 g/cm³).
 * Skin 4 mm plate = 10.8 kg/m²; edge rail 65 × 8 (427 mm²) 1.153 kg/m; U-stiffener (446 mm²) 1.203 kg/m;
 * Y-stiffener 584 (499 mm²) 1.347 kg/m; I-stiffener 40 × 20 (223 mm²) 0.602 kg/m.
 */
export const PROFILE = {
  rail: { name: "Edge rail 65 × 8", area: 427.2 },
  u: { name: "U-stiffener", area: 445.6 },
  y: { name: "Y-stiffener 584", area: 499.0 },
  i: { name: "I-stiffener 40 × 20", area: 222.9 },
} as const;
/** Fitted to ACOFORM's measured production weights of standard 2400 wall panels (100 … 600 wide, 13 sizes). */
export const ACTUAL = { wallA: 4.93, wallB: 0.03542, ratio: 0.915 };
const kgPerM = (area: number) => (area * FAB.density) / 1e6;

export type FabKind = "wall" | "beam" | "deck" | "stair" | "small";
export type FabSpec = {
  code: string; description: string; kind: FabKind; w: number; h: number; qty: number;
  holesW: number[];   // hole positions along the width edges (top / bottom), from the left end
  holesH: number[];   // hole positions along the height / length edges (left / right), from the base
  ribs: number[];     // rib positions measured along the long direction
  ribAcross: "w" | "h"; // ribs run across this dimension
  cut: { part: string; size: string; nos: number; kg: number }[];
  kgEach: number; warnings: string[]; usedIn?: string;
};

export function kindOf(code: string): FabKind {
  if (/^(WF|WT|OH|OS|SE|CF|WP)/.test(code)) return "wall";
  if (/^(BS|BB)/.test(code)) return "beam";
  if (/^(DS|DF|DP)/.test(code)) return "deck";
  if (/^(SS|LS|RS|CK)/.test(code)) return "stair";
  return "small";
}

/** Hole rule per edge: first hole from the base end, pitch, smallest end distance at the far end. */
type Rule = { first: number; pitch: number; endMin: number };
const RULES: Record<FabKind, { long: Rule; short: Rule }> = {
  wall: { long: { first: 100, pitch: 200, endMin: 75 }, short: { first: 50, pitch: 50, endMin: 25 } },
  deck: { long: { first: 50, pitch: 100, endMin: 50 }, short: { first: 50, pitch: 50, endMin: 25 } },
  stair: { long: { first: 50, pitch: 100, endMin: 50 }, short: { first: 50, pitch: 50, endMin: 25 } },
  beam: { long: { first: 50, pitch: 50, endMin: 25 }, short: { first: 50, pitch: 50, endMin: 25 } },
  small: { long: { first: 50, pitch: 50, endMin: 25 }, short: { first: 50, pitch: 50, endMin: 25 } },
};
export function ruleText(k: FabKind) {
  const r = RULES[k];
  return `${k === "wall" ? "height" : "long"} edges ${r.long.first} from base then @${r.long.pitch} · ${k === "wall" ? "top/bottom" : "short"} edges ${r.short.first} then @${r.short.pitch}`;
}

/** Hole positions along an edge of length L (mm) measured from its base end. */
export function edgeHoles(L: number, rule: Rule = RULES.wall.long): number[] {
  if (L < 60) return [];
  if (L < 2 * rule.first) return [Math.round(L / 2)];
  const out: number[] = [];
  for (let z = rule.first; z <= L - rule.endMin + 0.1; z += rule.pitch) out.push(z);
  return out;
}

export function fabSpec(code: string, description: string, w: number, h: number, qty: number): FabSpec {
  const kind = kindOf(code);
  const W = Math.round(w), H = Math.round(h);
  const long = Math.max(W, H), short = Math.min(W, H);
  const ribAcross: "w" | "h" = H >= W ? "w" : "h";
  // stiffeners: wall panels U / U / Y repeating at 200, 450, 750 … (as the 2400 W panel); WT, deck, beam, stair: I @300 from the left
  const ribs: number[] = [];
  if (kind === "wall" && H >= W) { if (long > 350) ribs.push(200); for (let z = 450; z <= long - 150; z += 300) ribs.push(z); }
  else for (let z = FAB.ribPitch; z <= long - 150; z += FAB.ribPitch) ribs.push(z);
  const isWT = /^WT/.test(code);
  const ribType = (i: number) => (kind === "wall" && !isWT && H >= W ? (i % 3 === 2 ? PROFILE.y : PROFILE.u) : PROFILE.i);
  const kgPlate = (a: number, b: number) => (a * b * FAB.skin * FAB.density) / 1e9;
  const inner = Math.max(0, short - 2 * FAB.railT);
  const ribGroups = new Map<string, { area: number; n: number }>();
  ribs.forEach((_, i) => { const t = ribType(i); const g = ribGroups.get(t.name) ?? { area: t.area, n: 0 }; g.n++; ribGroups.set(t.name, g); });
  const cut = [
    { part: `Skin plate ${FAB.skin} mm (Al ${FAB.grade})`, size: `${W} × ${H}`, nos: 1, kg: kgPlate(W, H) },
    { part: `${PROFILE.rail.name} (long sides)`, size: `${long}`, nos: 2, kg: (2 * long * kgPerM(PROFILE.rail.area)) / 1000 },
    { part: `${PROFILE.rail.name} (end plates)`, size: `${inner}`, nos: 2, kg: (2 * inner * kgPerM(PROFILE.rail.area)) / 1000 },
    ...(inner > 0 ? [...ribGroups.entries()].map(([name, g]) => ({ part: name, size: `${inner}`, nos: g.n, kg: (g.n * inner * kgPerM(g.area)) / 1000 })) : []),
  ];
  // calibrated to ACOFORM's actual production weights (STD 2400 per-piece weight sheet):
  // wall pieces kg = H/2400 × (4.93 + 0.03542 × W); other pieces = section weight × 0.915 (same shop ratio)
  const theory = cut.reduce((a, c) => a + c.kg, 0);
  const target = kind === "wall" && H >= W ? (H / 2400) * (ACTUAL.wallA + ACTUAL.wallB * W) : theory * ACTUAL.ratio;
  const f = theory > 0 ? target / theory : 1;
  for (const c of cut) c.kg = Math.round(c.kg * f * 100) / 100;
  const kgEach = Math.round(target * 100) / 100;
  const warnings: string[] = [];
  if (short < 100) warnings.push(`Only ${short} mm wide — too narrow for a framed panel: make it a solid aluminium / plywood filler bolted to the next panel.`);
  else if (short < 150) warnings.push(`${short} mm wide — a single hole row; check the pin can be driven.`);
  if (long > 3000) warnings.push(`${long} mm long — check transport and handling weight.`);
  // "height" = the panel's height for wall pieces, its length for deck / beam / stair pieces
  const R = RULES[kind];
  const holesH = edgeHoles(H, H >= W || kind === "wall" ? R.long : R.short), holesW = edgeHoles(W, H >= W || kind === "wall" ? R.short : R.long);
  return { code, description, kind, w: W, h: H, qty, holesW, holesH, ribs, ribAcross, cut, kgEach, warnings };
}

/** Every made-to-size panel of the layout (BOM rows marked custom with a real size), one spec per type. */
export function specialsFromBom(bom: BomRow[]): FabSpec[] {
  return bom.filter((r) => r.custom && r.w > 0 && r.h > 0 && r.group !== "accessory" && r.qty > 0)
    .map((r) => fabSpec(r.code, r.description, r.w, r.h, Math.round(r.qty)))
    .sort((a, b) => ["wall", "beam", "deck", "stair", "small"].indexOf(a.kind) - ["wall", "beam", "deck", "stair", "small"].indexOf(b.kind) || b.qty - a.qty);
}

/**
 * Pin-hole check across joints: two panels side by side share an edge; their holes line up when both use the same
 * grid from the same base. Standard wall panels and specials both start at the slab, so every height-edge matches;
 * this returns the specials whose holes cannot match (too short / narrow edges) for the check list.
 */
export function pinHoleCheck(specs: FabSpec[]): { code: string; issue: string }[] {
  const out: { code: string; issue: string }[] = [];
  for (const s of specs) {
    for (const w of s.warnings) out.push({ code: s.code, issue: w });
    // wall pieces: the height-edge holes must sit on the 100 + 200·n grid of the standard 2400 panels
    if (s.kind === "wall" && s.holesH.some((z) => (z - 100) % 200 !== 0)) out.push({ code: s.code, issue: "height-edge holes are off the 100 + @200 grid — check against the standard panel beside it." });
  }
  return out;
}
