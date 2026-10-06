/**
 * Reading review: what the drawing reader decided on its own and what looks doubtful, each with a place on the plan
 * and the one-click answer the user can give. Every answer is stored on the plan (boxes "part of this floor" /
 * "not part of this floor") and the plan is read again with it — the app checks itself before the user has to.
 * Coordinates in plan metres (x right, y down).
 */
import type { Pt } from "./calc";
import type { Zone } from "./zones";

export type ReadBox = [number, number, number, number];
export type ReadFix = { kind: "include" | "exclude"; box: ReadBox; label: string };
export type ReadCheck = { id: string; sev: "error" | "warn" | "info"; title: string; detail: string; box: ReadBox; fixes: ReadFix[] };

type Note = { kind: "dropped" | "detail" | "cloud" | "wall-column" | "label-stair" | "bay" | "unwalled" | "beam-size"; box: ReadBox; n?: number; text?: string };
type Face = { code: string; panels: number[]; filler: number; geo?: { a: Pt; b: Pt } };

const m2 = (b: ReadBox) => (b[2] - b[0]) * (b[3] - b[1]);
const where = (b: ReadBox, origin: Pt) => `${((b[0] + b[2]) / 2 - origin[0]).toFixed(1)} m across, ${((b[1] + b[3]) / 2 - origin[1]).toFixed(1)} m down from the top-left of the plan`;
const pad = (b: ReadBox, d: number): ReadBox => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];

export function readChecks(o: { notes: Note[]; zoneWalls: Pt[][]; zones: Zone[]; faces: Face[]; stairs: number; box: ReadBox; marked: { includeM: ReadBox[]; excludeM: ReadBox[] } }): ReadCheck[] {
  const out: ReadCheck[] = [];
  const origin: Pt = [o.box[0], o.box[1]];
  let k = 0;
  const id = () => `c${++k}`;
  const already = (b: ReadBox) => [...o.marked.includeM, ...o.marked.excludeM].some((m) => Math.abs(m[0] - b[0]) < 0.3 && Math.abs(m[1] - b[1]) < 0.3 && Math.abs(m[2] - b[2]) < 0.3 && Math.abs(m[3] - b[3]) < 0.3);
  // only what lies at the floor (the reader's notes cover the whole file)
  const near: ReadBox = pad(o.box, 3);
  const hits = (b: ReadBox) => b[0] <= near[2] && b[2] >= near[0] && b[1] <= near[3] && b[3] >= near[1];
  // many small notes of one kind become one line (clouds, columns merged into walls, captioned details close together)
  const notes: Note[] = [];
  const clouds = o.notes.filter((n) => n.kind === "cloud" && hits(n.box)), cols = o.notes.filter((n) => n.kind === "wall-column" && hits(n.box));
  const union = (a: ReadBox, b: ReadBox): ReadBox => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  if (clouds.length) notes.push({ kind: "cloud", box: clouds.map((n) => n.box).reduce(union), n: clouds.length });
  if (cols.length) notes.push({ kind: "wall-column", box: cols.map((n) => n.box).reduce(union), n: cols.length });
  const dets: Note[] = [];
  for (const n of o.notes.filter((n) => n.kind === "detail" && hits(n.box))) { const g = dets.find((d) => d.box[0] <= n.box[2] + 1 && n.box[0] <= d.box[2] + 1 && d.box[1] <= n.box[3] + 1 && n.box[1] <= d.box[3] + 1); if (g) { g.box = union(g.box, n.box); g.n = (g.n ?? 1) + 1; } else dets.push({ ...n, n: 1 }); }
  notes.push(...dets, ...o.notes.filter((n) => n.kind !== "cloud" && n.kind !== "wall-column" && n.kind !== "detail"));
  for (const n of notes) {
    if (already(n.box) || !hits(n.box)) continue;
    const w = where(n.box, origin), size = `${(n.box[2] - n.box[0]).toFixed(1)} × ${(n.box[3] - n.box[1]).toFixed(1)} m`;
    switch (n.kind) {
      case "dropped":
        if ((n.n ?? 0) < 2 && m2(n.box) < 0.5) break;      // a stray line
        out.push({ id: id(), sev: m2(n.box) > 6 ? "warn" : "info", title: `Left out: ${n.n ?? 1} drawing element${(n.n ?? 1) > 1 ? "s" : ""} not connected to the floor (${size})`, detail: `At ${w}. The reader keeps only the structure connected to the main floor; this group stands apart from it, so it was read as a detail, legend or sketch. If it is part of this floor (a wing, a lift core, a balcony), say so.`, box: n.box, fixes: [{ kind: "include", box: pad(n.box, 0.2), label: "It is part of this floor" }] });
        break;
      case "detail":
        out.push({ id: id(), sev: "info", title: `${n.n ?? 1} captioned detail${(n.n ?? 1) > 1 ? "s" : ""} left out`, detail: `Caption${(n.n ?? 1) > 1 ? "s" : ""} (示意 / 大样 / 详图 / detail / section / legend) at ${w}: the drawing over ${(n.n ?? 1) > 1 ? "them" : "it"} was treated as a detail, not as the floor. If that is wrong, mark it as part of the floor.`, box: n.box, fixes: [{ kind: "include", box: n.box, label: "It is part of this floor" }] });
        break;
      case "cloud":
        out.push({ id: id(), sev: "info", title: `${n.n ?? 1} revision cloud${(n.n ?? 1) > 1 ? "s" : ""} on this floor`, detail: `The architect marked changes here (clouds). The walls inside them are read; their leader lines are not. Check the changes are what the structural drawing says.`, box: n.box, fixes: [] });
        break;
      case "wall-column":
        out.push({ id: id(), sev: "info", title: `${n.n ?? 1} column${(n.n ?? 1) > 1 ? "s" : ""} read as part of the wall`, detail: `Column outlines touching a wall (hidden columns / 构造柱 at wall ends and junctions): formed with the wall panels, no column sets. If one is a free-standing column that needs its own column set, draw it by hand on the measuring screen.`, box: n.box, fixes: [] });
        break;
      case "label-stair":
        out.push({ id: id(), sev: "warn", title: `Staircase from the label "${n.text ?? ""}" — flights assumed`, detail: `The plan has no tread lines here (${w}), only the label; the stair is laid out as a standard two-flight stair for this floor height. Upload or point to the stair detail sheet for the real flight sizes, or mark this box as not part of the floor if it is not a staircase.`, box: n.box, fixes: [{ kind: "exclude", box: n.box, label: "Not a staircase" }] });
        break;
      case "bay":
        out.push({ id: id(), sev: "info", title: `Slab bay read from beam lines (${size})`, detail: `A small outline outside the wall line at ${w} (AC platform, sunshade, 飘板): decked as its own slab bay with suspended formwork. If it is not slab (a duct, a sign, a symbol), leave it out.`, box: n.box, fixes: [{ kind: "exclude", box: pad(n.box, 0.05), label: "Not slab — leave it out" }] });
        break;
      case "beam-size":
        out.push({ id: id(), sev: "warn", title: `${n.n ?? 0} beam${(n.n ?? 0) === 1 ? "" : "s"} with no size on the drawing — depth assumed`, detail: `These beams have no size in a label or in the beam schedule: their width is taken as drawn and their depth from the schedule beams of the same width (${n.text ?? ""}). Ask the structural engineer for the beam schedule if these depths matter.`, box: n.box, fixes: [] });
        break;
      case "unwalled":
        out.push({ id: id(), sev: "warn", title: `Slab area with no wall inside it (${size})`, detail: `An outline at ${w} closed by beams and the wall line, with no wall standing inside it: read as slab because its edge runs along structure. If it is an open area (a court, a void, a box drawn for a note), leave it out.`, box: n.box, fixes: [{ kind: "exclude", box: pad(n.box, 0.05), label: "Not slab — leave it out" }] });
        break;
    }
  }
  // deck zones that look like slivers chaining rooms: a big box with little area in it
  for (const z of o.zones) {
    const bw = z.box[2] - z.box[0], bh = z.box[3] - z.box[1];
    if (bw * bh > 30 && z.area < 0.2 * bw * bh) out.push({ id: id(), sev: "warn", title: `Deck zone ${z.code} is oddly shaped (${z.area.toFixed(1)} m² spread over ${bw.toFixed(1)} × ${bh.toFixed(1)} m)`, detail: `Zone ${z.code} at ${where(z.box, origin)} covers several rooms through a thin strip — usually a slab edge drawn just outside a wall, or a missing wall between rooms. Check the walls there; the deck panels of this zone are laid out as one room.`, box: z.box, fixes: [] });
  }
  // wall faces without a panel (every face must be closed for a single pour)
  const open = o.faces.filter((f) => !f.panels.length && !f.filler);
  if (open.length) {
    const g = open[0].geo;
    out.push({ id: id(), sev: "error", title: `${open.length} wall face${open.length > 1 ? "s" : ""} with no panel`, detail: `Faces ${open.slice(0, 8).map((f) => f.code).join(", ")}${open.length > 8 ? "…" : ""} have no panel and no filler — concrete would run out there in a single pour. Usually a face shorter than the smallest panel; check the panel widths of the layout rules.`, box: g ? [Math.min(g.a[0], g.b[0]), Math.min(g.a[1], g.b[1]), Math.max(g.a[0], g.b[0]), Math.max(g.a[1], g.b[1])] : o.box, fixes: [] });
  }
  if (o.stairs === 0) out.push({ id: id(), sev: "warn", title: "No staircase found on this floor", detail: "No tread lines and no stair label were found inside the plan. A typical floor has at least one staircase; if this one has, check the stair layer is not set to ignore, or add the stair by hand.", box: o.box, fixes: [] });
  const order = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}
