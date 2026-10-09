/**
 * Vector drawings for the quotation PDF, built from the measured drawing:
 *  • PlanFigure   — the floor plan with every measured element in its own colour (walls, slab, ducts, beams over
 *                   openings, edge beams, balcony parapets, columns, stairs) + legend
 *  • IsoFigure    — isometric view of the concrete walls / parapets / columns / beams of the typical floor (what the
 *                   formwork forms), drawn from the same outlines
 *  • SectionFigure — a typical wall–slab–beam–parapet section with the formed faces marked and the plan's own
 *                   heights written on it
 * All are react-pdf <Svg>, so they print sharp at any size.
 */
import { G, Line, Path, Polygon, Rect, Svg, Text as SvgText } from "@react-pdf/renderer";
import type { Pt } from "@/lib/floor-plans/calc";
import type { SheetGeo } from "./area-sheet-document";

export const FIG = {
  wall: { fill: "#c7d2fe", stroke: "#3730a3", label: "Concrete walls (both faces formed)" },
  parapet: { fill: "#e9d5ff", stroke: "#7e22ce", label: "Balcony parapets (upstand)" },
  slab: { fill: "#f0fdf4", stroke: "#15803d", label: "Slab outline (deck)" },
  duct: { fill: "#fee2e2", stroke: "#b91c1c", label: "Ducts / openings (deducted)" },
  gap: { stroke: "#ea580c", label: "Beams over doors / windows" },
  edge: { stroke: "#0e7490", label: "Edge beams (balcony / slab edge)" },
  column: { fill: "#fde68a", stroke: "#b45309", label: "Columns" },
  stair: { fill: "#e5e7eb", stroke: "#6b7280", label: "Staircases" },
};

const path = (r: Pt[], tx: (p: Pt) => [number, number], closed = true) => r.map((p, i) => { const [x, y] = tx(p); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ") + (closed ? " Z" : "");

/** Fit the drawing box into w × h (points), y flipped (drawing y up → page y down). */
function fitter(box: [number, number, number, number], w: number, h: number, pad = 6) {
  const bw = Math.max(1, box[2] - box[0]), bh = Math.max(1, box[3] - box[1]);
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = pad + ((w - 2 * pad) - bw * k) / 2, oy = pad + ((h - 2 * pad) - bh * k) / 2;
  return { k, tx: (p: Pt): [number, number] => [ox + (p[0] - box[0]) * k, oy + (box[3] - p[1]) * k] };
}

export function PlanFigure({ geo, w, h, legend = true }: { geo: SheetGeo; w: number; h: number; legend?: boolean }) {
  const legendH = legend ? 30 : 0;
  const { k, tx } = fitter(geo.box, w, h - legendH);
  const sw = Math.max(0.3, Math.min(1.2, k * 60));
  const items = [
    geo.slab.length ? FIG.slab : null, geo.walls.length || geo.wallLines.length ? FIG.wall : null, geo.parapets?.length ? FIG.parapet : null,
    geo.ducts.length ? FIG.duct : null, geo.gaps.length ? FIG.gap : null, geo.edgeBeams?.length ? FIG.edge : null, geo.columns.length ? FIG.column : null, geo.stairs.length ? FIG.stair : null,
  ].filter(Boolean) as { fill?: string; stroke: string; label: string }[];
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {geo.slab.map((r, i) => <Path key={`s${i}`} d={path(r, tx)} fill={FIG.slab.fill} stroke={FIG.slab.stroke} strokeWidth={sw} />)}
      {geo.walls.map((r, i) => <Path key={`w${i}`} d={path(r, tx)} fill={FIG.wall.fill} stroke={FIG.wall.stroke} strokeWidth={sw * 0.6} />)}
      {geo.wallLines.map((r, i) => <Path key={`l${i}`} d={path(r, tx, false)} stroke={FIG.wall.stroke} strokeWidth={sw * 0.6} fill="none" />)}
      {(geo.parapets ?? []).map((r, i) => <Path key={`p${i}`} d={path(r, tx)} fill={FIG.parapet.fill} stroke={FIG.parapet.stroke} strokeWidth={sw * 0.6} />)}
      {geo.columns.map((r, i) => <Path key={`c${i}`} d={path(r, tx)} fill={FIG.column.fill} stroke={FIG.column.stroke} strokeWidth={sw * 0.6} />)}
      {geo.ducts.map((r, i) => <Path key={`d${i}`} d={path(r, tx)} fill={FIG.duct.fill} stroke={FIG.duct.stroke} strokeWidth={sw * 0.8} />)}
      {geo.stairs.map((b, i) => { const [x0, y0] = tx([b[0], b[3]]), [x1, y1] = tx([b[2], b[1]]); return <Rect key={`st${i}`} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={FIG.stair.fill} stroke={FIG.stair.stroke} strokeWidth={sw * 0.6} />; })}
      {(geo.edgeBeams ?? []).map(([a, b], i) => { const [x0, y0] = tx(a), [x1, y1] = tx(b); return <Line key={`e${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke={FIG.edge.stroke} strokeWidth={sw * 2.2} />; })}
      {geo.gaps.map(([a, b], i) => { const [x0, y0] = tx(a), [x1, y1] = tx(b); return <Line key={`g${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke={FIG.gap.stroke} strokeWidth={sw * 2} />; })}
      {legend ? (
        <G>
          {items.map((it, i) => {
            const col = i % 4, row = Math.floor(i / 4), x = 8 + col * (w - 16) / 4, y = h - legendH + 6 + row * 12;
            return (
              <G key={it.label}>
                {it.fill ? <Rect x={x} y={y} width={9} height={7} fill={it.fill} stroke={it.stroke} strokeWidth={0.6} /> : <Line x1={x} y1={y + 3.5} x2={x + 9} y2={y + 3.5} stroke={it.stroke} strokeWidth={2} />}
                <SvgText x={x + 12} y={y + 6} style={{ fontSize: 6.5, fontFamily: "Carlito" }} fill="#333">{it.label}</SvgText>
              </G>
            );
          })}
        </G>
      ) : null}
    </Svg>
  );
}

/** Isometric view: wall / parapet / column outlines extruded to their heights (metres), drawn back to front. */
export function IsoFigure({ geo, H, parapetH, w, h, unitToM = 0.001, slabM = 0.15 }: { geo: SheetGeo; H: number; parapetH: number; w: number; h: number; unitToM?: number; slabM?: number }) {
  // drawing units → metres, then isometric: X = (x − y)·cos30, Y = (x + y)·sin30 − z
  const m = (p: Pt): [number, number] => [(p[0] - geo.box[0]) * unitToM, (p[1] - geo.box[1]) * unitToM];
  const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
  const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * c30, (x + y) * s30 - z];
  type Face = { pts: [number, number][]; fill: string; stroke: string; depth: number };
  const faces: Face[] = [];
  const prism = (r: Pt[], z: number, fill: string, dark: string, darker: string, stroke: string, z0 = 0) => {
    const P = r.map(m); const n = P.length; if (n < 3) return;
    // winding so the side shading is consistent
    let area = 0; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const ccw = area > 0;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const nx = ccw ? dy : -dy, ny = ccw ? -dx : dx;           // outward normal
      if (nx + ny <= 0) continue;                                // faces away from the viewer (viewer at +x +y)
      const shade = nx > ny ? dark : darker;
      faces.push({ pts: [iso(a[0], a[1], z0), iso(b[0], b[1], z0), iso(b[0], b[1], z), iso(a[0], a[1], z)], fill: shade, stroke, depth: (a[0] + a[1] + b[0] + b[1]) / 2 });
    }
    faces.push({ pts: P.map((p) => iso(p[0], p[1], z)), fill, stroke, depth: P.reduce((s2, p) => s2 + p[0] + p[1], 0) / n + z * 0.01 + 50 });
  };
  for (const r of geo.slab) faces.push({ pts: r.map(m).map((p) => iso(p[0], p[1], 0)), fill: "#f3f4f6", stroke: "#9ca3af", depth: -1e9 });
  for (const r of geo.walls) prism(r, H, "#c7d2fe", "#a5b4fc", "#818cf8", "#3730a3");
  for (const r of geo.parapets ?? []) prism(r, parapetH, "#e9d5ff", "#d8b4fe", "#c084fc", "#7e22ce");
  for (const r of geo.columns) prism(r, H, "#fde68a", "#fcd34d", "#f59e0b", "#b45309");
  // beams hang under the slab: from the soffit (H) down by their depth below the slab
  (geo.beams ?? []).forEach((r, i) => { const d = (geo.beamDepths?.[i] ?? 600) / 1000; prism(r, H, "#d6b48a", "#c19a6b", "#a47a4b", "#7c4a1e", Math.max(0, H - Math.max(0.1, d - slabM))); });
  faces.sort((a, b) => a.depth - b.depth);
  const all = faces.flatMap((f) => f.pts);
  if (!all.length) return null;
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const bw = Math.max(1e-6, box[2] - box[0]), bh = Math.max(1e-6, box[3] - box[1]), pad = 6;
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh), ox = pad + ((w - 2 * pad) - bw * k) / 2, oy = pad + ((h - 2 * pad) - bh * k) / 2;
  const T = (p: [number, number]) => `${(ox + (p[0] - box[0]) * k).toFixed(1)},${(oy + (p[1] - box[1]) * k).toFixed(1)}`;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {faces.map((f, i) => <Polygon key={i} points={f.pts.map(T).join(" ")} fill={f.fill} stroke={f.stroke} strokeWidth={0.35} />)}
    </Svg>
  );
}

/** Typical section through an external wall, slab, door beam and balcony parapet; formed faces in orange. */
export function SectionFigure({ floorMm, slabMm, beamMm, parapetMm, doorMm = 2100, w, h, thin = false }: { floorMm: number; slabMm: number; beamMm: number; parapetMm: number; doorMm?: number; w: number; h: number; thin?: boolean }) {
  // scale: floor height + slab + parapet fits h
  const totalMm = floorMm + slabMm + Math.max(parapetMm, 300) + 300, k = (h - 24) / totalMm;
  const X0 = 40, ground = h - 14;                                 // page y of the lower slab top (FFL)
  const Y = (mm: number) => ground - mm * k;                      // mm above FFL → page y
  const wallT = 150 * k, beamW = 200 * k;
  const conc = "#d1d5db", concS = "#4b5563", formed = "#ef9d2f";
  const F = (x1: number, y1: number, x2: number, y2: number, key: string) => <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={formed} strokeWidth={2.2} />;
  const slabTop = Y(floorMm), slabBot = Y(floorMm - slabMm), wallTop = slabBot;
  const xw = X0 + 90;                                              // external wall left face
  const xDoor = xw + wallT + 70, xBal = X0;                         // door beam position, balcony edge
  const upT = Y(parapetMm) ;                                        // parapet top (on lower slab, balcony side)
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* lower slab (FFL) */}
      <Rect x={xBal} y={ground} width={w - xBal - 8} height={slabMm * k} fill={conc} stroke={concS} strokeWidth={0.6} />
      {/* balcony parapet on the lower slab */}
      <Rect x={xBal + 10} y={upT} width={wallT} height={ground - upT} fill={conc} stroke={concS} strokeWidth={0.6} />
      {F(xBal + 10, upT, xBal + 10, ground, "p1")}{F(xBal + 10 + wallT, upT, xBal + 10 + wallT, ground, "p2")}
      <SvgText x={xBal + 14 + wallT} y={(upT + ground) / 2} style={{ fontSize: 6, fontFamily: "Carlito" }} fill="#333">{`Parapet ${parapetMm}`}</SvgText>
      {/* external wall, full height to the slab above */}
      <Rect x={xw} y={wallTop} width={wallT} height={ground - wallTop} fill={conc} stroke={concS} strokeWidth={0.6} />
      {F(xw, wallTop, xw, ground, "w1")}{F(xw + wallT, wallTop, xw + wallT, ground, "w2")}
      <SvgText x={xw - 36} y={(wallTop + ground) / 2} style={{ fontSize: 6, fontFamily: "Carlito" }} fill="#333">{`Wall ${floorMm - slabMm}`}</SvgText>
      {/* upper slab */}
      <Rect x={xBal} y={slabTop} width={w - xBal - 8} height={slabBot - slabTop} fill={conc} stroke={concS} strokeWidth={0.6} />
      {F(xw + wallT, slabBot, xDoor, slabBot, "d1")}{F(xDoor + beamW, slabBot, w - 8, slabBot, "d2")}{F(xBal, slabBot, xBal + 10, slabBot, "d0")}{F(xBal + 10 + wallT, slabBot, xw, slabBot, "d3")}
      <SvgText x={w - 70} y={slabTop - 3} style={{ fontSize: 6, fontFamily: "Carlito" }} fill="#333">{`Slab ${slabMm} · deck below`}</SvgText>
      {/* edge beam at the balcony edge (under the upper slab) */}
      <Rect x={xBal} y={slabBot} width={beamW} height={(beamMm - slabMm) * k} fill={conc} stroke={concS} strokeWidth={0.6} />
      {F(xBal, slabTop, xBal, slabBot + (beamMm - slabMm) * k, "e1")}{F(xBal + beamW, slabBot, xBal + beamW, slabBot + (beamMm - slabMm) * k, "e2")}{F(xBal, slabBot + (beamMm - slabMm) * k, xBal + beamW, slabBot + (beamMm - slabMm) * k, "e3")}
      <SvgText x={xBal + beamW + 3} y={slabBot + (beamMm - slabMm) * k - 2} style={{ fontSize: 6, fontFamily: "Carlito" }} fill="#333">{`Edge beam ${beamMm}`}</SvgText>
      {/* beam over a door */}
      <Rect x={xDoor} y={slabBot} width={beamW} height={(beamMm - slabMm) * k} fill={conc} stroke={concS} strokeWidth={0.6} />
      {F(xDoor, slabBot, xDoor, slabBot + (beamMm - slabMm) * k, "b1")}{F(xDoor + beamW, slabBot, xDoor + beamW, slabBot + (beamMm - slabMm) * k, "b2")}{F(xDoor, slabBot + (beamMm - slabMm) * k, xDoor + beamW, slabBot + (beamMm - slabMm) * k, "b3")}
      <SvgText x={xDoor + beamW + 3} y={slabBot + (beamMm - slabMm) * k - 2} style={{ fontSize: 6, fontFamily: "Carlito" }} fill="#333">{`Beam over door ${beamMm}`}</SvgText>
      <Line x1={xDoor + beamW / 2} y1={slabBot + (beamMm - slabMm) * k} x2={xDoor + beamW / 2} y2={Y(0)} stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="2 2" />
      <SvgText x={xDoor + beamW / 2 + 3} y={Y(doorMm / 2)} style={{ fontSize: 6, fontFamily: "Carlito" }} fill="#555">{`Door ${doorMm}`}</SvgText>
      {/* dims */}
      <Line x1={w - 20} y1={ground} x2={w - 20} y2={slabTop} stroke="#333" strokeWidth={0.5} />
      <SvgText x={w - 18} y={(ground + slabTop) / 2} style={{ fontSize: 6, fontFamily: "Carlito" }} fill="#333">{`${floorMm}`}</SvgText>
      <SvgText x={X0} y={10} style={{ fontSize: 7, fontFamily: "Carlito" }} fill="#333">{thin ? "Typical section — walls under the block limit built in blockwork (not formed)" : "Typical section — orange = faces formed with aluminium formwork"}</SvgText>
    </Svg>
  );
}
