/**
 * Panel labels (QR) — one label per physical piece of the design: wall and deck panels carry their panel number
 * (W12-03, M12-01 …) and their packing bundle (the room they are fixed in), so a scanned panel tells the site
 * where it goes; columns, beams, corners, stairs, specials and spares get a running number per code.
 * Accessories (pins, wedges, props …) are not labelled.
 */
import QRCode from "qrcode";
import type { BomRow } from "@/lib/design-engine/floor-panels";
import type { Pack } from "./packing";

export type PanelLabel = { code: string; desc: string; family: string; w: number; h: number; no: string; bundle: string; special: boolean; k: number; n: number };

export const LABEL_FAMILY: Record<string, string> = {
  wall: "Wall panel", "wall-top": "Wall top panel", column: "Column panel", end: "Wall end", corner: "Corner", deck: "Deck panel",
  beam: "Beam panel", upstand: "Upstand panel", stair: "Staircase panel", drop: "Drop formwork", filler: "Filler / special",
};

export function panelLabels(bom: BomRow[], packs: Pack[]): PanelLabel[] {
  const out: Omit<PanelLabel, "k" | "n">[] = [];
  const row = new Map(bom.map((r) => [r.code, r]));
  const packed = new Map<string, number>();
  for (const p of packs) for (const l of p.lines) {
    const r = row.get(l.code);
    for (const no of l.nos) out.push({ code: l.code, desc: r?.description ?? (l.kind === "Deck" ? "Deck panel" : "Wall panel"), family: r ? LABEL_FAMILY[r.group] ?? r.group : l.kind === "Deck" ? "Deck panel" : "Wall panel", w: l.w, h: l.h, no, bundle: p.zone, special: !!r?.custom });
    packed.set(l.code, (packed.get(l.code) ?? 0) + l.nos.length);
  }
  for (const r of bom) {
    if (r.group === "accessory" || r.unit && r.unit !== "pcs" && r.unit !== "nos") continue;
    const left = Math.max(0, Math.round(r.qty) - (packed.get(r.code) ?? 0));
    for (let i = 1; i <= left; i++) out.push({ code: r.code, desc: r.description, family: LABEL_FAMILY[r.group] ?? r.group, w: r.w, h: r.h, no: `${r.code}#${String(i).padStart(3, "0")}`, bundle: "", special: r.custom });
  }
  return out.map((x, i) => ({ ...x, k: i + 1, n: out.length }));
}

/** Link the QR opens: the panel page of the app, with the label details (shown at once, without re-running the design). */
export function labelUrl(origin: string, planId: string, l: PanelLabel) {
  const q = new URLSearchParams({ n: l.no, c: l.code, s: `${l.w}x${l.h}`, ...(l.bundle ? { b: l.bundle } : {}) });
  return `${origin}/q/${planId}?${q.toString()}`;
}

/** QR code as one SVG path (dark modules, 1 unit each) and its size in modules — vector, sharp on a thermal printer. */
export function qrPath(text: string): { d: string; size: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, data = qr.modules.data;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!data[y * n + x]) { x++; continue; }
      let e = x; while (e < n && data[y * n + e]) e++;
      d += `M${x} ${y}h${e - x}v1h${x - e}z`;
      x = e;
    }
  }
  return { d, size: n };
}
