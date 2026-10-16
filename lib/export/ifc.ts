/**
 * Formwork of a floor as an IFC4 file (opens in Revit, Navisworks, BIMcollab, FreeCAD, Blender-BIM …).
 * Every panel is its own element (IfcBuildingElementProxy) with its code, size and zone as properties, so it can be
 * scheduled and tagged in Revit; the concrete walls and the slab come along as IfcWall / IfcSlab for reference.
 * Plain STEP text, no library needed. Plan coordinates (metres, y down) become IFC X east, Y north, Z up.
 */
import { createHash } from "node:crypto";
import type { Scene3 } from "@/lib/floor-plans/scene3d";

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
/** IFC GlobalId (22 characters) made from a name, so the same model always gets the same ids. */
function guid(seed: string): string {
  const h = createHash("sha1").update(seed).digest();
  let n = 0n; for (let i = 0; i < 16; i++) n = (n << 8n) | BigInt(h[i]);
  let s = ""; for (let i = 0; i < 22; i++) { s = B64[Number(n & 63n)] + s; n >>= 6n; }
  return s;
}
const ascii = (t: string) => t.replace(/\\/g, "/").replace(/'/g, "").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
const q = (t: string) => `'${ascii(t)}'`;
const f = (n: number) => { const s = (Math.round(n * 1e5) / 1e5).toString(); return /[.eE]/.test(s) ? s : s + "."; };

export const IFC_KIND: Record<Scene3["panels"][number]["k"], string> = { std: "Standard wall panel", top: "Wall-top piece", fill: "Wall filler", deck: "Deck panel", dspec: "Deck special", ic: "Internal corner", ec: "External corner", sc: "Soffit corner", kick: "Kicker", bside: "Beam side panel", bbot: "Beam bottom", col: "Column panel", stair: "Stair soffit panel", riser: "Riser shutter", cheek: "Stair side panel", lsoff: "Landing soffit panel", tread: "Tread cover", cchan: "Stair C-channel", stp: "Stair stop panel", tz: "Special wall panel under flight", cpp: "Stair prop strip", trec: "Step nosing angle" };

export function sceneToIfc(scene: Scene3, info: { project: string; floor: string; company?: string; thicknessMm?: number }): string {
  const out: string[] = []; let id = 0;
  const add = (body: string) => { out.push(`#${++id}=${body};`); return id; };
  const ref = (n: number) => `#${n}`;
  const th = (info.thicknessMm ?? 65) / 1000;
  // plan (x, y-down) and height → IFC (X, Y north, Z up)
  const P3 = (x: number, up: number, zp: number): [number, number, number] => [x, -zp, up];

  const origin = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const axis = add(`IFCAXIS2PLACEMENT3D(${ref(origin)},$,$)`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ref(axis)},$)`);
  const sub = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ref(ctx)},$,.MODEL_VIEW.,$)`);
  const uL = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), uA = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"), uV = add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"), uR = add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const units = add(`IFCUNITASSIGNMENT((${[uL, uA, uV, uR].map(ref).join(",")}))`);
  const project = add(`IFCPROJECT('${guid("project")}',$,${q(info.project)},$,$,$,$,(${ref(ctx)}),${ref(units)})`);
  const place0 = () => add(`IFCLOCALPLACEMENT($,${ref(axis)})`);
  const siteP = place0();
  const site = add(`IFCSITE('${guid("site")}',$,'Site',$,$,${ref(siteP)},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldP = add(`IFCLOCALPLACEMENT(${ref(siteP)},${ref(axis)})`);
  const bld = add(`IFCBUILDING('${guid("building")}',$,${q(info.project)},$,$,${ref(bldP)},$,$,.ELEMENT.,$,$,$)`);
  const stoP = add(`IFCLOCALPLACEMENT(${ref(bldP)},${ref(axis)})`);
  const sto = add(`IFCBUILDINGSTOREY('${guid("storey")}',$,${q(info.floor)},$,$,${ref(stoP)},$,$,.ELEMENT.,0.)`);
  add(`IFCRELAGGREGATES('${guid("agg1")}',$,$,$,${ref(project)},(${ref(site)}))`);
  add(`IFCRELAGGREGATES('${guid("agg2")}',$,$,$,${ref(site)},(${ref(bld)}))`);
  add(`IFCRELAGGREGATES('${guid("agg3")}',$,$,$,${ref(bld)},(${ref(sto)}))`);

  const contained: number[] = [];
  const rep = (item: number) => { const r = add(`IFCSHAPEREPRESENTATION(${ref(sub)},'Body','Tessellation',(${ref(item)}))`); return add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${ref(r)}))`); };

  // ---- formwork panels: a thin box (skin on the concrete face, thickness towards the side away from the concrete)
  let k = 0;
  for (const pn of scene.panels) {
    if (pn.p.length < 4) continue;
    const a = pn.p.slice(0, 4).map((p) => P3(p[0], p[1], p[2]));
    const e1 = [a[1][0] - a[0][0], a[1][1] - a[0][1], a[1][2] - a[0][2]], e2 = [a[3][0] - a[0][0], a[3][1] - a[0][1], a[3][2] - a[0][2]];
    let n: [number, number, number];
    if (pn.n) n = [pn.n[0], -pn.n[2], pn.n[1]];
    else { n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; if ((pn.k === "deck" || pn.k === "dspec") && n[2] > 0) n = [-n[0], -n[1], -n[2]]; }
    const nl = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const w = Math.hypot(e1[0], e1[1], e1[2]), h = Math.hypot(e2[0], e2[1], e2[2]);
    if (w < 0.01 || h < 0.01) continue;
    const pts = [...a, ...a.map((p) => [p[0] + n[0] * th, p[1] + n[1] * th, p[2] + n[2] * th] as [number, number, number])];
    const list = add(`IFCCARTESIANPOINTLIST3D((${pts.map((p) => `(${f(p[0])},${f(p[1])},${f(p[2])})`).join(",")}))`);
    // 8 corners: 1-4 skin, 5-8 back; 12 triangles
    const tri = [[1, 2, 3], [1, 3, 4], [5, 7, 6], [5, 8, 7], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 8], [3, 8, 4], [4, 8, 5], [4, 5, 1]];
    const tfs = add(`IFCTRIANGULATEDFACESET(${ref(list)},$,$,(${tri.map((t) => `(${t.join(",")})`).join(",")}),$)`);
    const pl = add(`IFCLOCALPLACEMENT(${ref(stoP)},${ref(axis)})`);
    const kind = IFC_KIND[pn.k] ?? pn.k;
    const code = pn.c.split(" — ")[0];
    const el = add(`IFCBUILDINGELEMENTPROXY('${guid(`panel${k++}`)}',$,${q(code)},${q(kind)},${q(kind)},${ref(pl)},${ref(rep(tfs))},${q(code)},.NOTDEFINED.)`);
    contained.push(el);
    const sz = [Math.round(Math.max(w, h) * 1000), Math.round(Math.min(w, h) * 1000)];
    const props = [
      add(`IFCPROPERTYSINGLEVALUE('Panel',$,IFCLABEL(${q(pn.c)}),$)`),
      add(`IFCPROPERTYSINGLEVALUE('Kind',$,IFCLABEL(${q(kind)}),$)`),
      add(`IFCPROPERTYSINGLEVALUE('Zone or face',$,IFCLABEL(${q(pn.z ?? "")}),$)`),
      add(`IFCPROPERTYSINGLEVALUE('Length mm',$,IFCINTEGER(${sz[0]}),$)`),
      add(`IFCPROPERTYSINGLEVALUE('Width mm',$,IFCINTEGER(${sz[1]}),$)`),
      add(`IFCPROPERTYSINGLEVALUE('Make',$,IFCLABEL('ACOFORM aluminium formwork'),$)`),
    ];
    const ps = add(`IFCPROPERTYSET('${guid(`pset${k}`)}',$,'ACOFORM',$,(${props.map(ref).join(",")}))`);
    add(`IFCRELDEFINESBYPROPERTIES('${guid(`rel${k}`)}',$,$,$,(${ref(el)}),${ref(ps)})`);
  }

  // ---- concrete (reference): walls 0..H, slab H..H+slab, extruded plan outlines
  const extrude = (poly: Scene3["walls"][number], depth: number, z0: number) => {
    const curve = (r: [number, number][]) => { const pts = [...r, r[0]].map((p) => add(`IFCCARTESIANPOINT((${f(p[0])},${f(-p[1])}))`)); return add(`IFCPOLYLINE((${pts.map(ref).join(",")}))`); };
    const outer = curve(poly[0]), holes = poly.slice(1).filter((h) => h.length >= 3).map(curve);
    const prof = holes.length ? add(`IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,${ref(outer)},(${holes.map(ref).join(",")}))`) : add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${ref(outer)})`);
    const pos = add(`IFCAXIS2PLACEMENT3D(${ref(add(`IFCCARTESIANPOINT((0.,0.,${f(z0)}))`))},$,$)`);
    const dir = add("IFCDIRECTION((0.,0.,1.))");
    const solid = add(`IFCEXTRUDEDAREASOLID(${ref(prof)},${ref(pos)},${ref(dir)},${f(depth)})`);
    const r = add(`IFCSHAPEREPRESENTATION(${ref(sub)},'Body','SweptSolid',(${ref(solid)}))`);
    return add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${ref(r)}))`);
  };
  scene.walls.forEach((w, i) => { if (!w[0] || w[0].length < 3) return; const pl = add(`IFCLOCALPLACEMENT(${ref(stoP)},${ref(axis)})`); contained.push(add(`IFCWALL('${guid(`wall${i}`)}',$,'Concrete wall',$,$,${ref(pl)},${ref(extrude(w, scene.H, 0))},$,.NOTDEFINED.)`)); });
  scene.slabPoly.forEach((s, i) => { if (!s[0] || s[0].length < 3) return; const pl = add(`IFCLOCALPLACEMENT(${ref(stoP)},${ref(axis)})`); contained.push(add(`IFCSLAB('${guid(`slab${i}`)}',$,'Concrete slab',$,$,${ref(pl)},${ref(extrude(s, scene.slab, scene.H))},$,.FLOOR.)`)); });

  // chunks, so no single line is enormous
  for (let i = 0; i < contained.length; i += 400) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(`cont${i}`)}',$,$,$,(${contained.slice(i, i + 400).map(ref).join(",")}),${ref(sto)})`);

  const stamp = new Date().toISOString().slice(0, 19);
  return [
    "ISO-10303-21;", "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${q(info.project + ".ifc")},'${stamp}',(${q(info.company ?? "ACOFORM")}),(${q(info.company ?? "ACOFORM")}),'ACOFORM ONE','ACOFORM ONE','');`,
    "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;", ...out, "ENDSEC;", "END-ISO-10303-21;",
  ].join("\n");
}
