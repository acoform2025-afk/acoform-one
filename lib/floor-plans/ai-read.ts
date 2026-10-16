/**
 * AI reading of a whole drawing: a vision model looks at the picture of every drawing part (with the hatching coloured by
 * layer) plus the layer list and the written notes, and says what each layer and each hatch means. The app keeps the
 * exact geometry from the file itself — the AI only classifies. Its answer is a proposal the user can accept or change.
 */
import type { LayerRole } from "./calc";

export const HATCH_MEANINGS = ["concrete_wall", "brick_wall", "column", "slab", "void", "stair", "lift", "finish", "other"] as const;
export type HatchMeaning = (typeof HATCH_MEANINGS)[number];
export const HATCH_LABEL: Record<HatchMeaning, string> = { concrete_wall: "Concrete wall (formed)", brick_wall: "Brick / block wall (not formed)", column: "Column", slab: "Slab", void: "Void / cut-out / shaft (no slab)", stair: "Stair", lift: "Lift", finish: "Finish / pattern (ignore)", other: "Other (ignore)" };
export const HATCH_COLOR: Record<HatchMeaning, string> = { concrete_wall: "#e11d48", brick_wall: "#9ca3af", column: "#f97316", slab: "#2563eb", void: "#a855f7", stair: "#16a34a", lift: "#7c3aed", finish: "#d1d5db", other: "#d1d5db" };

export type AiLayer = { name: string; role: LayerRole; confidence: "high" | "medium" | "low"; why: string };
export type AiHatch = { layer: string; meaning: HatchMeaning; why: string };
export type AiRead = {
  at: string; model?: string; summary: string; typicalFloor?: string;
  layers: AiLayer[]; hatches: AiHatch[]; findings: string[]; questions: string[];
  applied?: { at: string; hatches: boolean };    // the user accepted the hatch meanings: the app builds walls / voids from them
};

const ROLES = ["ignore", "walls", "columns", "slab", "opening", "beams", "upstand"] as const;

export const AI_SYSTEM = `You are a senior engineer who reads architectural and structural CAD drawings for an aluminium (Mivan) formwork company in India.
You are given pictures of a drawing (all parts of it) and the table of its layers, hatches and written notes. Hatch layers are painted in the picture in the colour given in the table.
Decide what every layer and every hatch means for formwork:
- walls = reinforced-concrete (RCC / shear) wall lines that are formed; brick / block / partition walls are NOT formed (role ignore, hatch meaning brick_wall).
- columns, beams, slab = outline of the floor slab, opening = lift / duct / shaft / cut-out / void (no slab), upstand = planter / kerb.
- Furniture, dimensions, grids, text, titles, sanitary, doors / windows, trees, cars, sections and elevations: ignore.
Hatch meaning is one of: ${HATCH_MEANINGS.join(", ")}. A hatch with a name like RCC / concrete / shear = concrete_wall; 100 / 230 MM, brick, block, AAC = brick_wall; void / cut / shaft / duct / lift = void or lift.
Use the picture and the notes to confirm; if the name and the picture disagree, trust the picture and say so. Say plainly what you are unsure of.
Answer with ONE JSON object only, no other text:
{"summary":"3-6 plain sentences about what the drawing is","typicalFloor":"which plan is the typical floor and why","layers":[{"name":"<layer>","role":"${ROLES.join("|")}","confidence":"high|medium|low","why":"short"}],"hatches":[{"layer":"<layer>","meaning":"${HATCH_MEANINGS.join("|")}","why":"short"}],"findings":["things the formwork team must know: voids, sunk slabs, shear-wall cores, level changes, notes that change the work"],"questions":["things you could not decide and someone must confirm"]}
Only list layers that carry lines or hatches. Keep every "why" under 20 words.`;

export function parseAiRead(text: string, model?: string): AiRead | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}"); if (a < 0 || b <= a) return null;
  let j: Record<string, unknown>; try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  const str = (v: unknown, n = 400) => (typeof v === "string" ? v.slice(0, n) : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const layers: AiLayer[] = arr(j.layers).flatMap((x) => { const o = x as Record<string, unknown>; const role = String(o.role); return typeof o.name === "string" && (ROLES as readonly string[]).includes(role) ? [{ name: o.name, role: role as LayerRole, confidence: (["high", "medium", "low"].includes(String(o.confidence)) ? o.confidence : "medium") as AiLayer["confidence"], why: str(o.why, 160) }] : []; });
  const hatches: AiHatch[] = arr(j.hatches).flatMap((x) => { const o = x as Record<string, unknown>; const m = String(o.meaning); return typeof o.layer === "string" && (HATCH_MEANINGS as readonly string[]).includes(m) ? [{ layer: o.layer, meaning: m as HatchMeaning, why: str(o.why, 160) }] : []; });
  return { at: new Date().toISOString(), model, summary: str(j.summary, 1500), typicalFloor: str(j.typicalFloor, 500) || undefined, layers, hatches, findings: arr(j.findings).map((s) => str(s, 300)).filter(Boolean).slice(0, 30), questions: arr(j.questions).map((s) => str(s, 300)).filter(Boolean).slice(0, 20) };
}

/**
 * The accepted hatch meanings turn the file's own hatch outlines into elements: concrete-wall hatches become closed wall
 * outlines, void / lift hatches become openings, column hatches columns. Brick, finish and other hatches stay out.
 * Works on the model in place (adds paths and three layers) — exact geometry from the file, classified by the AI.
 */
export function applyAiHatches(model: { paths: { layer: string; pts: [number, number][]; closed: boolean }[]; fills?: { kind: string; layer: string; pts: [number, number][] }[]; layers: { name: string; count: number; closed: number; suggested: LayerRole; [k: string]: unknown }[]; bbox: [number, number, number, number]; units: string }, ai: AiRead, unitToM: number): number {
  if (!ai.applied?.hatches) return 0;
  const target: Record<string, { layer: string; role: LayerRole } | undefined> = {};
  for (const h of ai.hatches) target[h.layer] = h.meaning === "concrete_wall" ? { layer: "AI hatch: concrete wall", role: "walls" } : h.meaning === "void" || h.meaning === "lift" ? { layer: "AI hatch: void", role: "opening" } : h.meaning === "column" ? { layer: "AI hatch: column", role: "columns" } : undefined;
  const span2 = (model.bbox[2] - model.bbox[0]) * (model.bbox[3] - model.bbox[1]);
  const area = (r: [number, number][]) => { let a = 0; for (let i = 0; i < r.length; i++) { const q = r[(i + 1) % r.length]; a += r[i][0] * q[1] - q[0] * r[i][1]; } return Math.abs(a) / 2; };
  const seen = new Set<string>(); let n = 0;
  for (const f of model.fills ?? []) {
    if (f.kind !== "hatch") continue; const t = target[f.layer]; if (!t || f.pts.length < 3) continue;
    const a = area(f.pts); if (a * unitToM * unitToM < 0.01 || a > 0.4 * span2) continue;      // specks and page-size boundaries are not elements
    const key = t.layer + ":" + f.pts.map((q) => `${Math.round(q[0] / 5)},${Math.round(q[1] / 5)}`).join(";");
    if (seen.has(key)) continue; seen.add(key);
    model.paths.push({ layer: t.layer, pts: f.pts, closed: true }); n++;
  }
  for (const t of new Set(Object.values(target).filter(Boolean).map((x) => x!.layer))) {
    if (!model.paths.some((p) => p.layer === t)) continue;
    const role = (Object.values(target).find((x) => x?.layer === t) as { role: LayerRole }).role;
    model.layers.push({ name: t, count: model.paths.filter((p) => p.layer === t).length, closed: model.paths.filter((p) => p.layer === t).length, suggested: role });
  }
  return n;
}
