import type { runPanels } from "./run-panels";
import { checkLayout } from "./check-run";
import { buildScene3, type Scene3 } from "./scene3d";

export type Ran = NonNullable<Awaited<ReturnType<typeof runPanels>>>;
/** The formwork of one plan as a 3D scene, at a given floor height (a taller level reuses the typical plan's layout at its own height). */
export function sceneOf(r: Ran, floorMm?: number): Scene3 | null {
  if (r.error || !r.inp || !r.shell) return null;
  const ck = checkLayout(r)!;
  const scene = buildScene3({
    zoneWalls: r.inp.zoneWalls, zoneGaps: r.inp.zoneGaps, decks: r.inp.decks, zones: ck.zones, faces: r.result.faces, mpp: r.shell.mpp,
    floorHeight: floorMm ? floorMm / 1000 : Number(r.t.params.floorHeight) || 3, slabMm: Number(r.t.params.slabMm) || 150, stdHeight: r.opt.stdHeight, beamDepthMm: Number(r.t.params.beamDepthMm) || 600,
    cols: r.inp.zoneCols, beams3: r.inp.zoneBeam3, stairs: r.inp.zoneStairs,
    stairGeo: r.inp.stairs, kickerMm: r.layoutRules?.kickerMm ?? 0, scMm: r.layoutRules ? [r.layoutRules.soffitCornerW, r.layoutRules.soffitCornerLeg] : undefined, icMm: r.layoutRules?.internalCorner, ecMm: r.layoutRules?.externalCorner,
    openings: r.inp.zoneOpenings, arch: r.inp.zoneArch, stairLay: r.result.stairs, propSpacing: r.opt.propSpacing, tieH: r.layoutRules?.tieH, tieV: r.layoutRules?.tieV,
  });
  scene.issues = ck.check.issues.filter((i) => i.at).map((i) => ({ id: i.id, sev: i.sev, text: `${i.where}: ${i.detail}`, at: [Math.round(i.at![0] * 1000) / 1000, Math.round(i.at![1] * 1000) / 1000], y: i.z ?? scene.H }));
  return scene;
}
