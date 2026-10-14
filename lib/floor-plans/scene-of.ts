import type { runPanels } from "./run-panels";
import { checkLayout } from "./check-run";
import { buildScene3, type Scene3 } from "./scene3d";
import { partsChecks } from "./parts-check";
import { summarise, type Issue } from "@/lib/design-engine/design-check";

export type Ran = NonNullable<Awaited<ReturnType<typeof runPanels>>>;
/** The formwork of one plan as a 3D scene, at a given floor height (a taller level reuses the typical plan's layout at its own height). */
/** Checks of corners, beam panels and props on a finished scene, numbered P001 …. */
export function partsIssues(r: Ran, scene: Scene3): Issue[] {
  if (r.error || !r.inp || !r.shell) return [];
  const rules = r.layoutRules;
  const rowPitch = ((rules?.deckLengths?.[0] ?? 1200) + (rules?.midBeam ?? 100)) / 1000;
  return partsChecks(scene, { propSpacing: r.opt.propSpacing, rowPitch, slabMm: Number(r.t.params.slabMm) || 150, propKn: rules?.propKn ?? 20, bulkheads: rules?.pk?.beamBulkheads ?? 0 }).map((i, n) => ({ id: `P${String(n + 1).padStart(3, "0")}`, ...i }));
}

/** The design check with the corner, beam-panel and prop checks added (check page, check list). */
export function checkAll(r: Ran) {
  const ck = checkLayout(r); if (!ck) return null;
  const scene = sceneOf(r, undefined, ck); if (!scene) return ck;
  const issues = [...ck.check.issues, ...partsIssues(r, scene)];
  return { zones: ck.zones, check: { ...ck.check, issues, summary: summarise(issues), errors: issues.filter((i) => i.sev === "error").length, warnings: issues.filter((i) => i.sev === "warn").length } };
}

export function sceneOf(r: Ran, floorMm?: number, ckIn?: ReturnType<typeof checkLayout>): Scene3 | null {
  if (r.error || !r.inp || !r.shell) return null;
  const ck = ckIn ?? checkLayout(r)!;
  const scene = buildScene3({
    zoneWalls: r.inp.zoneWalls, zoneGaps: r.inp.zoneGaps, decks: r.inp.decks, zones: ck.zones, faces: r.result.faces, mpp: r.shell.mpp,
    floorHeight: floorMm ? floorMm / 1000 : Number(r.t.params.floorHeight) || 3, slabMm: Number(r.t.params.slabMm) || 150, stdHeight: r.opt.stdHeight, beamDepthMm: Number(r.t.params.beamDepthMm) || 600,
    cols: r.inp.zoneCols, beams3: r.inp.zoneBeam3, stairs: r.inp.zoneStairs, stairOrient: r.inp.zoneStairOrient,
    stairGeo: r.inp.stairs, kickerMm: r.layoutRules?.kickerMm ?? 0, scMm: r.layoutRules ? [r.layoutRules.soffitCornerW, r.layoutRules.soffitCornerLeg] : undefined, icMm: r.layoutRules?.internalCorner, midBeamMm: r.layoutRules?.midBeam, beamSideWidths: r.layoutRules?.wallWidths, ecMm: r.layoutRules?.externalCorner,
    openings: r.inp.zoneOpenings, arch: r.inp.zoneArch, stairLay: r.result.stairs, propSpacing: r.opt.propSpacing, tieH: r.layoutRules?.tieH, tieV: r.layoutRules?.tieV,
    pkWall: r.layoutRules?.pk?.enabled ? { ribHeights: r.layoutRules.pk.ribHeights, ribMax: r.layoutRules.pk.ribMax, tubeHeights: r.layoutRules.pk.tubeHeights, tubeMax: r.layoutRules.pk.tubeMax, ribGap: r.layoutRules.pk.ribGap } : undefined,
  });
  scene.issues = [...ck.check.issues, ...(ckIn ? [] : partsIssues(r, scene))].filter((i) => i.at).map((i) => ({ id: i.id, sev: i.sev, text: `${i.where}: ${i.detail}`, at: [Math.round(i.at![0] * 1000) / 1000, Math.round(i.at![1] * 1000) / 1000], y: i.z ?? scene.H }));
  return scene;
}
