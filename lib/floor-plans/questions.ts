/**
 * Clarifications a formwork designer asks before the design is final — generated from what the measurement found,
 * could not find, or had to assume. Each question says what is assumed meanwhile, so the quote is not held up.
 * The level questions (missing floor plans, basement in or out …) come from building.ts; these are the plan-level ones.
 */
import type { DxfAuto, Takeoff, Totals } from "./calc";
import type { Question } from "./building";
import type { MeasureRules } from "./rules";
import type { SectionLevels } from "./section-read";

export function measureQuestions(t: Takeoff, totals: Totals, auto: DxfAuto | null, rules: MeasureRules, section: SectionLevels | null): Question[] {
  const Q: Question[] = [];
  const ask = (id: string, to: Question["to"], text: string, why: string) => Q.push({ id, to, text, why });
  const p = t.params;
  const scope = p.scope ?? "full";
  const walls = scope === "full" || scope === "vertical";
  const deck = scope === "full" || scope === "framed" || scope === "deck";
  // slab and beams (structural)
  if (deck && !section) ask("m-slab", "structure", `Slab thickness: ${p.slabMm} mm is used (${t.auto?.note?.includes("sections: slab") ? "read from the sections" : "typed in — no section with the slab was found"}). Please confirm the typical slab, and any thicker slabs (toilets sunk, balconies, lift machine room).`, "Slab thickness sets the clear wall height and the deck / beam-side areas.");
  if (deck && section && section.finishMm) ask("m-finish", "structure", `Sections show ${section.totalMm} mm floor to soffit with a ${section.finishMm} mm finish on top: ${section.slabMm} mm concrete slab is used. Confirm the structural slab is ${section.slabMm} mm.`, "Only the concrete slab is formed; the finish is not.");
  const beamsOnPlan = (auto?.beamSized?.length ?? 0) + (auto?.beamLineLength ?? 0) > 0 || (t.beams?.length ?? 0) > 0;
  if (deck && beamsOnPlan && p.beamDepthMm == null && !(auto?.beamSized?.length)) ask("m-beam", "structure", `Beams are drawn but no beam sizes were found on the plan: ${600} mm depth is assumed. Please send the beam schedule (width × depth) or the structural framing plan.`, "Beam depth sets the beam-side formwork and the prop layout.");
  if (deck && !beamsOnPlan && (auto?.edgeBeamLength ?? 0) > 2) ask("m-edge", "structure", `${Math.round(auto!.edgeBeamLength!)} m of slab edge has no wall under it (balcony fronts, open edges): ${p.beamDepthMm ?? 600} mm deep edge beams are assumed there. Confirm the edge beam / drop size.`, "Open slab edges need an edge beam or a thicker slab band.");
  if (walls && auto?.wallPairs) {
    const thk = Object.entries(auto.wallPairs.byThk).filter(([, v]) => v >= 1).map(([k, v]) => `${k} mm (${Math.round(v)} m)`);
    if (thk.length > 3) ask("m-thk", "structure", `Walls of ${thk.length} thicknesses were found: ${thk.join(", ")}. Please confirm which are RCC shear walls and which are block / brick (non-structural).`, "Only RCC walls are formed; block walls are left out or quoted as an option.");
    const odd = Object.keys(auto.wallPairs.byThk).map(Number).filter((k) => auto.wallPairs!.byThk[k] >= 1 && (k === 115 || k === 230 || k === 110 || k === 75));
    if (odd.length) ask("m-brick", "structure", `${odd.map((k) => `${k} mm`).join(" / ")} walls look like brick / block sizes. Confirm they are not RCC (they are ${(p.minWallMm ?? 0) > 75 ? "left out of" : "included in"} the formwork at the moment).`, "Brick-size walls are usually masonry built after the formwork.");
    if (auto.wallPairs.unpaired > 20) ask("m-loose", "architect", `About ${Math.round(auto.wallPairs.unpaired)} m of wall lines could not be paired into walls (single lines). Please send the plan with wall thicknesses, or the structural wall layout.`, "Single lines may be glazing, railings or wall centre-lines; they are not counted.");
  }
  if (walls && (totals.wall_length ?? 0) > 0 && (auto?.gapCount ?? 0) === 0 && !(auto?.wallOpenings?.length)) ask("m-doors", "architect", "No door / window openings were found in the walls. Please send the plan with doors and windows (or the opening schedule) so lintels, sills and reveals can be measured.", "Openings change the wall area, lintel undersides and sill walls.");
  if (walls && (auto?.windowGaps?.count ?? 0) > 0 && p.sillMm == null) ask("m-sill", "architect", `${auto!.windowGaps!.count} window openings found: a ${900} mm sill height and ${Math.round(((p.floorHeight || 3) * 1000 - (p.slabMm || 150)) - 2100)} mm lintel depth are assumed. Please confirm sill and lintel levels from the window schedule.`, "Sill walls under windows and lintel undersides over them are formed with the wall panels.");
  if (walls && (auto?.parapetRings?.length ?? 0) > 0) ask("m-parapet", "architect", `${auto!.parapetRings!.length} balcony parapets / planters found: ${p.parapetMm ?? 800} mm high RCC upstands are assumed. Confirm the parapet height and that it is RCC (not railing / block).`, "RCC parapets are formed as upstands with both faces; railings are not.");
  if (deck && (auto?.sunk?.length ?? 0) === 0 && (auto?.wetRooms?.length ?? 0) > 0) ask("m-sunk", "structure", `${auto!.wetRooms!.length} toilets / wet areas found but no sunk slab is drawn: ${rules.wetKerbMm} mm kerbs are assumed at their walls. Confirm sunk depth (e.g. 150–300 mm) or kerb height.`, "Sunk slabs add drop edges; kerbs add small upstands.");
  if (deck && (auto?.openingLoops?.length ?? 0) === 0 && (totals.plan_area ?? 0) > 200) ask("m-ducts", "architect", "No ducts / shafts / lift wells were found as cut-outs in the slab. Please confirm the duct and lift positions and sizes.", "Cut-outs are deducted from the deck and add slab-edge formwork.");
  if ((auto?.stairCount ?? 0) === 0 && (totals.plan_area ?? 0) > 150) ask("m-stair", "architect", "No staircase was found on the plan. Please confirm the stair position, flights and whether the stair is cast with the formwork or precast / later.", "Each staircase adds flight soffits, risers and landings to the set.");
  else if ((auto?.stairCount ?? 0) > 0 && !(auto?.stairsMeasured?.length) && rules.stairs) ask("m-stair2", "architect", `${auto!.stairCount} staircase(s) found but the treads could not be read: ${rules.stairAllowanceM2} m² per staircase is allowed. Please send the staircase detail (risers, tread, width, landing).`, "Measured flights replace the allowance.");
  if ((auto?.columns?.length ?? 0) === 0 && (t.columns?.length ?? 0) === 0 && scope !== "vertical") ask("m-cols", "structure", "No columns were found — the building is taken as a shear-wall structure (walls carry the load). Please confirm, or send the column schedule.", "Column panels are a separate set of pieces.");
  if (walls && (totals.wall_length ?? 0) > 0 && p.floorHeight && section && Math.abs(section.floorMm - Math.round(p.floorHeight * 1000)) > 10) ask("m-fh", "architect", `Floor height: the sections show ${section.floorMm} mm but ${Math.round(p.floorHeight * 1000)} mm is used. Which is right?`, "The floor height sets every wall panel height.");
  // what the client must settle
  ask("m-scope", "client", `Scope used: ${SCOPE_TEXT[scope]}. Confirm, and confirm the number of sets (one set per block, or one set shared between blocks).`, "Scope and sets decide the quoted quantity.");
  if ((totals.quote_area ?? 0) > 0 && (p.extraPct ?? rules.extraPct) > 0) ask("m-extra", "client", `${p.extraPct ?? rules.extraPct} % is added for wastage / specials. Confirm this basis for the quote.`, "Standard allowance on top of the measured contact area.");
  return Q;
}
const SCOPE_TEXT: Record<string, string> = { full: "full aluminium formwork — walls, columns, slab, beams, stairs", vertical: "vertical only — walls and columns", columns: "columns only", framed: "slab, beams and columns", deck: "slab and beams only" };
