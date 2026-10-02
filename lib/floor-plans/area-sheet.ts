/**
 * Turns a take-off result into the rows of ACOFORM's "tentative area calculation" sheet
 * (1 slab − wall tops − ducts · 2 walls · 3 beams · 4 staircase · 5 columns …).
 */
import type { DxfAuto, Pt, Takeoff, Totals } from "./calc";
import type { SheetGeo, SheetSection } from "@/lib/pdf/area-sheet-document";

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
const m3 = (mm: number) => (mm / 1000).toString();

export function sheetSections(t: Takeoff, totals: Totals, auto: DxfAuto | null): SheetSection[] {
  const it = totals.items;
  const sum = (pred: (i: Totals["items"][number]) => boolean) => it.filter(pred).reduce((s, i) => s + i.area, 0);
  const H = Math.round((t.params.floorHeight || 0) * 1000), tS = Math.round(t.params.slabMm || 0);
  const out: SheetSection[] = [];
  let no = 0;

  // 1 slab
  const slab = sum((i) => i.group === "slab");
  const duct = -sum((i) => i.group === "deduct" && i.code !== "WT" && i.code !== "CT");
  const wt = totals.wall_top_area, ct = -sum((i) => i.code === "CT");
  const edge = totals.slab_edge;
  const ded = [wt, duct, ct].filter((x, k) => k < 2 || x > 0);
  const lines = [`SLAB AREA = ${f2(slab)}`, `WALL TOP AREA= ${f2(wt)}`, ...(ct > 0 ? [`COLUMN TOP AREA= ${f2(ct)}`] : []), `DUCT AREA= ${f2(duct)}`];
  if (edge > 0) lines.push(`SLAB & DUCT EDGES = ${f2(edge)}`);
  out.push({
    no: ++no, key: "slab", title: "CONCRETE AREA FOR SLAB", heading: "SLAB", lines,
    total: `TOTAL SLAB AREA =${f2(slab)}-(${ded.map(f2).join("+")})${edge > 0 ? `+${f2(edge)}` : ""} =${f2(totals.slab_soffit + edge)}Sqm`,
    value: totals.slab_soffit + edge, figure: f2(slab), panes: ["slab", "duct", "walltop"],
  });

  // 2 walls (upstands / balcony parapets are listed on their own below)
  const ups = it.filter((i) => i.group === "wall" && /^U\d/.test(i.code));
  const upA = ups.reduce((s, i) => s + i.area, 0);
  const wallA = totals.wall_area - upA;
  const faces = totals.wall_length * 2;
  const plain = faces * (H - tS) / 1000;
  const wl = [`FLOOR HEIGHT = ${H}`, `SLAB THICKNESS = ${tS}`, `WALL LENGTH = ${f2(faces)}`];
  const doors = wallA - plain;
  if (Math.abs(doors) > 0.01) wl.push(`OPENINGS (net: doors / windows, reveals, sills) = ${f2(doors)}`);
  out.push({
    no: ++no, key: "wall", title: "CONCRETE AREA FOR WALL", heading: "WALL LENGTH", lines: wl,
    total: `TOTAL WALL AREA =${f2(faces)} X (${m3(H)} - ${m3(tS)})${Math.abs(doors) > 0.01 ? ` ${doors > 0 ? "+" : "-"} ${f2(Math.abs(doors))}` : ""} = ${f3(wallA)}Sqm`,
    value: wallA, figure: f2(faces), panes: ["walls"],
  });
  if (ups.length) {
    out.push({
      no: ++no, key: "upstand", title: "CONCRETE AREA FOR UPSTAND", heading: "UPSTAND / PARAPET",
      lines: ups.slice(0, 6).map((u) => `${u.label.replace(/ \(railing on the drawing\)/, "")}: ${u.calc.replace(/ \(parapet height\)/, "")}`),
      total: `TOTAL UPSTAND AREA = ${f2(upA)}Sqm`, value: upA, figure: f2(upA), panes: ["none"],
    });
  }

  // 3 beams
  if (totals.beam_area > 0) {
    const beams = it.filter((i) => i.group === "beam");
    const D = Number(t.params.beamDepthMm) || 600;
    const entered = t.params.beamLenM != null && String(t.params.beamLenM) !== "" ? Number(t.params.beamLenM) : null;
    const autoOnly = entered != null || (beams.length === 1 && /auto/.test(beams[0].label) && !!auto?.gapSpan);
    const L = entered ?? (autoOnly ? 2 * (auto!.gapSpan ?? 0) : 0);
    out.push({
      no: ++no, key: "beam", title: "CONCRETE AREA FOR BEAM", heading: "BEAM LENGTH",
      lines: autoOnly ? [`SLAB THICKNESS = ${tS}`, `BEAM DEPTH = ${D}`, `BEAM LENGTH = ${f2(L)}`, ...(entered == null ? [`(both sides of ${auto!.gapCount} openings)`] : [])] : [`SLAB THICKNESS = ${tS}`, ...beams.slice(0, 6).map((b) => `${b.code}: ${b.calc}`)],
      total: autoOnly ? `TOTAL BEAM AREA = ${f2(L)}X (${m3(D)} - ${m3(tS)}) = ${f2(totals.beam_area)}Sqm` : `TOTAL BEAM AREA = ${f2(totals.beam_area)}Sqm`,
      value: totals.beam_area, figure: autoOnly ? f2(L) : f2(totals.beam_area), panes: ["beams"],
    });
  }

  // 4 staircase / other lump sums
  const extras = it.filter((i) => i.group === "extra");
  if (extras.length) {
    const v = extras.reduce((s, i) => s + i.area, 0);
    out.push({
      no: ++no, key: "stair", title: "CONCRETE AREA FOR STAIRCASE", heading: "STAIRCASE",
      lines: extras.slice(0, 6).map((e) => `${e.code} =${f2(e.area)}${/allowance|lump/.test(e.label + e.calc) ? "" : ` (${e.calc})`}`),
      total: `TOTAL STAIRCASE AREA = ${f2(v)}`, value: v, figure: f2(v), panes: ["stairs"],
    });
  }

  // 5 columns
  if (totals.column_area > 0) {
    out.push({
      no: ++no, key: "col", title: "CONCRETE AREA FOR COLUMN", heading: "COLUMNS",
      lines: [`COLUMNS = ${totals.column_count} nos`, ...totals.column_sizes.slice(0, 5).map((c) => `${c.qty} × ${c.size}`), `HEIGHT = ${m3(H)} - ${m3(tS)}`],
      total: `TOTAL COLUMN AREA = ${f2(totals.column_area)}Sqm`, value: totals.column_area, figure: `${totals.column_count} nos`, panes: ["columns"],
    });
  }
  // lofts / ledges
  const loft = it.filter((i) => i.group === "loft");
  if (loft.length) {
    const v = loft.reduce((s, i) => s + i.area, 0);
    out.push({ no: ++no, key: "loft", title: "CONCRETE AREA FOR LOFT / LEDGE", heading: "LOFT", lines: loft.slice(0, 6).map((l) => `${l.code}: ${l.calc}`), total: `TOTAL LOFT AREA = ${f2(v)}Sqm`, value: v, figure: f2(v), panes: ["none"] });
  }
  return out;
}

/** Geometry for the sheet's small drawings (drawing units), from the automatic DXF quantities. */
export function sheetGeo(auto: DxfAuto | null): SheetGeo | null {
  if (!auto || !(auto.wallRings?.length || auto.wallLoose?.length)) return null;
  const all: Pt[] = [...(auto.wallRings ?? []).flat(), ...(auto.wallLoose ?? []).flat(), ...(auto.slabLoops ?? []).flat()];
  if (!all.length) return null;
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  return {
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    walls: auto.wallRings ?? [], wallLines: auto.wallLoose ?? [],
    slab: auto.slabLoops ?? [], ducts: auto.openingLoops ?? [],
    gaps: (auto.gaps ?? []).map((g) => [g.a, g.b] as [Pt, Pt]),
    stairs: auto.stairBoxes ?? [], columns: auto.columnRings ?? [],
    parapets: auto.parapetRings ?? [], edgeBeams: auto.edgeBeams ?? [],
  };
}
