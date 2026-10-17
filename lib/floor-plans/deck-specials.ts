import { csvRow } from "./package";
import { minOf, maxOf } from "@/lib/util/minmax";

type Pt = [number, number];
type Special = { rings: Pt[][]; area: number };

/** Plain-words name of a deck special's outline. */
export function shapeOf(ring: Pt[], tolM = 0.003): "Rectangle" | "L-shape" | "Notched" | "Diagonal cut" | "Irregular" {
  const r = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  let diag = false;
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if (Math.abs(a[0] - b[0]) > tolM && Math.abs(a[1] - b[1]) > tolM) diag = true; }
  if (diag) return r.length <= 6 ? "Diagonal cut" : "Irregular";
  if (r.length <= 4) return "Rectangle";
  if (r.length === 6) return "L-shape";
  return r.length <= 10 ? "Notched" : "Irregular";
}

/** The made-to-shape deck pieces of every zone, numbered, with their outline, for the factory. A small piece is made of plywood on battens on site; a larger one is cut from a deck panel at the factory to this drawing. */
export function deckSpecialsCsv(zones: { code: string; specials?: Special[] }[], areaOf: Map<string, string>, plywoodMaxM2: number): string[] {
  const rows = [csvRow(["Mark", "Area", "Zone", "Shape", "Width mm", "Length mm", "Area m²", "Make", "Nos", "Outline (mm from the lower-left corner of the box: x:y …)", "Notes"])];
  const r5 = (v: number) => Math.round(v / 5) * 5;
  for (const z of zones) {
    let k = 0;
    for (const sp of z.specials ?? []) {
      const ring = sp.rings[0]; if (!ring || ring.length < 3 || sp.area < 0.01) continue;
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
      const x0 = minOf(xs), y0 = minOf(ys);
      const r = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
      const outline = r.map((p) => `${r5((p[0] - x0) * 1000)}:${r5((p[1] - y0) * 1000)}`).join(" ");
      const holes = sp.rings.length - 1;
      const small = sp.area <= plywoodMaxM2;
      rows.push(csvRow([`${z.code}-DS-${String(++k).padStart(2, "0")}`, areaOf.get(z.code) ?? "", z.code, shapeOf(ring), r5((maxOf(xs) - x0) * 1000), r5((maxOf(ys) - y0) * 1000), sp.area.toFixed(2), small ? "Plywood on battens (cut on site)" : "Factory-cut deck panel (cut to this outline)", 1, outline,
        [small ? "Small filler: plywood on the mid beams / soffit corner" : "Every edge must sit on a mid beam, prop head or soffit corner", holes ? `${holes} hole(s) inside — see drawing` : ""].filter(Boolean).join(". ")]));
    }
  }
  return rows;
}
