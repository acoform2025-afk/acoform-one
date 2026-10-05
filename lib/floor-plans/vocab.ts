/**
 * The drawing dictionary: what the words on an architect's drawing MEAN. Every office writes the same thing its own
 * way ("P.LIFT", "PASSENGER LIFT", "ELEV.", "电梯"; "O.H.W.T", "OHT", "OVERHEAD TANK"; "MUMTY", "STAIR CABIN",
 * "HEAD ROOM"), so a text is first normalised and then matched against the spellings below. What the dictionary
 * does not know yet is listed on the drawing read-out, where the estimator says once what it means — the company
 * dictionary (table drawing_dictionary) remembers it for every later drawing.
 */
import type { LayerRole } from "./calc";

export type ConceptGroup = "opening" | "circulation" | "room" | "level" | "structure" | "door-window" | "annotation" | "services";
export type Concept = { key: string; label: string; group: ConceptGroup; words: string[]; re?: RegExp };

/* words are matched as whole words on the normalised text (lower case, "." "_" "-" "/" read as spaces, and also with
   the dots taken out so "O.H.W.T" = "ohwt" and "P.LIFT" = "p lift" / "plift") */
export const CONCEPTS: Concept[] = [
  // ---- openings in the slab (deducted from the deck; edges formed) ----
  { key: "lift", label: "Lift / lift well", group: "opening", words: ["lift", "lifts", "plift", "slift", "flift", "p lift", "s lift", "f lift", "passenger lift", "service lift", "fire lift", "goods lift", "car lift", "lift well", "lift shaft", "liftwell", "elevator", "elev shaft", "电梯", "电梯井"] },
  { key: "duct", label: "Duct / shaft", group: "opening", words: ["duct", "ducts", "shaft", "shafts", "s duct", "e duct", "p duct", "service duct", "electrical duct", "plumbing duct", "elec shaft", "plumb shaft", "garbage chute", "chute", "riser", "管井", "风井", "烟道", "通风井"] },
  { key: "cutout", label: "Cut-out / void", group: "opening", words: ["mm cut", "cut", "cut out", "cutout", "c/o", "void", "opening", "open below", "slab cut out", "slab opening", "double height", "dbl ht", "洞口", "预留洞"] },
  { key: "ots", label: "Open to sky", group: "opening", words: ["ots", "o t s", "open to sky", "open terrace", "light well", "lightwell"] },
  // ---- stairs / ramps ----
  { key: "stair", label: "Staircase", group: "circulation", words: ["stair", "stairs", "staircase", "stair case", "fire stair", "fire escape", "escape stair", "stairwell", "楼梯"], re: /^(up|dn)$/ },
  { key: "ramp", label: "Ramp", group: "circulation", words: ["ramp", "ramp up", "ramp down", "坡道"] },
  // ---- levels of the building ----
  { key: "basement", label: "Basement", group: "level", words: ["basement", "basemet", "bsmt", "cellar", "lower ground", "lg", "lgf", "地下室"] },
  { key: "stilt", label: "Stilt / parking floor", group: "level", words: ["stilt", "stilt floor", "stilt level", "pilotis", "parking floor", "podium parking"] },
  { key: "ground", label: "Ground floor", group: "level", words: ["ground floor", "ground", "gf", "g f", "upper ground", "ugf", "plinth", "hollow plinth", "首层", "一层"] },
  { key: "podium", label: "Podium", group: "level", words: ["podium", "podium level", "podium floor"] },
  { key: "typical", label: "Typical floor", group: "level", words: ["typical floor", "typical", "typ floor", "typ", "标准层"] },
  { key: "refuge", label: "Refuge floor / area", group: "level", words: ["refuge", "refuge floor", "refuge area", "避难层"] },
  { key: "terrace", label: "Terrace / roof", group: "level", words: ["terrace", "terrace floor", "roof", "roof floor", "roof slab", "屋面", "屋顶"] },
  { key: "headroom", label: "Head room / stair cabin / LMR", group: "level", words: ["head room", "headroom", "stair cabin", "staircase cabin", "mumty", "mumtee", "mumti", "lmr", "lift machine room", "machine room", "lift mc room", "upper terrace"] },
  { key: "water-tank", label: "Water tank (OHT / UGT)", group: "level", words: ["o h w tank", "ohw tank", "u g w tank", "ug tank", "ohwt", "oht", "o h w t", "o h t", "over head tank", "overhead tank", "overhead water tank", "ugwt", "ugt", "underground tank", "water tank", "sump", "fire tank", "水箱"] },
  { key: "floor", label: "Floor (numbered)", group: "level", words: ["floor", "flr", "fl", "storey", "story", "层"] },
  // ---- rooms (wet rooms get kerbs / sunk slabs) ----
  { key: "toilet", label: "Toilet / bath", group: "room", words: ["toi", "f toi", "m toi", "toil", "bath rm", "attached toilet", "common toilet", "dress toilet", "toilet", "toilets", "tlt", "wc", "w c", "bath", "bathroom", "bath room", "t&b", "t b", "powder", "powder room", "pwd", "shower", "washroom", "卫生间", "卫"] },
  { key: "kitchen", label: "Kitchen", group: "room", words: ["kitchen", "kit", "kitch", "pantry", "厨房", "厨"] },
  { key: "balcony", label: "Balcony / deck", group: "room", words: ["balcony", "bal", "balc", "deck", "sit out", "sitout", "verandah", "veranda", "阳台"] },
  { key: "utility", label: "Utility / wash", group: "room", words: ["washyard", "wash yard", "wash place", "dry area", "service balcony", "utility", "util", "wash", "wash area", "dry balcony", "dry bal", "laundry", "洗衣"] },
  { key: "bedroom", label: "Bedroom", group: "room", words: ["bedroom", "bed room", "bed", "m bed", "mbed", "master bedroom", "master bed", "mbr", "br", "bed 1", "bed 2", "bed 3", "guest room", "kids room", "children room", "卧室"] },
  { key: "living", label: "Living / drawing / dining", group: "room", words: ["living", "living room", "liv", "drawing", "drawing room", "dining", "din", "living dining", "family", "family lounge", "lounge", "hall", "客厅", "餐厅"] },
  { key: "lobby", label: "Lobby / foyer / passage", group: "room", words: ["corridore", "corridor", "common corridor", "gallery", "vestibule", "staircase lobby", "common lobby", "reception", "waiting", "lobby", "lift lobby", "foyer", "passage", "corridor", "pass", "entrance", "entry", "common passage", "走廊", "前室", "大堂"] },
  { key: "other-room", label: "Other room", group: "room", words: ["room", "office plate", "s room", "store room", "bhk", "unit", "flat", "apartment", "club house", "clubhouse", "indoor games", "games room", "library", "open library", "yoga", "aerobics", "cafe", "cafeteria", "wfh", "play area", "toddler", "equipment room", "banquet", "multipurpose hall", "mph", "creche", "pantry room", "lounge area", "seating", "kitchen garden", "store", "pooja", "puja", "mandir", "study", "dress", "dressing", "servant", "servant room", "srv", "home theatre", "gym", "office", "shop", "meter room", "elec room", "electrical room", "ahu", "fire control room", "garbage room", "security", "guard room"] },
  // ---- structure ----
  { key: "rcc-wall", label: "RCC / shear wall", group: "structure", words: ["rcc", "r c c", "rcc wall", "shear wall", "sw", "core wall", "concrete wall", "剪力墙", "混凝土墙"] },
  { key: "block-wall", label: "Block / brick wall", group: "structure", words: ["block wall", "brick wall", "aac", "aac block", "masonry", "brick", "block work", "blockwork", "砌块", "砖墙"] },
  { key: "column", label: "Column", group: "structure", words: ["column", "col", "cols", "clm", "pillar", "柱"] },
  { key: "beam", label: "Beam", group: "structure", words: ["lintel", "lintel level", "beam", "bm", "plinth beam", "lintel beam", "梁"] },
  { key: "slab", label: "Slab", group: "structure", words: ["slab", "slab thk", "slab thickness", "sunk slab", "sunken slab", "drop slab", "板", "楼板"] },
  { key: "upstand", label: "Upstand / kerb / parapet", group: "structure", words: ["upstand", "kerb", "curb", "parapet", "parapet wall", "planter", "ledge", "反坎", "翻边"] },
  { key: "chajja", label: "Chajja / sunshade / loft", group: "structure", words: ["chajja", "chhajja", "sunshade", "sun shade", "weather shade", "loft", "canopy"] },
  // ---- doors / windows (openings in walls) ----
  { key: "door", label: "Door", group: "door-window", words: ["dw", "d w", "door window", "door", "doors", "main door", "fd", "门"], re: /^(d|md|fd|sd|dd|pd)\s?-?\d{0,2}[a-z]?$/ },
  { key: "window", label: "Window / ventilator", group: "door-window", words: ["sill", "sill level", "window", "windows", "ventilator", "vent", "french window", "sliding", "glazing", "窗"], re: /^(w|v|fw|sw|kw|cw)\s?-?\d{0,2}[a-z]?$/ },
  // ---- annotation (never formwork) ----
  { key: "title", label: "Drawing title", group: "annotation", words: ["floor plan", "plan", "section", "elevation", "layout", "detail", "key plan", "site plan", "平面图", "剖面图", "立面图", "详图"] },
  { key: "scale", label: "Scale", group: "annotation", words: ["scale", "nts", "n t s", "not to scale", "比例"] },
  { key: "north", label: "North", group: "annotation", words: ["north", "north arrow"] },
  { key: "note", label: "Notes / legend / title block", group: "annotation", words: ["structure", "as per tender", "option", "width", "height", "no", "nos", "proposed", "scheme", "for review", "for approval", "for construction", "gfc", "good for construction", "area table", "area statement", "total", "remarks", "sheet", "sheet no", "title", "note", "notes", "legend", "general notes", "drawing no", "dwg no", "revision", "rev", "date", "drawn", "checked", "approved", "client", "project", "architect", "consultant", "disclaimer", "说明", "图例"] },
  // ---- site / landscape (outside the building) ----
  { key: "site", label: "Site / road / parking / landscape", group: "annotation", words: ["drive way", "wide drive way", "slope", "ridge line", "ridge", "road", "wide road", "internal road", "common plot", "plot", "plot boundary", "setback", "margin", "compound wall", "gate", "entry gate", "exit gate", "car", "cars", "car parking", "parking", "parking space", "visitor parking", "two wheeler", "2 wheeler", "regular", "mechanical", "back to back", "nos of car", "total car", "space", "for", "swimming pool", "pool", "garden", "landscape", "lawn", "tree", "driveway", "fire tender", "fire tender path", "ground coverage", "fsi", "far"] },
  // ---- services (not formwork) ----
  { key: "services", label: "Services (MEP)", group: "services", words: ["raising main", "rising main", "fan", "exhaust", "exhaust fan", "pressurization", "pressurisation", "smoke vent", "vrv", "v r v", "stp", "space for stp", "bore", "bore well", "borewell", "transformer", "dg", "d g", "dg set", "meter", "panel room", "pump room", "lt room", "ht room", "solar", "fhc", "fire hose", "hydrant", "sprinkler", "db", "ac", "odu", "ac ledge", "drain", "rwp", "swp", "svp", "pipe", "geyser"] },
];

/** Layer roles a concept implies when it names a layer. */
export const CONCEPT_ROLE: Partial<Record<string, LayerRole>> = {
  lift: "opening", duct: "opening", cutout: "opening", ots: "opening", "rcc-wall": "walls", column: "columns", beam: "beams", slab: "slab", upstand: "upstand",
};

export const CONCEPT_BY_KEY = new Map(CONCEPTS.map((c) => [c.key, c]));
/** The meanings an estimator can pick for an unknown word ("ignore" = not needed for formwork). */
export const TEACHABLE = [...CONCEPTS.map((c) => ({ key: c.key, label: c.label, group: c.group })), { key: "ignore", label: "Not needed (ignore)", group: "annotation" as ConceptGroup }];

/** The company dictionary: words and layer names taught once, used on every later drawing. */
export type Dictionary = { terms: Record<string, string>; layers: Record<string, LayerRole> };
export const EMPTY_DICT: Dictionary = { terms: {}, layers: {} };
export function normaliseDict(raw: unknown): Dictionary {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});
  return { terms: { ...obj(r.terms) }, layers: { ...obj(r.layers) } as Record<string, LayerRole> };
}

/** "O.H.W.T" → "o h w t"; "P.LIFT-2" → "p lift 2"; "2ND  FLOOR" → "2nd floor". MTEXT codes are already stripped. */
export function normText(s: string): string {
  return s.toLowerCase().replace(/\\[a-z]/gi, " ").replace(/[._\-/\\:;,()[\]{}"'`#*~|]+/g, " ").replace(/\s+/g, " ").trim();
}
/** The same with dots / gaps between single letters closed up: "o h w t" → "ohwt", "p lift" stays. */
const squeeze = (n: string) => n.replace(/\b([a-z])\s(?=[a-z]\b)/g, "$1");

// word lists → one regex per concept (longest spelling first so "lift lobby" is not read as "lift")
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CJK = /[一-鿿]/;
const RX = CONCEPTS.map((c) => {
  const latin = c.words.filter((w) => !CJK.test(w)).map((w) => normText(w)).sort((a, b) => b.length - a.length).map(esc);
  const cjk = c.words.filter((w) => CJK.test(w)).map(esc);
  const parts: string[] = [];
  if (latin.length) parts.push(`(?:^|\\s)(?:${latin.join("|")})(?=\\s|$|\\d)`);
  if (cjk.length) parts.push(`(?:${cjk.join("|")})`);
  return { c, rx: new RegExp(parts.join("|")) };
});

/** Words that make a phrase about something else even if a concept word is in it ("LIFT LOBBY" is a lobby). */
const OVERRIDES: { re: RegExp; key: string }[] = [
  { re: /\blift lobby\b|\blobby\b|\bfoyer\b/, key: "lobby" },
  { re: /\bmachine room\b|\blmr\b|\bstair cabin\b|\bmumt[yei]e?\b|\bhead ?room\b/, key: "headroom" },
  { re: /\b(over ?head|under ?ground) (water )?tank\b|\bo ?h ?w ?t\b|\bu ?g ?w ?t\b/, key: "water-tank" },
  { re: /\bfloor plan\b|\bsection\b|\belevation\b/, key: "title" },
  { re: /\bproposed\b|\bscheme\b|\bproject\b/, key: "note" },
];

export type Meaning = { key: string; label: string; group: ConceptGroup | "ignore"; how: "taught" | "dictionary" };

/** What a text (or a layer name) means, or null when the dictionary does not know it. */
export function meaningOf(text: string, dict: Dictionary = EMPTY_DICT): Meaning | null {
  const n = normText(text); if (!n) return null;
  const taught = dict.terms[n] ?? dict.terms[squeeze(n)];
  if (taught) {
    if (taught === "ignore") return { key: "ignore", label: "Not needed", group: "ignore", how: "taught" };
    const c = CONCEPT_BY_KEY.get(taught); if (c) return { key: c.key, label: c.label, group: c.group, how: "taught" };
  }
  if (/@|www\.|https?:/i.test(text)) { const c = CONCEPT_BY_KEY.get("note")!; return { key: c.key, label: c.label, group: c.group, how: "dictionary" }; }
  if (/\b(mt|mtr|m)\b.*\bwide\b.*\broad\b|\broad\b/.test(n)) { const c = CONCEPT_BY_KEY.get("site")!; return { key: c.key, label: c.label, group: c.group, how: "dictionary" }; }
  for (const o of OVERRIDES) if (o.re.test(n)) { const c = CONCEPT_BY_KEY.get(o.key)!; return { key: c.key, label: c.label, group: c.group, how: "dictionary" }; }
  const sq = squeeze(n);
  for (const { c, rx } of RX) if (rx.test(n) || rx.test(sq) || (c.re && (c.re.test(n) || c.re.test(sq)))) return { key: c.key, label: c.label, group: c.group, how: "dictionary" };
  return null;
}

/* ---------- what kind of text it is (before its meaning) ---------- */
export type TextCat = "level-mark" | "dimension" | "size" | "grid" | "tag" | "area" | "number" | "words" | "title" | "note";
/** "LVL +4500" / "FFL +7.830" / "+3.000" — a floor level written on a section or plan. */
export const LEVEL_MARK = /^(?:(?:lvl|level|lev|ffl|sfl|tos|el\.?)\s*:?\s*)?[+-]\s*\d{1,6}(?:\.\d{1,3})?\s*(?:mm|m)?$|^(?:lvl|level|ffl|sfl)\s*:?\s*\d{1,6}(?:\.\d{1,3})?$/i;
const DIM = /^\d{1,2}'\s*-?\s*\d{0,2}(?:\s*\d\/\d)?"?$|^\d{2,5}(?:\.\d+)?\s*(?:mm|m|cm)?$|^\d+(?:\.\d+)?\s*m$/i;
const SIZE = /\d+(?:\.\d+)?\s*(?:''|['"])?\s*(?:-?\s*\d+(?:\.\d+)?\s*(?:''|["'])?)?\s*[x×*]\s*\d+(?:\.\d+)?/i;
const AREA = /\b(?:sq\.?\s*m(?:t|tr)?|sq\.?\s*ft|sqm|sqft|m2|carpet|built.?up|super)\b|m²/i;

export function textCategory(text: string, h: number, maxH: number): TextCat {
  const s = text.trim().replace(/^\((.*)\)$/, "$1").replace(/(lvl|level|ffl)\s*:\s*/i, "$1 ").replace(/(\d)\s*mm$/i, "$1").trim();
  if (LEVEL_MARK.test(s)) return "level-mark";
  if (AREA.test(s)) return "area";
  if (SIZE.test(s)) return "size";
  if (DIM.test(s)) return "dimension";
  if (/^[A-Z]{1,2}'?$|^\d{1,2}[A-Z]?$/.test(s) && s.length <= 3) return "grid";
  if (/^[A-Z]{1,3}\s?-?\d{1,3}[A-Z]?$/i.test(s)) return "tag";
  if (/^[\d\s.,:+-]+$/.test(s)) return "number";
  if (s.length > 60) return "note";
  if (maxH > 0 && h >= 0.6 * maxH && /[a-z一-鿿]/i.test(s)) return "title";
  return "words";
}

/** Learned layer role (taught on an earlier drawing), by the layer name as AutoCAD layers are compared. */
export const layerKey = (name: string) => (name.includes("$0$") ? name.slice(name.lastIndexOf("$0$") + 3) : name).toLowerCase().replace(/[_\s]+/g, "-").trim();
export function learnedRole(name: string, dict: Dictionary): LayerRole | undefined {
  return dict.layers[layerKey(name)];
}
