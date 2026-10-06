/**
 * Layer-name rules shared by the DWG converter (browser) and the DXF reader.
 * Names are compared lower-case with "_" and spaces read as "-", so "A_DOOR", "A-DOOR" and "a door" are the same.
 * Chinese drawings (e.g. Guangzhou / YJK / PKPM shells) use Chinese layer names — their keywords are listed too.
 */
export const normLayer = (name: string) => name.toLowerCase().replace(/[_\s]+/g, "-");

/** Layers that never carry formwork geometry: furniture, sanitary, hatching, dimensions, doors / windows / glazing,
 *  railings, trees, cars, architectural elevations … (texts on them are still read). */
const NOISE = new RegExp([
  "furn", "(^|-)fur(-|$)", "p-fur", "sanit", "fixture", "fitting", "plumb", "hatch", "(^|-)dim", "dimension",
  "tree", "plant", "landscap", "vehicle", "(^|-)car(-|$)", "people", "human", "tile", "flooring", "pattern",
  "fixt", "sanr", "^a-genm", "^a-detl", "^a-glaz", "glazing", "glass", "^a-door", "(^|-)doors?(-|$)", "(^|-)windows?(-|$)",
  "^a-window", "^a-win($|-)", "(^|-)win(-|$)", "(^|-)wndw", "^a-flor-hral", "^q-spcq", "^q-case", "^e-comm", "^i-", "-patt(-|$)",
  "^a-elevation", "^a-hdwr",
  // Chinese: door, window, furniture, hatch / fill, dimension, sanitary, index marks
  "门", "窗", "家具", "填充", "标注", "洁具", "卫浴", "索引",
].join("|"), "i");
export const isNoiseLayer = (name: string) => NOISE.test(normLayer(name));
/** Door / window layers: not drawn, but their lines inside a wall mark an opening in that wall. */
export const doorWindowKind = (name: string): "door" | "window" | null => {
  const n = normLayer(name);
  if (/elev|elv|section|sec-|立面|剖面|tag|text|txt/.test(n)) return null;
  if (/(^|-)doors?(-|$)|^a-door|门/.test(n)) return "door";
  if (/(^|-)windows?(-|$)|^a-window|^a-win($|-)|(^|-)win(-|$)|(^|-)wndw|^a-glaz|glazing|窗/.test(n)) return "window";
  return null;
};

/** Balcony railings / handrails: not formwork, but a wall line with a railing on it is a parapet (low wall). */
export const isRailLayer = (name: string) => /hral|railing|handrail|(^|-)rails?(-|$)|balustrade|栏杆|扶手/.test(normLayer(name));

/** Room names of wet areas (a concrete kerb / sunk slab is cast at their edge): toilets, baths, kitchens, balconies, utility. */
export const WET_ROOM = /\b(toilet|bath|bathroom|w\.?c\.?|kitchen|balcony|utility|wash|shower|powder)\b|卫生间|卫|浴|厨房|厨|阳台|洗衣|生活阳台/i;

export type Role = "ignore" | "walls" | "columns" | "slab" | "opening" | "beams" | "upstand";

/** First guess of what a layer is, from its name (the user can change every layer on the measuring screen). */
export function suggestLayerRole(name: string): Role {
  // layers of an attached drawing are named "<file>$0$<layer>": only the layer part tells what it is
  // an xref'd detail / section / legend drawing (its name is the prefix before "$0$") brings its own walls and slab
  // lines: not the plan's
  if (name.includes("$0$") && /大样|详图|示意|节点|剖面|detail|section|legend/i.test(name.slice(0, name.lastIndexOf("$0$")))) return "ignore";
  const n = normLayer(name.includes("$0$") ? name.slice(name.lastIndexOf("$0$") + 3) : name);
  // never formwork geometry: annotation, sheet furniture, sections / elevations, steel, sleeves, projections …
  if (/parapet|compound|hatch|elev(?!ational)|(^|-)elv|sec(tion)?(-|$)|text|txt|(^|-)dim|furn|door|win(dow)?(-|$)|grid|axis|template|title|border|frame|table|legend|name-?plate|nmplt|revision|slab-?thk|thk-text|projection|leader|steel|reinf|sleeve|(^|-)level|symbol|note|defpoints|drip|mould|企口|文字|标注|轴|图框|说明|标高|门|窗|填充|索引|修改|问题|钢筋|信息|分界/.test(n)) return "ignore";
  // Chinese formwork design drawings: layers that hold the formwork parts themselves (wall panels, corners, kickers,
  // foot boards, walers, prop heads, corner angles, beam side / bottom panels, cover plates) are not concrete
  if (/模板|转角|起脚|背楞|撑头|角铝|旁板|梁底板|盖板|方管|方通|拉片|贴片|配模|吊模|锯齿板|封边板|挡板/.test(n)) return "ignore";
  // mark-up layers: revision clouds, drawing issues / suggestions, review notes
  if (/云线|问题|建议|修改|审图|revcloud|cloud|markup|mark-up|review|comment/i.test(n)) return "ignore";
  // Chinese: block / brick walls are not cast (unless "changed to cast-in-place" 改现浇)
  if (/砌块|砖/.test(n) && !/现浇/.test(n)) return "ignore";
  // beam marks / numbers / depth notes and slab arrows are annotation, not beams or slab ("BEAM NOS", "B_NO", "BEAM DEPTH 750", "S-ARO SLAB")
  if (/(^|[^a-z])(nos?|no\.|marks?|tags?|labels?|depth|aro|arrows?)([^a-z]|$)/i.test(name.replace(/^.*\$0\$/, "").replace(/[_]/g, " "))) return "ignore";
  // a column-schedule layer named by the column size ("C650X1650", "C900X1500", "COL 450x600"): the columns of that size
  if (/^(c|col|column)[-_ ]?\d{3,4}\s*[x×*]\s*\d{3,4}$/i.test(name.trim().replace(/^.*\$0\$/, ""))) return "columns";
  if (/shaft|cut-?out|opening|(^|-)duct|(^|-)lift|stair-?open|洞|管井|风井|电梯井/.test(n)) return "opening";
  if (/(^|[^a-z])(col|cols|clm|column|columns)([^a-z]|$)|column|柱/.test(n)) return "columns";
  // upstands / planters / kerbs on top of the slab: both faces × their height
  if (/upstand|up-stand|planter|kerb|反坎|翻边/.test(n)) return "upstand";
  // inverted / drop pardi (down-stand walls under the slab) are formed like beams
  if (/inverted|drop-?pardi|down-?stand|吊挂/.test(n)) return "beams";
  if (/beam|(^|[^a-z])bm([^a-z]|$)|梁/.test(n)) return "beams";
  // a wall layer with its height in the name ("R.C.C Wall (+775) - MSA", "WALL +1230"): a low wall / kerb on the
  // slab — formed as an upstand of that height on both faces, not as a full-height wall
  if (/wall|(^|[^a-z])rcc([^a-z]|$)/.test(n.replace(/\./g, "")) && /\+\s*\d{2,4}(?!\d)/.test(n) && !/full/.test(n)) return "upstand";
  // "R.C.C", "R.C.C-MSA", "g-r.c.c": reinforced concrete (lift / stair walls, shear walls) — dots ignored
  if (/wall|shear|pardi|brick|masonry|(^|[^a-z])rcc([^a-z]|$)|-rcc$|(^|[^a-z])wl([^a-z]|$)|墙/.test(n.replace(/\./g, ""))) return "walls";
  if (/^[a-z]-flor$|^a-flor-mcut$/.test(n)) return "slab";          // Revit floor edges
  if (/slab|outline|boundary|periphery|(^|-)edge|built-?up|楼板|板边|边缘/.test(n)) return "slab";
  return "ignore";
}

/** Beam size written in the layer name ("CCME BEAM 300X750H - SHELL", "BEAM-350X750", "梁 200x500"): width × depth, mm. */
export function beamSizeFromLayer(name: string): { b: number; d: number } | null {
  const m = name.match(/(\d{2,4})\s*[xX×*]\s*(\d{2,4})\s*(h|mm)?/);
  if (!m) return null;
  const b = Number(m[1]), d = Number(m[2]);
  if (!(b >= 75 && b <= 2000 && d >= 100 && d <= 3000)) return null;
  return { b, d };
}
