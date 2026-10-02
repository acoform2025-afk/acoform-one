import { buildZones, type runPanels } from "./run-panels";
import { wallPanelNumbers } from "./zones";
import { packingByZone } from "./packing";
import { accessoriesCsv, csvRow, csvText, faceZones, mainListCsv, walersCsv, zoneAreas } from "./package";
import { fabSpec, specialsFromBom } from "@/lib/design-engine/fabrication";
import { designCheck, ISSUE_LABEL } from "@/lib/design-engine/design-check";

type Ran = NonNullable<Awaited<ReturnType<typeof runPanels>>>;
export type PackageFile = { key: string; name: string; title: string; csv: string };

/** Every Excel list of the design package, built from one layout run. */
export function buildPackage(r: Ran, areasK: number): PackageFile[] | null {
  if (r.error || !r.inp || !r.shell || !r.result) return null;
  const title = r.plan.name;
  const zones = (r.zones ?? buildZones(r.inp, r.catalog, r.layoutRules));
  const wallCode = (w: number) => r.catalog.find((c) => c.panel_category === "wall_panel" && Number(c.width_mm) === w && Number(c.height_mm) === r.opt.stdHeight)?.panel_code ?? `WP-${w}-${r.opt.stdHeight}`;
  const wallPanels = wallPanelNumbers(r.result.faces, r.opt.stdHeight, wallCode);
  const areaOf = zoneAreas(zones, areasK);
  const zoneOfFace = faceZones(zones, r.result.faces, r.shell.mpp, r.inp.zoneWalls);
  const rules = r.layoutRules ?? null;
  const cat = new Map(r.catalog.map((c) => [c.panel_code, c]));
  const kgOf = (code: string, w: number, h: number) => { const c = cat.get(code); return c && Number(c.weight_kg) > 0 ? Number(c.weight_kg) : fabSpec(code, "", w, h, 1).kgEach; };
  const files: PackageFile[] = [];
  files.push({ key: "main", name: "03_Main panel list by area", title: "Main panel list by area", csv: mainListCsv({ bom: r.result.bom, zones, areaOf, wallPanels, zoneOfFace, title, rules }) });

  // numbering list (installation drawing)
  const num = [csvRow(["Panel No.", "Area", "Zone / face", "Type", "Code", "Width mm", "Length / height mm", "Special"])];
  for (const z of zones) for (const p of z.panels) num.push(csvRow([p.no, areaOf.get(z.code) ?? "", z.code, "Deck", p.code, p.w, p.L, p.custom ? "yes" : ""]));
  for (const w of wallPanels) { const z = zoneOfFace(w.face); num.push(csvRow([w.no, (z && areaOf.get(z)) || "", w.face, "Wall", w.code, w.w, w.h, /^WF|^WT/.test(w.code) ? "yes" : ""])); }
  files.push({ key: "numbering", name: "02_Panel numbering list", title: "Panel numbering list", csv: csvText(num) });

  // special panels production order
  const specs = specialsFromBom(r.result.bom);
  const prod = [csvRow(["Mark", "Code", "Description", "Width mm", "Height / length mm", "Nos", "Panel kg", "Total kg", "Holes (height edge)", "Holes (width edge)", "Notes"])];
  specs.forEach((s, i) => prod.push(csvRow([`SP-${String(i + 1).padStart(2, "0")}`, s.code, s.description, s.w, s.h, s.qty, s.kgEach, (s.kgEach * s.qty).toFixed(1), s.holesH.join(" "), s.holesW.join(" "), s.warnings.join(" ")])));
  files.push({ key: "production", name: "04_Special panels production order", title: "Special panels production order", csv: csvText(prod) });

  files.push({ key: "walers", name: "05_Walers list", title: "Walers / back stiffeners list", csv: walersCsv(r.result.faces, rules, title) });

  // drop formwork & staircase lines are in the main list; support heads and accessories here
  files.push({ key: "accessories", name: "08_Accessories list", title: "Accessories (with loss %, support-head sets)", csv: accessoriesCsv(r.result.bom, title, rules) });

  // packing list by zone
  const packs = packingByZone({ zones, faces: r.result.faces, mpp: r.shell.mpp, walls: r.inp.zoneWalls, wallPanels, kgOf });
  const pk = [csvRow([`PACKING LIST BY ZONE — ${title}`]), "", csvRow(["Bundle", "Area", "Type", "Code", "Width mm", "Height / length mm", "Qty", "kg each", "kg total", "Panel numbers"])];
  for (const p of packs) {
    for (const l of p.lines) pk.push(csvRow([p.zone, areaOf.get(p.zone) ?? "", l.kind, l.code, l.w, l.h, l.qty, l.kgEach, Math.round(l.kgEach * l.qty * 10) / 10, l.nos.join(" ")]));
    pk.push(csvRow([`${p.zone} total`, "", "", "", "", "", p.pcs, "", p.kg, ""]));
  }
  files.push({ key: "packing", name: "09_Packing list by zone", title: "Packing list by zone", csv: csvText(pk) });

  // design check
  const H = Math.max(0, (Number(r.t.params.floorHeight) || 0) - (Number(r.t.params.slabMm) || 0) / 1000) * 1000;
  const ck = designCheck({ faces: r.result.faces, mpp: r.shell.mpp, walls: r.inp.zoneWalls, gaps: r.inp.zoneGaps, zones, specs, H, stdHeight: r.opt.stdHeight, deckCount: 0, slabCount: r.inp.decks.length });
  const cl = [csvRow(["No.", "Severity", "Check", "Where", "Problem"])];
  for (const i of ck.issues) cl.push(csvRow([i.id, i.sev === "error" ? "ERROR" : "WARNING", ISSUE_LABEL[i.kind], i.where, i.detail]));
  files.push({ key: "check", name: "10_Design check", title: "Design check", csv: csvText(cl) });
  return files;
}
