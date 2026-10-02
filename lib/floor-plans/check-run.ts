import { designCheck } from "@/lib/design-engine/design-check";
import { specialsFromBom } from "@/lib/design-engine/fabrication";
import { buildZones, type runPanels } from "./run-panels";

type Ran = NonNullable<Awaited<ReturnType<typeof runPanels>>>;

/** Zones + design check of a loaded layout (shared by the check page, the 3D model and the CSV). */
export function checkLayout(r: Ran) {
  if (r.error || !r.inp || !r.shell) return null;
  const zones = buildZones(r.inp, r.catalog);
  const H = Math.max(0, (Number(r.t.params.floorHeight) || 0) - (Number(r.t.params.slabMm) || 0) / 1000) * 1000;
  const check = designCheck({
    faces: r.result.faces, mpp: r.shell.mpp, walls: r.inp.zoneWalls, gaps: r.inp.zoneGaps, zones,
    specs: specialsFromBom(r.result.bom), H, stdHeight: r.opt.stdHeight,
    deckCount: zones.reduce((a, z) => a + z.panels.length, 0), slabCount: r.inp.decks.length,
  });
  return { zones, check };
}
