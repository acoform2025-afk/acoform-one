/**
 * One project, many drawing files. An architect / structural engineer sends the floor plans in one file, the sections
 * in another, the elevations or the beam schedule in a third. Each file is read on its own, so what one file states
 * for the whole building (floor-to-floor heights, slab thickness, the level list, beam sizes, number of floors) is
 * kept as that file's "drawing facts", and every other drawing of the same project (lead) uses them where it says
 * nothing itself. What a drawing states about itself always wins over what another drawing says.
 */
import { beamSchedule, drawingParts, drawingSection, floorInfoFromTexts, suggestedRoles, type DxfModel, type PartKind } from "./dxf";
import { statedLevels, type Level } from "./building";
import type { SectionLevels } from "./section-read";

export const FACTS_V = 1;
export type BeamSize = { b: number; d: number };
export type DrawingFacts = {
  v: number; at: string;
  contains: Partial<Record<PartKind, number>>;            // drawings of each kind in the file (plans, sections, elevations …)
  section?: SectionLevels | null;                         // floor-to-floor / slab / beam depth read from its sections
  levels?: Level[]; levelsNote?: string;                  // the level list it states (level table / marks / names)
  floors?: number; floorMm?: number; floorNote?: string;  // number of floors / floor height written in its notes
  beams?: Record<string, BeamSize>;                       // its beam schedule: mark → width × depth (mm)
};

/** What one drawing file states for the whole project. */
export function drawingFacts(model: DxfModel, unitToM: number): DrawingFacts {
  const contains: Partial<Record<PartKind, number>> = {};
  for (const p of drawingParts(model, unitToM, suggestedRoles(model))) contains[p.kind] = (contains[p.kind] ?? 0) + 1;
  const section = drawingSection(model);
  const st = statedLevels(model.texts ?? [], unitToM);
  const info = floorInfoFromTexts(model.texts ?? [], unitToM);
  const beams: Record<string, BeamSize> = {};
  for (const e of beamSchedule(model, unitToM)) if (!beams[e.name]) beams[e.name] = e.sz;
  return {
    v: FACTS_V, at: new Date().toISOString(), contains,
    ...(section ? { section } : {}),
    ...(st ? { levels: st.levels.map((l) => ({ ...l, partN: undefined, partTitle: undefined, planId: null })), levelsNote: st.note } : {}),
    ...(info.floors ? { floors: info.floors } : {}), ...(info.heightMm ? { floorMm: info.heightMm } : {}), ...(info.source ? { floorNote: info.source } : {}),
    ...(Object.keys(beams).length ? { beams } : {}),
  };
}

export type ProjectDrawing = { id: string; name: string; facts: DrawingFacts | null };
export type ProjectFacts = {
  drawings: { id: string; name: string; what: string; gave: string[] }[];   // every other drawing of the project and what it gave
  section?: SectionLevels; sectionFrom?: string;
  levels?: Level[]; levelsFrom?: string;
  floors?: number; floorsFrom?: string;
  floorMm?: number; floorMmFrom?: string;
  beams: Record<string, BeamSize>; beamsFrom: Record<string, string>;
  conflicts: string[];                                                      // drawings that disagree — for the architect
  missing: string[];                                                        // drawings of the project not read yet
};

const KIND_WORD: Record<PartKind, [string, string]> = { plan: ["plan", "plans"], section: ["section", "sections"], elevation: ["elevation", "elevations"], site: ["site plan", "site plans"], detail: ["detail", "details"], other: ["other drawing", "other drawings"] };
export function containsText(c: Partial<Record<PartKind, number>>): string {
  const order: PartKind[] = ["plan", "section", "elevation", "detail", "site", "other"];
  const out = order.filter((k) => c[k]).map((k) => `${c[k]} ${KIND_WORD[k][c[k] === 1 ? 0 : 1]}`);
  return out.length ? out.join(", ") : "nothing readable";
}

const levelRankSrc = (n?: string) => (n === "level table" ? 3 : n === "level marks on the section" ? 2 : n ? 1 : 0);

/** The other drawings of the project merged: for each fact the best drawing that states it (sections / level tables
 *  first), and where two drawings disagree a note. */
export function mergeFacts(others: ProjectDrawing[]): ProjectFacts {
  const out: ProjectFacts = { drawings: [], beams: {}, beamsFrom: {}, conflicts: [], missing: [] };
  const read = others.filter((d) => d.facts && d.facts.v === FACTS_V) as (ProjectDrawing & { facts: DrawingFacts })[];
  out.missing = others.filter((d) => !d.facts || d.facts.v !== FACTS_V).map((d) => d.name);
  const gave = new Map<string, string[]>();
  const give = (d: ProjectDrawing, what: string) => (gave.get(d.id) ?? gave.set(d.id, []).get(d.id)!).push(what);
  // section: the one with the most floors between its floor lines (a full building section beats a wall section)
  const secs = read.filter((d) => d.facts.section).sort((a, b) => (b.facts.section!.floors ?? 0) - (a.facts.section!.floors ?? 0) || (b.facts.contains.section ?? 0) - (a.facts.contains.section ?? 0));
  if (secs[0]) {
    out.section = secs[0].facts.section!; out.sectionFrom = secs[0].name;
    give(secs[0], `section: floor ${out.section.floorMm} mm, slab ${out.section.slabMm} mm${out.section.beamMm ? `, beams ${out.section.beamMm} mm deep` : ""}`);
    for (const d of secs.slice(1)) {
      const s = d.facts.section!;
      if (Math.abs(s.floorMm - out.section.floorMm) > 50) out.conflicts.push(`Floor height: ${out.section.floorMm} mm in "${secs[0].name}" but ${s.floorMm} mm in "${d.name}".`);
      if (Math.abs(s.slabMm - out.section.slabMm) > 10) out.conflicts.push(`Slab: ${out.section.slabMm} mm in "${secs[0].name}" but ${s.slabMm} mm in "${d.name}".`);
    }
  }
  // level list: a level table, then level marks, then level names; drawings that hold sections / elevations first
  const lv = read.filter((d) => d.facts.levels?.length).sort((a, b) => levelRankSrc(b.facts.levelsNote) - levelRankSrc(a.facts.levelsNote) || ((b.facts.contains.section ?? 0) + (b.facts.contains.elevation ?? 0)) - ((a.facts.contains.section ?? 0) + (a.facts.contains.elevation ?? 0)) || b.facts.levels!.length - a.facts.levels!.length);
  if (lv[0]) {
    out.levels = lv[0].facts.levels; out.levelsFrom = `the ${lv[0].facts.levelsNote ?? "levels"} of "${lv[0].name}"`;
    give(lv[0], `${lv[0].facts.levels!.length} levels (${lv[0].facts.levelsNote})`);
    for (const d of lv.slice(1)) if (Math.abs(d.facts.levels!.length - lv[0].facts.levels!.length) >= 2) out.conflicts.push(`Levels: ${lv[0].facts.levels!.length} in "${lv[0].name}" but ${d.facts.levels!.length} in "${d.name}".`);
  }
  // floors and floor height written in the notes
  const fl = read.filter((d) => d.facts.floors).sort((a, b) => b.facts.floors! - a.facts.floors!);
  if (fl[0]) {
    out.floors = fl[0].facts.floors; out.floorsFrom = fl[0].name; give(fl[0], `${out.floors} floors`);
    const other = fl.find((d) => d.facts.floors !== out.floors);
    if (other) out.conflicts.push(`Number of floors: ${out.floors} in "${fl[0].name}" but ${other.facts.floors} in "${other.name}".`);
  }
  const fh = out.section ? null : read.find((d) => d.facts.floorMm);
  if (out.section) { out.floorMm = out.section.floorMm; out.floorMmFrom = out.sectionFrom; }
  else if (fh) { out.floorMm = fh.facts.floorMm; out.floorMmFrom = fh.name; give(fh, `floor height ${out.floorMm} mm`); }
  // beam schedule: only from drawings that are schedules / sections / details (no floor plans of their own) — a beam
  // mark belongs to its own structure drawing ("B4" of the 3rd–16th floor drawing is not "B4" of the 17th–32nd one).
  // Every mark from the first such drawing that sizes it; a mark sized differently elsewhere is a conflict
  for (const d of read.filter((x) => !x.facts.contains.plan)) {
    let n = 0;
    for (const [k, sz] of Object.entries(d.facts.beams ?? {})) {
      const have = out.beams[k];
      if (!have) { out.beams[k] = sz; out.beamsFrom[k] = d.name; n++; }
      else if (have.b !== sz.b || have.d !== sz.d) out.conflicts.push(`Beam ${k}: ${have.b}×${have.d} in "${out.beamsFrom[k]}" but ${sz.b}×${sz.d} in "${d.name}".`);
    }
    if (n) give(d, `beam schedule (${n} marks)`);
  }
  out.drawings = others.map((d) => ({ id: d.id, name: d.name, what: d.facts ? containsText(d.facts.contains) : "not read yet", gave: gave.get(d.id) ?? [] }));
  if (out.conflicts.length > 12) out.conflicts = [...out.conflicts.slice(0, 12), `… and ${out.conflicts.length - 12} more`];
  return out;
}

/** The project's beam schedule as the reader takes it (empty when none). */
export const projectBeams = (p: ProjectFacts | null | undefined): Record<string, BeamSize> => p?.beams ?? {};
