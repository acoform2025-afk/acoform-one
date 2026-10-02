"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dxfTextFromBlob } from "@/lib/floor-plans/dxf-text";
import { useRouter } from "next/navigation";
import {
  AppWindow, Check, Crop, Eye, EyeOff, Minimize, RefreshCw, Type, Tag, ZoomIn, DoorOpen, FileDown, Hand, Layers, Loader2, MoveVertical, Maximize, Minus, MousePointer2, PenLine, Plus, Ruler, Save, Square, SquareDashed, Trash2, Undo2, X, Columns3,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  computeTotals, emptyTakeoff, SCOPES, type Scope, fmtArea, fmtLen, polyArea, shapeMeasure, stairBreakdown, UNIT_TO_M, type StairRow,
  type DxfAuto, type DxfUnits, type LayerRole, type Pt, type Shape, type ShapeKind, type Takeoff, type Totals,
} from "@/lib/floor-plans/calc";
import { drawingParts, dxfAuto, dxfFrame, drawDxf, drawingSection, floorInfoFromTexts, planCandidates, readDxf, ROLE_COLOR, separateAreas, snapPoints, type DxfModel, type PartKind } from "@/lib/floor-plans/dxf";
import { saveTakeoff } from "../actions";
import { describeRules, DEFAULT_RULES, type MeasureRules } from "@/lib/floor-plans/rules";
import { UseInQuotation, type QuoteOption } from "./use-in-quotation";
import { SendToDesign, type DesignOption } from "./send-to-design";

type Tool = "pan" | "zoom" | "select" | "calibrate" | "measure" | "region" | "slab" | "opening" | "wall" | "column" | "beam" | "door" | "window" | "loft" | "separate";
type PlanProps = { id: string; name: string; source_kind: "dxf" | "pdf" | "image"; file_url: string; takeoff: Partial<Takeoff> | null; lead: { id: string; label: string } | null };

const MAX_SIDE = 2400;
const SHAPE_STYLE: Record<ShapeKind, { stroke: string; fill: string; label: string }> = {
  slab: { stroke: "#2563eb", fill: "rgba(37,99,235,0.14)", label: "Slab area" },
  opening: { stroke: "#9333ea", fill: "rgba(147,51,234,0.22)", label: "Opening / shaft" },
  wall: { stroke: "#ea580c", fill: "none", label: "Wall" },
  column: { stroke: "#dc2626", fill: "rgba(220,38,38,0.35)", label: "Column" },
  beam: { stroke: "#db2777", fill: "none", label: "Beam" },
  door: { stroke: "#0d9488", fill: "none", label: "Door" },
  window: { stroke: "#0284c7", fill: "none", label: "Window" },
  loft: { stroke: "#65a30d", fill: "rgba(101,163,13,0.18)", label: "Loft / ledge" },
  separate: { stroke: "#64748b", fill: "rgba(100,116,139,0.18)", label: "Separate set (core)" },
};
const PREFIX: Record<ShapeKind, string> = { slab: "S", opening: "D", wall: "W", column: "C", beam: "B", door: "DR", window: "WN", loft: "L", separate: "X" };
const isOpen = (k: ShapeKind) => k === "wall" || k === "beam" || k === "door" || k === "window";
const isTwoPoint = (k: string) => k === "door" || k === "window";
/** Same numbering as the area list: own label, else S1, W1, B1 … in drawing order. */
function shapeCodes(shapes: Shape[]): Record<string, string> {
  const cnt: Record<string, number> = {}; const out: Record<string, string> = {};
  for (const s of shapes) { const p = PREFIX[s.kind]; out[s.id] = s.label?.trim() ? s.label.trim().slice(0, 20) : `${p}${(cnt[p] = (cnt[p] ?? 0) + 1)}`; }
  return out;
}
const TOOL_HINT: Record<Tool, string> = {
  pan: "Drag to move the plan. Scroll (or use + / −) to zoom. Use “Go to drawing” or the Drawings list to jump to one drawing.",
  zoom: "Click two opposite corners of the area you want to see close up.",
  select: "Click a drawn item to select it, then press Delete to remove it.",
  calibrate: "Click the two ends of a dimension you know (e.g. a 6000 mm grid line), then type its length.",
  measure: "Click two points to measure a distance — e.g. floor-to-floor height or slab thickness on a section drawing.",
  region: "Click two opposite corners around the floor plan. Only drawing inside this box is counted (sections / elevations outside are ignored).",
  slab: "Click each corner of the slab outline. Click the first point again (or press Enter) to close.",
  opening: "Click the corners of a shaft / cut-out to deduct it. Click the first point again to close.",
  wall: "Click along the wall centre line. Double-click or press Enter to finish the wall. Hold Shift for straight lines.",
  column: "Click two opposite corners of a column.",
  door: "Click the two sides of the door opening along the wall. Set its height in the element box (default 2100).",
  window: "Click the two sides of the window along the wall. Set height and sill in the element box (default 1200, sill 900).",
  loft: "Click the corners of the loft / ledge slab. Click the first point again to close.",
  separate: "Draw round a part cast with its own formwork (lift / stair core, columns cast first). Its walls and columns leave the typical-floor set. Click the first point again to close.",
  beam: "Click along the beam centre line. Double-click or press Enter to finish. Set its width × depth in the list on the right (Select it).",
};
const uid = () => Math.random().toString(36).slice(2, 10);
const cls = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const numIn = "w-full rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-sm text-graphite-100 focus:border-brand-orange focus:outline-none";

function normalise(t: Partial<Takeoff> | null): Takeoff {
  const e = emptyTakeoff();
  return {
    ...e, ...(t ?? {}), v: 1,
    params: { ...e.params, ...(t?.params ?? {}) },
    shapes: Array.isArray(t?.shapes) ? t!.shapes : [], columns: Array.isArray(t?.columns) ? t!.columns : [], beams: Array.isArray(t?.beams) ? t!.beams : [],
    extras: Array.isArray(t?.extras) ? t!.extras : [],
  };
}

export function TakeoffTool({ plan, tenantId, canEdit, quotes, designs, rules = DEFAULT_RULES }: { plan: PlanProps; tenantId: string; canEdit: boolean; quotes: QuoteOption[]; designs: DesignOption[] | null; rules?: MeasureRules }) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewCanvasRef = useRef<HTMLCanvasElement>(null);   // DXF: lines redrawn crisp at every zoom
  const pxPathsRef = useRef<{ layer: string; xy: Float32Array; closed: boolean; b: [number, number, number, number] }[]>([]);
  const modelRef = useRef<DxfModel | null>(null);
  const frameRef = useRef<ReturnType<typeof dxfFrame> | null>(null);
  const snapRef = useRef<Pt[]>([]);

  const [t, setT] = useState<Takeoff>(() => normalise(plan.takeoff));
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState(1);
  const [layers, setLayers] = useState<DxfModel["layers"]>([]);
  const [unitsGuessed, setUnitsGuessed] = useState(false);
  const [tool, setTool] = useState<Tool>(canEdit ? "slab" : "pan");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<{ pt: Pt; snapped: boolean } | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [calibMm, setCalibMm] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [layerVersion, setLayerVersion] = useState(0);
  // viewer
  const [hidden, setHidden] = useState<Record<string, boolean>>({});   // layers switched off on screen (still counted)
  const [showText, setShowText] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [full, setFull] = useState(false);
  const [mouse, setMouse] = useState<Pt | null>(null);
  const [partFilter, setPartFilter] = useState<PartKind | "all">("all");
  const textPxRef = useRef<{ x: number; y: number; h: number; text: string }[]>([]);

  const isDxf = plan.source_kind === "dxf";
  const update = useCallback((fn: (p: Takeoff) => Takeoff) => { setT((p) => fn(p)); setDirty(true); setMsg(null); }, []);

  /* ---------- load the plan picture ---------- */
  const fit = useCallback((w: number, h: number) => {
    const st = stageRef.current; if (!st) return;
    const r = st.getBoundingClientRect();
    const k = Math.min(r.width / w, r.height / h) * 0.95;
    setView({ k, x: (r.width - w * k) / 2, y: (r.height - h * k) / 2 });
  }, []);

  /** Zoom so that a box (plan pixels) fills the screen. */
  const fitBox = useCallback((b: [number, number, number, number]) => {
    const st = stageRef.current; if (!st) return;
    const r = st.getBoundingClientRect();
    const w = Math.max(1, b[2] - b[0]), h = Math.max(1, b[3] - b[1]);
    // as large as the screen allows: a small edge, a little more on top for the drawing's name
    const k = Math.min((r.width - 16) / w, (r.height - 34) / h);
    setView({ k, x: r.width / 2 - ((b[0] + b[2]) / 2) * k, y: (r.height + 18) / 2 - ((b[1] + b[3]) / 2) * k });
  }, []);

  const rescaleTo = useCallback((w: number, h: number) => {
    setT((p) => {
      const old = p.image; if (!old || (old.w === w && old.h === h) || isDxf) return { ...p, image: { ...(p.image ?? {}), w, h } };
      const f = w / old.w; // same page rendered at a different size → keep drawings in place
      const sc = (q: Pt): Pt => [q[0] * f, q[1] * f];
      return {
        ...p, image: { ...old, w, h },
        shapes: p.shapes.map((s) => ({ ...s, pts: s.pts.map(sc) })),
        metersPerPx: p.metersPerPx ? p.metersPerPx / f : p.metersPerPx,
        calib: p.calib ? { ...p.calib, p1: sc(p.calib.p1), p2: sc(p.calib.p2) } : p.calib,
      };
    });
  }, [isDxf]);

  const drawDxfNow = useCallback((roles: Record<string, LayerRole>) => {
    const m = modelRef.current, f = frameRef.current, c = canvasRef.current; if (!m || !f || !c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    drawDxf(ctx, m, roles, f);
    snapRef.current = snapPoints(m, f, roles);
    if (pxPathsRef.current.length === 0) {
      pxPathsRef.current = m.paths.map((p) => {
        const xy = new Float32Array(p.pts.length * 2); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        p.pts.forEach((q, i) => { const [x, y] = f.toPx(q); xy[2 * i] = x; xy[2 * i + 1] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
        return { layer: p.layer, xy, closed: p.closed, b: [x0, y0, x1, y1] as [number, number, number, number] };
      });
      textPxRef.current = (m.texts ?? []).filter((q) => q.h > 0).map((q) => { const [x, y] = f.toPx([q.x, q.y]); return { x, y, h: q.h / f.unitsPerPx, text: q.text }; });
    }
  }, []);

  const loadPdfPage = useCallback(async (buf: ArrayBuffer, pageNo: number) => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
    setPdfPages(doc.numPages);
    const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
    const v1 = page.getViewport({ scale: 1 });
    const scale = MAX_SIDE / Math.max(v1.width, v1.height);
    const vp = page.getViewport({ scale });
    const c = canvasRef.current!; c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { w: c.width, h: c.height };
  }, []);

  const pdfBuf = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(plan.file_url);
        if (!res.ok) throw new Error("Could not download the plan file.");
        let dims: { w: number; h: number };
        if (plan.source_kind === "dxf") {
          const model = readDxf(await dxfTextFromBlob(await res.blob()));
          if (cancelled) return;
          modelRef.current = model;
          const saved = normalise(plan.takeoff);
          const roles: Record<string, LayerRole> = {};
          for (const l of model.layers) roles[l.name] = saved.dxf?.layerRoles?.[l.name] ?? l.suggested;
          const units = (saved.dxf?.units ?? model.units) as DxfUnits;
          const frame = dxfFrame(model, MAX_SIDE); frameRef.current = frame;
          const c = canvasRef.current!; c.width = frame.width; c.height = frame.height;
          drawDxfNow(roles);
          setLayers(model.layers); setUnitsGuessed(model.unitsGuessed && !saved.dxf?.units);
          // keep everything already saved for the drawing (plan region…) — only units / layer roles are filled in
          setT((p) => ({ ...p, dxf: { ...(p.dxf ?? {}), units, layerRoles: roles, wallsDrawn: p.dxf?.wallsDrawn ?? "faces" }, metersPerPx: frame.unitsPerPx * UNIT_TO_M[units] }));
          dims = { w: frame.width, h: frame.height };
        } else if (plan.source_kind === "pdf") {
          pdfBuf.current = await res.arrayBuffer();
          dims = await loadPdfPage(pdfBuf.current, normalise(plan.takeoff).image?.page ?? 1);
        } else {
          const blob = await res.blob();
          const bmp = await createImageBitmap(blob);
          const s = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
          const c = canvasRef.current!; c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
          c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
          dims = { w: c.width, h: c.height };
        }
        if (cancelled) return;
        rescaleTo(dims.w, dims.h);
        setSize(dims);
        requestAnimationFrame(() => fit(dims.w, dims.h));
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Could not open this floor plan.");
      }
    })();
    return () => { cancelled = true; };
    // load once per plan — after Save the page refreshes with a new signed link, which must not reload / re-read the drawing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);

  // DXF lines drawn straight onto a screen-sized canvas so they stay sharp at any zoom
  useEffect(() => {
    if (!isDxf || !size || !t.dxf) return;
    const id = requestAnimationFrame(() => {
      const c = viewCanvasRef.current, st = stageRef.current; if (!c || !st) return;
      const r = st.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; c.style.width = `${r.width}px`; c.style.height = `${r.height}px`; }
      const ctx = c.getContext("2d"); if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
      const { k: kk, x: vx, y: vy } = view;
      const ix0 = -vx / kk, iy0 = -vy / kk, ix1 = (r.width - vx) / kk, iy1 = (r.height - vy) / kk;
      const roles = t.dxf!.layerRoles;
      const order: LayerRole[] = ["ignore", "slab", "opening", "upstand", "beams", "walls", "columns"];
      for (const role of order) {
        ctx.beginPath();
        let any = false;
        for (const p of pxPathsRef.current) {
          if ((roles[p.layer] ?? "ignore") !== role || hidden[p.layer]) continue;
          if (p.b[2] < ix0 || p.b[0] > ix1 || p.b[3] < iy0 || p.b[1] > iy1) continue;
          const xy = p.xy; any = true;
          ctx.moveTo(vx + xy[0] * kk, vy + xy[1] * kk);
          for (let i = 2; i < xy.length; i += 2) ctx.lineTo(vx + xy[i] * kk, vy + xy[i + 1] * kk);
          if (p.closed) ctx.closePath();
        }
        if (!any) continue;
        if (role === "columns" || role === "opening") { ctx.fillStyle = role === "columns" ? "rgba(220,38,38,0.35)" : "rgba(147,51,234,0.12)"; ctx.fill(); }
        ctx.strokeStyle = ROLE_COLOR[role]; ctx.lineWidth = role === "ignore" ? 0.6 : role === "walls" ? 1.4 : 1.2; ctx.stroke();
      }
      // texts of the drawing (titles, room names, level names) once they are big enough to read
      if (showText) {
        ctx.fillStyle = "#374151"; ctx.textBaseline = "alphabetic";
        let n = 0;
        for (const q of textPxRef.current) {
          const fs = q.h * kk; if (fs < 5) continue;
          if (q.x < ix0 - 50 / kk || q.x > ix1 || q.y < iy0 || q.y > iy1 + fs / kk) continue;
          ctx.font = `${Math.min(fs, 200).toFixed(1)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillText(q.text, vx + q.x * kk, vy + q.y * kk);
          if (++n > 4000) break;
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [isDxf, size, view, t.dxf, layerVersion, hidden, showText, full]);

  // re-draw DXF when layer roles change
  useEffect(() => { if (isDxf && t.dxf) drawDxfNow(t.dxf.layerRoles); }, [isDxf, layerVersion, drawDxfNow]); // eslint-disable-line react-hooks/exhaustive-deps

  async function changePdfPage(n: number) {
    if (!pdfBuf.current) return;
    if (t.shapes.length && !window.confirm("Changing the page clears the scale and all measurements on this plan. Continue?")) return;
    const dims = await loadPdfPage(pdfBuf.current, n);
    update((p) => ({ ...p, image: { ...dims, page: n }, shapes: [], metersPerPx: null, calib: undefined }));
    setSize(dims); fit(dims.w, dims.h);
  }

  /* ---------- quantities ---------- */
  const auto: DxfAuto | null = useMemo(() => {
    if (!isDxf || !modelRef.current || !t.dxf) return null;
    const reg = t.dxf.region, f = frameRef.current;
    const keep = reg && f ? (p: { pts: Pt[] }) => p.pts.every((q) => { const [x, y] = f.toPx(q); return x >= reg[0] && x <= reg[2] && y >= reg[1] && y <= reg[3]; }) : undefined;
    const mo = t.params.minOpeningM2 != null && String(t.params.minOpeningM2) !== "" ? Number(t.params.minOpeningM2) : rules.minOpeningM2;
    return dxfAuto(modelRef.current, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units], keep, mo, f ? separateAreas(t.shapes, f) : [], { minWallMm: Number(t.params.minWallMm) || 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDxf, t.dxf, size, t.params.minOpeningM2, t.params.minWallMm, rules.minOpeningM2, t.shapes.filter((s) => s.kind === "separate").map((s) => s.pts.join(";")).join("|")]);
  const totals: Totals = useMemo(() => computeTotals(t, auto, rules), [t, auto, rules]);
  // the same figures read from the drawing only (without the estimator's typed-in figures) — shown next to them
  const drawnTotals: Totals = useMemo(() => computeTotals({ ...t, params: { ...t.params, slabM2: undefined, ductM2: undefined, wallLenM: undefined, beamLenM: undefined } }, auto, rules), [t, auto, rules]);
  // separate drawings in the file (floor plans, sections…) — until one is chosen, nothing is counted
  const candidates = useMemo(() => {
    const f = frameRef.current;
    if (!isDxf || !modelRef.current || !t.dxf || !f) return [];
    return planCandidates(modelRef.current, t.dxf.layerRoles, UNIT_TO_M[t.dxf.units]).map((c, i) => {
      const a = f.toPx([c.box[0], c.box[1]]), b = f.toPx([c.box[2], c.box[3]]);
      return { n: i + 1, w: c.w, h: c.h, title: c.title, floors: c.floors, px: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] as [number, number, number, number] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDxf, t.dxf?.layerRoles, t.dxf?.units, size]);
  // every separate drawing in the file (plans, sections, elevations, site plan…) with its title — listed and outlined
  const parts = useMemo(() => {
    const f = frameRef.current;
    if (!isDxf || !modelRef.current || !t.dxf || !f) return [];
    return drawingParts(modelRef.current, UNIT_TO_M[t.dxf.units], t.dxf.layerRoles).map((c) => {
      const a = f.toPx([c.box[0], c.box[1]]), b = f.toPx([c.box[2], c.box[3]]);
      return { ...c, px: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] as [number, number, number, number] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDxf, t.dxf?.layerRoles, t.dxf?.units, size]);
  // the selected (counted) drawing fills the screen: when the plan opens, when another drawing is chosen, after full screen
  const regionKey = t.dxf?.region ? t.dxf.region.map((v) => Math.round(v)).join(",") : "";
  const zoomedTo = useRef<string | null>(null);
  const zoomToSelected = useCallback(() => {
    const r = t.dxf?.region;
    if (r) fitBox(r); else if (size) fit(size.w, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey, size, fit, fitBox]);
  useEffect(() => {
    if (!isDxf || !size || zoomedTo.current === regionKey) return;
    zoomedTo.current = regionKey;
    if (!regionKey) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => zoomToSelected()));
    return () => cancelAnimationFrame(id);
  }, [isDxf, size, regionKey, zoomToSelected]);
  const needPick = !!(isDxf && t.dxf && !t.dxf.region && candidates.length > 1 && !canEdit);
  const [choosing, setChoosing] = useState(false);          // user asked to pick another drawing
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const autoDone = useRef(false);
  const current = useMemo(() => {
    const r = t.dxf?.region; if (!r) return null;
    // the drawing the region covers best (a hand-drawn region around a drawing still shows its title)
    const area = (b: number[]) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
    let best: (typeof candidates)[number] | null = null, bestIou = 0;
    for (const c of candidates) {
      const inter = area([Math.max(c.px[0], r[0]), Math.max(c.px[1], r[1]), Math.min(c.px[2], r[2]), Math.min(c.px[3], r[3])]);
      const iou = inter / (area(c.px) + area(r) - inter || 1);
      if (inter / (area(c.px) || 1) > 0.9 && iou > bestIou) { best = c; bestIou = iou; }
    }
    return best;
  }, [t.dxf?.region, candidates]);
  const currentPart = useMemo(() => {
    const r = t.dxf?.region; if (!r) return null;
    const area = (b: number[]) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
    return parts.find((q) => { const i = area([Math.max(q.px[0], r[0]), Math.max(q.px[1], r[1]), Math.min(q.px[2], r[2]), Math.min(q.px[3], r[3])]); return i > 0.85 * area(q.px) && i > 0.6 * area(r); }) ?? null;
  }, [t.dxf?.region, parts]);
  // automatic: pick the typical floor plan (most walls + "typical … plan" title), read floors & floor height from the drawing
  const detect = useCallback((force: boolean) => {
    if (!modelRef.current || !t.dxf) return;
    const pick = candidates.length >= 2 ? candidates[0] : null;
    const info = floorInfoFromTexts(modelRef.current.texts ?? [], UNIT_TO_M[t.dxf.units], [plan.name, plan.lead?.label ?? ""]);
    // first time: floor height / floors only replace the untouched defaults (3000 mm, 1 floor); "read again" replaces them
    // sections in the drawing: floor-to-floor and slab (concrete only — a floor finish / screed line is left out)
    const sec = drawingSection(modelRef.current);
    const fhRead = sec?.floorMm ?? info.heightMm;
    const fh = fhRead && (force || (Math.round((t.params.floorHeight || 0) * 1000) === 3000 && fhRead !== 3000)) ? fhRead : undefined;
    const slabMm = sec && (force || (t.params.slabMm ?? 150) === 150) && sec.slabMm !== (t.params.slabMm ?? 150) ? sec.slabMm : undefined;
    const beamDepthMm = sec?.beamMm && (force || t.params.beamDepthMm == null) ? sec.beamMm : undefined;
    const fl = pick?.floors ?? info.floors;
    const floors = fl && (force || (t.params.floors ?? 1) <= 1) ? fl : undefined;
    const notes: string[] = [];
    if (pick) notes.push(`picked ${pick.title ? `"${pick.title}"` : `drawing ${pick.n}`} (${pick.w.toFixed(1)} × ${pick.h.toFixed(1)} m) as the typical floor`);
    if (floors) notes.push(`${floors} floors (${pick?.floors ? "from the drawing title" : info.source ?? "from the drawing"})`);
    if (fh) notes.push(`floor height ${fh} mm (${sec?.floorMm ? "from the sections" : info.source && /level/.test(info.source) ? "from the level marks" : "from the drawing"})`);
    if (sec) notes.push(`sections: slab ${sec.slabMm} mm concrete${sec.finishMm ? ` (+ ${sec.finishMm} mm floor finish, ${sec.totalMm} mm in all — finish not formed)` : ""}${slabMm ? "" : " — kept the slab you set"}${sec.beamMm ? ` · beams / lintels ${sec.beamMm} mm deep` : ""}`);
    if (force && !pick && !fh && !floors && !sec) notes.push("nothing new could be read — set the region, floors and floor height by hand");
    const note = notes.length ? notes.join(" · ") + "." : undefined;
    update((pp) => ({
      ...pp,
      auto: { done: true, note },
      params: { ...pp.params, ...(floors ? { floors } : {}), ...(fh ? { floorHeight: fh / 1000 } : {}), ...(slabMm ? { slabMm } : {}), ...(beamDepthMm ? { beamDepthMm } : {}) },
      dxf: pp.dxf && pick ? { ...pp.dxf, region: pick.px } : pp.dxf,
    }));
    setAutoNote(note ?? null);
    if (note) setAutoSave(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, t.dxf, t.params.floorHeight, t.params.floors, t.params.slabMm, t.params.beamDepthMm, plan.name, plan.lead?.label, update]);
  useEffect(() => {
    if (autoDone.current || !canEdit || !isDxf || !t.dxf || !modelRef.current || !size) return;
    // only the first time a plan is opened: once the user has a region / saved values, nothing is changed automatically
    autoDone.current = true;
    if (t.auto?.done || t.dxf.region) return;
    detect(false);
  }, [canEdit, isDxf, t.dxf, t.auto?.done, size, detect]);
  const pickPlan = (c: { px: [number, number, number, number]; floors?: number }) => { setChoosing(false); setAutoNote(null); update((pp) => ({ ...pp, params: c.floors ? { ...pp.params, floors: c.floors } : pp.params, dxf: pp.dxf ? { ...pp.dxf, region: c.px } : pp.dxf })); };
  const mpp = t.metersPerPx;
  const codes = useMemo(() => shapeCodes(t.shapes), [t.shapes]);
  const selShape = selected ? t.shapes.find((x) => x.id === selected) ?? null : null;
  const setShape = (id: string, patch: Partial<Shape>) => update((p) => ({ ...p, shapes: p.shapes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  /* ---------- pointer maths ---------- */
  const toImg = (cx: number, cy: number): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k];
  };
  const snap = (p: Pt, shift: boolean): { pt: Pt; snapped: boolean } => {
    let q: Pt = p;
    const last = draft[draft.length - 1];
    if (shift && last) q = Math.abs(p[0] - last[0]) > Math.abs(p[1] - last[1]) ? [p[0], last[1]] : [last[0], p[1]];
    const tol = 10 / view.k;
    let best: Pt | null = null, bd = tol;
    const consider = (c: Pt) => { const d = Math.hypot(c[0] - q[0], c[1] - q[1]); if (d < bd) { bd = d; best = c; } };
    if (draft.length >= 3 && (tool === "slab" || tool === "opening" || tool === "loft" || tool === "separate")) consider(draft[0]);
    for (const s of t.shapes) for (const c of s.pts) consider(c);
    for (const c of snapRef.current) consider(c);
    if (best && !(shift && last)) return { pt: best, snapped: true };
    return { pt: q, snapped: false };
  };

  const finishShape = useCallback((kind: ShapeKind, pts: Pt[]) => {
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
    if (isOpen(kind) ? clean.length < 2 : clean.length < 3) { setDraft([]); return; }
    if (!isOpen(kind) && polyArea(clean) < 1) { setDraft([]); return; }
    update((p) => ({ ...p, shapes: [...p.shapes, { id: uid(), kind, pts: clean }] }));
    setDraft([]);
  }, [update]);

  function click(p: Pt) {
    if (!canEdit && tool !== "zoom") return;
    if (choosing && tool !== "region") {
      const c = candidates.find((q) => p[0] >= q.px[0] && p[0] <= q.px[2] && p[1] >= q.px[1] && p[1] <= q.px[3]);
      if (c) { pickPlan(c); return; }
    }
    if (tool === "pan") return;
    if (tool === "zoom") {
      if (draft.length === 0) { setDraft([p]); return; }
      const a = draft[0];
      if (Math.abs(p[0] - a[0]) > 2 && Math.abs(p[1] - a[1]) > 2) fitBox([Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[0], p[0]), Math.max(a[1], p[1])]);
      setDraft([]); return;
    }
    if (tool === "select") {
      const hit = [...t.shapes].reverse().find((s) => hitTest(s, p, 8 / view.k));
      setSelected(hit?.id ?? null); return;
    }
    if (tool === "calibrate" || tool === "measure") { setDraft((d) => (d.length >= 2 ? [p] : [...d, p])); return; }
    if (tool === "region") {
      if (draft.length === 0) { setDraft([p]); return; }
      const a = draft[0];
      const r: [number, number, number, number] = [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[0], p[0]), Math.max(a[1], p[1])];
      if (r[2] - r[0] > 5 && r[3] - r[1] > 5) update((pp) => ({ ...pp, dxf: pp.dxf ? { ...pp.dxf, region: r } : pp.dxf }));
      setDraft([]); return;
    }
    if (tool === "column") {
      if (draft.length === 0) { setDraft([p]); return; }
      const a = draft[0];
      finishShape("column", [a, [p[0], a[1]], p, [a[0], p[1]]]); return;
    }
    if (tool === "door" || tool === "window") {
      if (draft.length === 0) { setDraft([p]); return; }
      finishShape(tool, [draft[0], p]); return;
    }
    if (tool === "slab" || tool === "opening" || tool === "loft" || tool === "separate") {
      if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 10 / view.k) { finishShape(tool, draft); return; }
      setDraft((d) => [...d, p]); return;
    }
    if (tool === "wall" || tool === "beam") setDraft((d) => [...d, p]);
  }

  function finishDraft() {
    if (tool === "slab" || tool === "opening" || tool === "loft" || tool === "separate" || tool === "wall" || tool === "beam") finishShape(tool, draft);
  }

  /* ---------- mouse / touch ---------- */
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; pan: boolean } | null>(null);
  const spaceDown = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (!size) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pan = tool === "pan" || e.button === 1 || e.button === 2 || spaceDown.current;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, pan };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!size) return;
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (d.moved && (d.pan || e.pointerType === "touch")) { d.pan = true; setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy })); return; }
    }
    if (tool !== "pan") setHover(snap(toImg(e.clientX, e.clientY), e.shiftKey));
    if (isDxf) setMouse(toImg(e.clientX, e.clientY));
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current; drag.current = null;
    if (!d || d.moved || e.button !== 0) return;
    if (d.pan && !(choosing && tool === "pan")) return;       // a plain click (no drag) on a drawing picks it
    if (tool === "pan") { click(toImg(e.clientX, e.clientY)); return; }
    click(snap(toImg(e.clientX, e.clientY), e.shiftKey).pt);
  }
  function zoomAt(factor: number, cx?: number, cy?: number) {
    const r = stageRef.current!.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2;
    setView((v) => {
      const k = Math.min(isDxf ? 400 : 40, Math.max(0.002, v.k * factor));
      const ix = (px - r.left - v.x) / v.k, iy = (py - r.top - v.y) / v.k;
      return { k, x: px - r.left - ix * k, y: py - r.top - iy * k };
    });
  }
  useEffect(() => {
    const st = stageRef.current; if (!st) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); };
    st.addEventListener("wheel", onWheel, { passive: false });
    return () => st.removeEventListener("wheel", onWheel);
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.code === "Space") { spaceDown.current = true; e.preventDefault(); }
      if (e.key === "Escape") { if (full && !draft.length) setFull(false); setDraft([]); setSelected(null); }
      if (e.key === "Enter") finishDraft();
      if (e.key === "Backspace" && draft.length) { e.preventDefault(); setDraft((d) => d.slice(0, -1)); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !draft.length) { update((p) => ({ ...p, shapes: p.shapes.filter((s) => s.id !== selected) })); setSelected(null); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") spaceDown.current = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ---------- calibration ---------- */
  const measureM = tool === "measure" && draft.length === 2 && mpp ? Math.hypot(draft[1][0] - draft[0][0], draft[1][1] - draft[0][1]) * mpp : 0;
  const calibPx = tool === "calibrate" && draft.length === 2 ? Math.hypot(draft[1][0] - draft[0][0], draft[1][1] - draft[0][1]) : 0;
  function applyCalib() {
    const mm = Number(calibMm);
    if (!(mm > 0) || !(calibPx > 0)) return;
    const [p1, p2] = draft;
    update((p) => ({ ...p, metersPerPx: mm / 1000 / calibPx, calib: { p1, p2, mm } }));
    setDraft([]); setCalibMm(""); setTool("slab");
  }

  /* ---------- save ---------- */
  async function save() {
    if (!size || !canvasRef.current) return;
    setSaving(true); setMsg(null);
    try {
      const blob = await renderPreview(canvasRef.current, t, size, isDxf);
      const path = `${tenantId}/${plan.id}/preview.jpg`;
      const up = await createClient().storage.from("floor-plans").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error("Could not save the plan picture: " + up.error.message);
      const res = await saveTakeoff(plan.id, { ...t, image: { ...(t.image ?? {}), w: size.w, h: size.h } }, totals, path);
      if (res.error) throw new Error(res.error);
      setDirty(false); setMsg({ ok: "Saved." });
      router.refresh();
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "Could not save." });
    } finally { setSaving(false); }
  }

  useEffect(() => {
    if (!autoSave || !dirty || saving || !size) return;
    setAutoSave(false);
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, dirty, saving, size]);

  /* ---------- render ---------- */
  const k = view.k;
  const sw = 2 / k;
  const needScale = !isDxf && !mpp;
  const tools: { id: Tool; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: "pan", label: "Move", icon: <Hand className="size-4" />, show: true },
    { id: "calibrate", label: "Set scale", icon: <Ruler className="size-4" />, show: canEdit && !isDxf },
    { id: "zoom", label: "Zoom box", icon: <ZoomIn className="size-4" />, show: true },
    { id: "measure", label: "Measure", icon: <MoveVertical className="size-4" />, show: true },
    { id: "region", label: "Plan region", icon: <Crop className="size-4" />, show: canEdit && isDxf },
    { id: "slab", label: "Slab area", icon: <Square className="size-4" />, show: canEdit },
    { id: "opening", label: "Opening", icon: <SquareDashed className="size-4" />, show: canEdit },
    { id: "wall", label: "Wall", icon: <PenLine className="size-4" />, show: canEdit },
    { id: "column", label: "Column", icon: <Columns3 className="size-4" />, show: canEdit },
    { id: "beam", label: "Beam", icon: <Minus className="size-4" />, show: canEdit },
    { id: "door", label: "Door", icon: <DoorOpen className="size-4" />, show: canEdit },
    { id: "window", label: "Window", icon: <AppWindow className="size-4" />, show: canEdit },
    { id: "loft", label: "Loft", icon: <Layers className="size-4" />, show: canEdit },
    { id: "separate", label: "Separate set", icon: <SquareDashed className="size-4" />, show: canEdit && isDxf },
    { id: "select", label: "Select", icon: <MousePointer2 className="size-4" />, show: canEdit },
  ];
  const draftPreview: Pt[] = hover && draft.length && tool !== "select" && tool !== "pan"
    ? tool === "column" || tool === "region" || tool === "zoom" ? [draft[0], [hover.pt[0], draft[0][1]], hover.pt, [draft[0][0], hover.pt[1]]] : (tool === "measure" || tool === "calibrate") && draft.length >= 2 ? draft : [...draft, hover.pt]
    : draft;
  const liveLabel = (() => {
    if (!hover || !draft.length || !mpp) return null;
    if (tool === "region" || tool === "zoom") return null;
    if (tool === "wall" || tool === "beam" || tool === "door" || tool === "window" || tool === "calibrate" || tool === "measure") return fmtLen(shapeMeasure({ id: "", kind: "wall", pts: draftPreview }, mpp).length);
    if (tool === "column") { const [a, , c] = draftPreview; return `${Math.round(Math.abs(c[0] - a[0]) * mpp * 1000)} × ${Math.round(Math.abs(c[1] - a[1]) * mpp * 1000)} mm`; }
    if (draftPreview.length >= 3) return fmtArea(polyArea(draftPreview) * mpp * mpp);
    return null;
  })();

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      {/* drawing area */}
      <div className={full ? "fixed inset-0 z-50 flex flex-col bg-graphite-950 p-2" : "min-w-0 flex-1"}>
        <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-graphite-800 bg-graphite-900 p-1.5">
          {tools.filter((x) => x.show).map((x) => (
            <button key={x.id} type="button" onClick={() => { setTool(x.id); setDraft([]); setSelected(null); }}
              className={cls("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium", tool === x.id ? "bg-brand-orange text-white" : "text-graphite-300 hover:bg-graphite-800")}>
              {x.icon}{x.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-graphite-700" />
          <IconBtn label="Zoom out" onClick={() => zoomAt(1 / 1.3)}><Minus className="size-4" /></IconBtn>
          <IconBtn label="Zoom in" onClick={() => zoomAt(1.3)}><Plus className="size-4" /></IconBtn>
          <IconBtn label={t.dxf?.region ? "Zoom to the selected drawing" : "Fit to screen"} onClick={zoomToSelected}><Maximize className="size-4" /></IconBtn>
          <IconBtn label={full ? "Exit full screen" : "Full screen"} onClick={() => { setFull((v) => !v); requestAnimationFrame(() => requestAnimationFrame(() => zoomToSelected())); }}>{full ? <Minimize className="size-4" /> : <Maximize className="size-4 rotate-45" />}</IconBtn>
          {isDxf ? (
            <>
              <span className="mx-1 h-5 w-px bg-graphite-700" />
              <button type="button" onClick={() => setShowText((v) => !v)} title="Show the drawing's texts"
                className={cls("inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs", showText ? "bg-graphite-700 text-graphite-50" : "text-graphite-400 hover:bg-graphite-800")}><Type className="size-4" />Text</button>
              <button type="button" onClick={() => setShowNames((v) => !v)} title="Outline and name every drawing in the file"
                className={cls("inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs", showNames ? "bg-graphite-700 text-graphite-50" : "text-graphite-400 hover:bg-graphite-800")}><Tag className="size-4" />Names</button>
              {parts.length > 1 ? (
                <select value="" onChange={(e) => { if (e.target.value === "all") { if (size) fit(size.w, size.h); return; } const pt = parts.find((q) => q.n === Number(e.target.value)); if (pt) fitBox(pt.px); }}
                  className="max-w-[220px] rounded-md border border-graphite-700 bg-graphite-950 px-2 py-1 text-xs text-graphite-100" aria-label="Go to drawing">
                  <option value="">Go to drawing… ({parts.length})</option>
                  <option value="all">Whole file</option>
                  {parts.map((q) => <option key={q.n} value={q.n}>{q.n}. {q.title}{q.sub ? ` — ${q.sub}` : ""}</option>)}
                </select>
              ) : null}
            </>
          ) : null}
          {draft.length > 0 && tool !== "calibrate" && tool !== "measure" && tool !== "region" && tool !== "zoom" && !isTwoPoint(tool) ? (
            <>
              <span className="mx-1 h-5 w-px bg-graphite-700" />
              {tool !== "column" ? <button type="button" onClick={finishDraft} className="inline-flex items-center gap-1 rounded-md bg-signal-green/15 px-2.5 py-1.5 text-xs font-medium text-signal-green"><Check className="size-4" />Finish</button> : null}
              <IconBtn label="Undo last point" onClick={() => setDraft((d) => d.slice(0, -1))}><Undo2 className="size-4" /></IconBtn>
              <IconBtn label="Cancel" onClick={() => setDraft([])}><X className="size-4" /></IconBtn>
            </>
          ) : null}
          {selected ? (
            <button type="button" onClick={() => { update((p) => ({ ...p, shapes: p.shapes.filter((s) => s.id !== selected) })); setSelected(null); }}
              className="ml-1 inline-flex items-center gap-1 rounded-md bg-signal-red/15 px-2.5 py-1.5 text-xs font-medium text-signal-red"><Trash2 className="size-4" />Delete selected</button>
          ) : null}
        </div>
        <p className="border-x border-graphite-800 bg-graphite-900 px-3 pb-2 text-xs text-graphite-400">
          {needScale && canEdit && tool !== "calibrate" ? <span className="font-medium text-signal-amber">First set the scale: choose “Set scale” and click a dimension you know. </span> : null}
          {TOOL_HINT[tool]}
        </p>

        <div
          ref={stageRef}
          className={cls("relative touch-none", full ? "min-h-0 flex-1" : "h-[62vh] min-h-[380px]", " select-none overflow-hidden rounded-b-lg border border-graphite-800", isDxf ? "bg-white" : "bg-[#e9eaec]",
            tool === "pan" ? "cursor-grab" : tool === "select" ? "cursor-pointer" : "cursor-crosshair")}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)} onDoubleClick={() => { if (tool === "wall" || tool === "beam" || tool === "slab" || tool === "opening" || tool === "loft" || tool === "separate") finishDraft(); }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!size && !loadErr ? <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-graphite-600"><Loader2 className="size-5 animate-spin" />Opening floor plan…</div> : null}
          {loadErr ? <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-signal-red">{loadErr}</div> : null}
          {isDxf ? <canvas ref={viewCanvasRef} className="pointer-events-none absolute left-0 top-0" /> : null}
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${k})`, width: size?.w, height: size?.h }}>
            <canvas ref={canvasRef} className={isDxf ? "block" : "block shadow-md"} style={{ width: size?.w, height: size?.h, background: "#fff", opacity: isDxf ? 0 : 1 }} />
            {size ? (
              <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
                {t.shapes.map((s) => {
                  const st = SHAPE_STYLE[s.kind]; const sel = s.id === selected;
                  const d = s.pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ") + (isOpen(s.kind) ? "" : " Z");
                  const m = mpp ? shapeMeasure(s, mpp) : null;
                  const c = centroid(s.pts);
                  return (
                    <g key={s.id}>
                      <path d={d} fill={st.fill} stroke={sel ? "#facc15" : st.stroke} strokeWidth={(isOpen(s.kind) ? 3 : 2) * sw * (sel ? 1.6 : 1)} strokeLinejoin="round" strokeDasharray={s.kind === "opening" || s.kind === "beam" ? `${6 * sw} ${4 * sw}` : undefined} />
                      {m && s.kind !== "column" ? (
                        <text x={c[0]} y={c[1]} fontSize={12 / k} textAnchor="middle" dominantBaseline="middle" fill={st.stroke} stroke="#fff" strokeWidth={3 / k} paintOrder="stroke" fontWeight={600}>
                          {codes[s.id]} · {isOpen(s.kind) ? fmtLen(m.length) : `${s.kind === "opening" ? "−" : ""}${fmtArea(m.area)}`}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {isDxf && showNames && !choosing && parts.length > 1 ? (
                  <g>
                    {parts.map((q) => (
                      <g key={`p${q.n}`}>
                        <rect x={q.px[0]} y={q.px[1]} width={q.px[2] - q.px[0]} height={q.px[3] - q.px[1]} fill="none" stroke="#0e7490" strokeOpacity={0.55} strokeWidth={1.2 * sw} strokeDasharray={`${3 * sw} ${3 * sw}`} />
                        <text x={q.px[0] + 4 / k} y={q.px[1] - 5 / k} fontSize={12 / k} fill="#0e7490" stroke="#fff" strokeWidth={3 / k} paintOrder="stroke" fontWeight={700}>
                          {q.n}. {q.title}{q.sub ? ` · ${q.sub}` : ""}
                        </text>
                      </g>
                    ))}
                  </g>
                ) : null}
                {choosing ? (
                  <g>
                    {candidates.map((c) => (
                      <g key={c.n}>
                        <rect x={c.px[0]} y={c.px[1]} width={c.px[2] - c.px[0]} height={c.px[3] - c.px[1]} fill="rgba(239,157,47,0.07)" stroke="#ef9d2f" strokeWidth={2 * sw} strokeDasharray={`${8 * sw} ${5 * sw}`} />
                        <text x={c.px[0] + 6 / k} y={c.px[1] - 6 / k} fontSize={13 / k} fill="#c2410c" stroke="#fff" strokeWidth={3 / k} paintOrder="stroke" fontWeight={700}>Drawing {c.n} · {c.w.toFixed(1)} × {c.h.toFixed(1)} m {c.title ? ` · ${c.title}` : ""} — click to count this one</text>
                      </g>
                    ))}
                  </g>
                ) : null}
                {isDxf && auto && frameRef.current && !choosing ? (
                  <g pointerEvents="none">
                    {(auto.slabLoops ?? []).map((l, i) => <polygon key={`as${i}`} points={l.map((q) => frameRef.current!.toPx(q).join(",")).join(" ")} fill="rgba(37,99,235,0.06)" stroke="#2563eb" strokeWidth={1.5 * sw} strokeDasharray={auto.slabFromWalls ? `${6 * sw} ${4 * sw}` : undefined} />)}
                    {(auto.openingLoops ?? []).map((l, i) => <polygon key={`ao${i}`} points={l.map((q) => frameRef.current!.toPx(q).join(",")).join(" ")} fill="rgba(147,51,234,0.15)" stroke="#9333ea" strokeWidth={1.2 * sw} />)}
                  </g>
                ) : null}
                {isDxf && t.dxf?.region ? (
                  <g>
                    <rect x={t.dxf.region[0]} y={t.dxf.region[1]} width={t.dxf.region[2] - t.dxf.region[0]} height={t.dxf.region[3] - t.dxf.region[1]} fill="none" stroke="#059669" strokeWidth={2 * sw} strokeDasharray={`${8 * sw} ${5 * sw}`} />
                    <text x={t.dxf.region[0] + 6 / k} y={t.dxf.region[1] - 6 / k} fontSize={12 / k} fill="#059669" stroke="#fff" strokeWidth={3 / k} paintOrder="stroke" fontWeight={600}>Plan region (counted)</text>
                  </g>
                ) : null}
                {t.calib && !isDxf ? (
                  <g opacity={0.8}>
                    <line x1={t.calib.p1[0]} y1={t.calib.p1[1]} x2={t.calib.p2[0]} y2={t.calib.p2[1]} stroke="#059669" strokeWidth={2 * sw} strokeDasharray={`${4 * sw} ${3 * sw}`} />
                    <text x={(t.calib.p1[0] + t.calib.p2[0]) / 2} y={(t.calib.p1[1] + t.calib.p2[1]) / 2 - 8 / k} fontSize={11 / k} textAnchor="middle" fill="#059669" stroke="#fff" strokeWidth={3 / k} paintOrder="stroke">scale {t.calib.mm} mm</text>
                  </g>
                ) : null}
                {draftPreview.length ? (
                  <g>
                    <path d={draftPreview.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ") + (tool === "column" || tool === "region" || tool === "zoom" ? " Z" : "")}
                      fill={tool === "slab" || tool === "opening" || tool === "column" ? SHAPE_STYLE[tool as ShapeKind].fill : "none"}
                      stroke={tool === "calibrate" || tool === "measure" || tool === "region" || tool === "zoom" ? "#059669" : SHAPE_STYLE[(tool === "select" || tool === "pan" ? "slab" : tool) as ShapeKind]?.stroke ?? "#059669"}
                      strokeWidth={2 * sw} strokeDasharray={`${5 * sw} ${3 * sw}`} />
                    {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={4 / k} fill="#fff" stroke="#111" strokeWidth={1.5 / k} />)}
                  </g>
                ) : null}
                {hover && tool !== "pan" && tool !== "select" ? (
                  <g>
                    <circle cx={hover.pt[0]} cy={hover.pt[1]} r={(hover.snapped ? 6 : 3) / k} fill={hover.snapped ? "rgba(16,185,129,0.25)" : "#111"} stroke={hover.snapped ? "#059669" : "none"} strokeWidth={1.5 / k} />
                    {liveLabel ? <text x={hover.pt[0] + 12 / k} y={hover.pt[1] - 12 / k} fontSize={13 / k} fill="#111" stroke="#fff" strokeWidth={3 / k} paintOrder="stroke" fontWeight={700}>{liveLabel}</text> : null}
                  </g>
                ) : null}
              </svg>
            ) : null}
          </div>

          {isDxf && size && mpp ? <Readout mouse={mouse} frame={frameRef.current} mpp={mpp} k={k} unitToM={t.dxf ? UNIT_TO_M[t.dxf.units] : 0.001} /> : null}
          {tool === "calibrate" && draft.length === 2 ? (
            <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-graphite-700 bg-graphite-950 p-2 shadow-lg" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
              <span className="text-xs text-graphite-300">Real length of this line</span>
              <input autoFocus type="number" min={1} value={calibMm} onChange={(e) => setCalibMm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyCalib(); }} placeholder="e.g. 6000" className="w-28 rounded border border-graphite-700 bg-graphite-900 px-2 py-1 text-sm text-graphite-100" />
              <span className="text-xs text-graphite-400">mm</span>
              <button type="button" onClick={applyCalib} disabled={!(Number(calibMm) > 0)} className="rounded bg-brand-orange px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">Set scale</button>
              <button type="button" onClick={() => setDraft([])} className="text-xs text-graphite-400 hover:text-graphite-200">Cancel</button>
            </div>
          ) : null}
          {tool === "measure" && draft.length === 2 ? (
            <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-graphite-700 bg-graphite-950 p-2 shadow-lg" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
              {mpp ? (
                <>
                  <span className="font-mono text-sm font-semibold text-graphite-50">{Math.round(measureM * 1000).toLocaleString("en-IN")} mm</span>
                  {canEdit ? (
                    <>
                      <button type="button" onClick={() => { update((p) => ({ ...p, params: { ...p.params, floorHeight: Math.round(measureM * 1000) / 1000 } })); setDraft([]); }} className="rounded bg-brand-orange px-2.5 py-1 text-xs font-medium text-white">Use as floor height</button>
                      <button type="button" onClick={() => { update((p) => ({ ...p, params: { ...p.params, slabMm: Math.round(measureM * 1000) } })); setDraft([]); }} className="rounded border border-graphite-700 px-2.5 py-1 text-xs text-graphite-200">Use as slab thickness</button>
                    </>
                  ) : null}
                </>
              ) : <span className="text-xs text-signal-amber">Set the scale first.</span>}
              <button type="button" onClick={() => setDraft([])} className="text-xs text-graphite-400 hover:text-graphite-200">Close</button>
            </div>
          ) : null}
        </div>

        {/* legend */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite-500">
          {(Object.keys(SHAPE_STYLE) as ShapeKind[]).map((kk) => (
            <span key={kk} className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: SHAPE_STYLE[kk].stroke }} />{SHAPE_STYLE[kk].label}</span>
          ))}
          {isDxf ? <span>· DXF layers are coloured by the role you choose on the right.</span> : null}
        </div>
      </div>

      {/* side panel */}
      <aside className="w-full shrink-0 space-y-4 xl:w-[360px]">
        {canEdit ? (
          <div className="flex items-center gap-2 rounded-lg border border-graphite-800 bg-graphite-900 p-3">
            <button type="button" onClick={save} disabled={saving || !size} className="inline-flex items-center gap-2 rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? "Saving…" : "Save measurements"}
            </button>
            <span className={cls("text-xs", msg?.error ? "text-signal-red" : dirty ? "text-signal-amber" : "text-signal-green")}>
              {msg?.error ?? (dirty ? "Unsaved changes" : msg?.ok ?? "All saved")}
            </span>
          </div>
        ) : null}

        {isDxf && parts.length > 1 ? (
          <Panel title={`Drawings in this file (${parts.length})`} hint="The file is split into its separate drawings. Click one to see it close up; “Count this” measures only that drawing (e.g. one block / wing).">
            <div className="mb-2 flex flex-wrap gap-1">
              {(["all", "plan", "section", "elevation", "site", "detail", "other"] as const).map((kk) => {
                const n = kk === "all" ? parts.length : parts.filter((q) => q.kind === kk).length;
                if (!n) return null;
                return (
                  <button key={kk} type="button" onClick={() => setPartFilter(kk)}
                    className={cls("rounded-full border px-2 py-0.5 text-[11px] capitalize", partFilter === kk ? "border-brand-orange bg-brand-orange/15 text-graphite-50" : "border-graphite-700 text-graphite-400 hover:text-graphite-200")}>
                    {kk === "all" ? "All" : `${kk}s`} {n}
                  </button>
                );
              })}
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
              {parts.filter((q) => partFilter === "all" || q.kind === partFilter).map((q) => {
                const r = t.dxf?.region;
                const counted = !!r && Math.abs(r[0] - q.px[0]) + Math.abs(r[1] - q.px[1]) + Math.abs(r[2] - q.px[2]) + Math.abs(r[3] - q.px[3]) < 0.02 * (q.px[2] - q.px[0] + q.px[3] - q.px[1]);
                return (
                  <li key={q.n} className={cls("flex items-center gap-2 rounded px-1.5 py-1 hover:bg-graphite-800", counted && "bg-signal-green/10 ring-1 ring-signal-green/40")}>
                    <span className="w-6 shrink-0 text-right font-mono text-graphite-500">{q.n}</span>
                    <button type="button" onClick={() => fitBox(q.px)} className="min-w-0 flex-1 text-left" title="Show this drawing">
                      <span className="block truncate text-graphite-100">{q.title}</span>
                      <span className="block truncate text-[11px] text-graphite-500">{q.kind} · {q.w.toFixed(1)} × {q.h.toFixed(1)} m{q.sub ? ` · ${q.sub}` : ""}</span>
                    </button>
                    {counted ? <span className="text-[11px] text-signal-green">counted</span> : canEdit && (q.kind === "plan" || q.kind === "other") ? (
                      <button type="button" onClick={() => { setChoosing(false); update((pp) => ({ ...pp, dxf: pp.dxf ? { ...pp.dxf, region: q.px } : pp.dxf })); }}
                        className="shrink-0 rounded border border-graphite-700 px-1.5 py-0.5 text-[11px] text-graphite-200 hover:border-brand-orange">Count this</button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}

        <Panel title="Scale & heights">
          {isDxf && t.dxf ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Drawing units">
                <select value={t.dxf.units} disabled={!canEdit} className={numIn}
                  onChange={(e) => { const u = e.target.value as DxfUnits; update((p) => ({ ...p, dxf: { ...p.dxf!, units: u }, metersPerPx: (frameRef.current?.unitsPerPx ?? 0) * UNIT_TO_M[u] })); setUnitsGuessed(false); }}>
                  <option value="mm">millimetres</option><option value="cm">centimetres</option><option value="m">metres</option><option value="in">inches</option><option value="ft">feet</option>
                </select>
              </Field>
              <Field label="Walls drawn as">
                <select value={t.dxf.wallsDrawn} disabled={!canEdit} className={numIn} onChange={(e) => update((p) => ({ ...p, dxf: { ...p.dxf!, wallsDrawn: e.target.value as "faces" | "centre" } }))}>
                  <option value="faces">both faces (2 lines)</option><option value="centre">single centre line</option>
                </select>
              </Field>
              {unitsGuessed ? <p className="col-span-2 text-xs text-signal-amber">The file doesn&apos;t say its units — we guessed {t.dxf.units}. Check one known dimension.</p> : null}
            </div>
          ) : (
            <p className="text-xs text-graphite-400">
              {mpp ? <>Scale set{t.calib ? ` from a ${t.calib.mm} mm line` : ""}: 1 px = {(mpp * 1000).toFixed(1)} mm. </> : <span className="text-signal-amber">Scale not set yet. </span>}
              {canEdit ? <button type="button" onClick={() => { setTool("calibrate"); setDraft([]); }} className="text-brand-orange hover:underline">{mpp ? "Re-set scale" : "Set scale"}</button> : null}
            </p>
          )}
          {plan.source_kind === "pdf" && pdfPages > 1 ? (
            <Field label={`PDF page (of ${pdfPages})`}>
              <select value={t.image?.page ?? 1} disabled={!canEdit} className={numIn} onChange={(e) => changePdfPage(Number(e.target.value))}>
                {Array.from({ length: pdfPages }, (_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}
              </select>
            </Field>
          ) : null}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field label="Floor height (mm)"><NumInput value={Math.round(t.params.floorHeight * 1000)} step={5} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, floorHeight: v / 1000 } }))} /></Field>
            <Field label="Slab (mm)"><NumInput value={t.params.slabMm} step={5} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, slabMm: v } }))} /></Field>
            <Field label="No. of floors (info)"><NumInput value={t.params.floors} step={1} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, floors: Math.max(1, Math.round(v)) } }))} /></Field>
          </div>
          <p className="mt-1.5 text-[11px] text-graphite-500">Walls and columns are shuttered to the slab bottom: clear height {Math.round(totals.clear_height * 1000)} mm (floor height − slab).</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label={t.params.wallTopM2 == null ? "Wall tops to deduct (m²) · auto" : "Wall tops to deduct (m²)"}><NumInput value={t.params.wallTopM2 ?? totals.wall_top_area} step={0.01} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, wallTopM2: v } }))} /></Field>
            <Field label="Add % (extra)"><NumInput value={t.params.extraPct ?? rules.extraPct} step={1} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, extraPct: Math.min(100, v) } }))} /></Field>
          </div>
          {t.params.wallTopM2 != null && totals.wall_top_drawn > 0 && canEdit ? (
            <button type="button" onClick={() => update((p) => ({ ...p, params: { ...p.params, wallTopM2: undefined } }))} className="mt-1 text-[11px] text-brand-orange hover:underline">
              Use wall tops from the drawing ({fmtArea(totals.wall_top_drawn)})
            </button>
          ) : null}
          <OverrideBox t={t} totals={drawnTotals} canEdit={canEdit} update={update} />
          <label className="mt-2 flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wide text-graphite-500">Scope of the order</span>
            <select disabled={!canEdit} value={t.params.scope ?? "full"} onChange={(e) => update((p) => ({ ...p, params: { ...p.params, scope: e.target.value as Scope } }))}
              className="rounded border border-graphite-700 bg-graphite-950 px-2 py-1.5 text-sm text-graphite-100">
              {(Object.keys(SCOPES) as Scope[]).map((k) => <option key={k} value={k}>{SCOPES[k].label} — {SCOPES[k].what}</option>)}
            </select>
          </label>
          {auto && ((auto.upstands ?? []).some((x) => x.parapet) || auto.windowGaps?.count || auto.edgeBeamLength) ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Balcony parapet height (mm)"><NumInput value={t.params.parapetMm ?? 900} step={50} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, parapetMm: v } }))} /></Field>
              <Field label="Window sill height (mm)"><NumInput value={t.params.sillMm ?? 900} step={50} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, sillMm: v } }))} /></Field>
              <label className="col-span-2 flex items-center gap-2 text-xs text-graphite-300">
                <input type="checkbox" disabled={!canEdit} checked={t.params.autoEdgeBeams !== false} onChange={(e) => update((p) => ({ ...p, params: { ...p.params, autoEdgeBeams: e.target.checked } }))} />
                Edge beams at slab edges without a wall (balcony fronts) — depth = beam depth
              </label>
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field label="Wall thk (mm)"><NumInput value={t.params.wallThkMm ?? 150} step={5} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, wallThkMm: v } }))} /></Field>
            <Field label="Beam width (mm)"><NumInput value={t.params.beamWidthMm ?? 200} step={5} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, beamWidthMm: v } }))} /></Field>
            <Field label="Beam depth (mm)"><NumInput value={t.params.beamDepthMm ?? 600} step={25} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, beamDepthMm: v } }))} /></Field>
          </div>
          {auto?.wallPairs ? (
            <div className="mt-2">
              <Field label="Thinnest concrete wall (mm)"><NumInput value={t.params.minWallMm ?? 75} step={5} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, minWallMm: v } }))} /></Field>
              <p className="mt-1 text-[11px] text-graphite-500">
                Walls on this drawing are loose lines, read as pairs: {Object.entries(auto.wallPairs.byThk).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} mm ${Math.round(v)} m`).join(", ")}. Thinner walls (blockwork) are left out — e.g. 125 leaves out 100 mm walls.
              </p>
            </div>
          ) : null}
          <p className="mt-1 text-[11px] text-graphite-500">
            Wall tops ≈ wall length × thickness — at 150 mm that is {fmtArea(totals.wall_length * 0.15)}; at 125 mm {fmtArea(totals.wall_length * 0.125)}.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-graphite-300">
            <input type="checkbox" disabled={!canEdit} checked={t.params.includeEdges ?? rules.slabEdges} onChange={(e) => update((p) => ({ ...p, params: { ...p.params, includeEdges: e.target.checked } }))} />
            Slab &amp; duct edge formwork (perimeter × slab thickness){t.params.includeEdges == null ? " — company rule" : ""}
          </label>
          <div className="mt-2 flex items-center gap-2 text-xs text-graphite-300">
            <span>Openings not deducted if smaller than</span>
            <div className="w-20"><NumInput value={t.params.minOpeningM2 ?? rules.minOpeningM2} step={0.1} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, minOpeningM2: Math.max(0, Math.min(5, v)) } }))} /></div>
            <span>m²{t.params.minOpeningM2 == null ? " (company rule)" : ""}</span>
          </div>
        </Panel>

        {isDxf && t.dxf && layers.length ? (
          <Panel title={`DXF layers (${layers.length})`} hint="Tell the app what each layer is. Areas and lengths are then read automatically. The eye only hides a layer on screen.">
            <div className="mb-1.5 flex gap-3 text-[11px]">
              <button type="button" className="text-brand-orange hover:underline" onClick={() => setHidden({})}>Show all</button>
              <button type="button" className="text-brand-orange hover:underline" onClick={() => setHidden(Object.fromEntries(layers.filter((l) => (t.dxf!.layerRoles[l.name] ?? "ignore") === "ignore").map((l) => [l.name, true])))}>Only counted layers</button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {layers.map((l) => {
                const role = t.dxf!.layerRoles[l.name] ?? "ignore";
                return (
                  <div key={l.name} className={cls("flex items-center gap-2", hidden[l.name] && "opacity-50")}>
                    <button type="button" onClick={() => setHidden((h) => ({ ...h, [l.name]: !h[l.name] }))} className="text-graphite-400 hover:text-graphite-100" title={hidden[l.name] ? "Show this layer" : "Hide this layer (it is still counted)"}>
                      {hidden[l.name] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                    <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: ROLE_COLOR[role] }} />
                    <span className="min-w-0 flex-1 truncate text-xs text-graphite-200" title={l.name}>{l.name} <span className="text-graphite-500">({l.count})</span></span>
                    <select value={role} disabled={!canEdit} className="rounded border border-graphite-700 bg-graphite-950 px-1.5 py-0.5 text-xs text-graphite-100"
                      onChange={(e) => { const r = e.target.value as LayerRole; update((p) => ({ ...p, dxf: { ...p.dxf!, layerRoles: { ...p.dxf!.layerRoles, [l.name]: r } } })); setLayerVersion((v) => v + 1); }}>
                      <option value="ignore">Ignore</option><option value="slab">Slab outline</option><option value="opening">Openings / ducts</option><option value="walls">Walls</option><option value="columns">Columns</option><option value="beams">Beams</option><option value="upstand">Upstands / planters</option>
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-graphite-500">
              {t.dxf.region ? <>Counting only inside the green plan region. {canEdit ? <button type="button" className="text-brand-orange hover:underline" onClick={() => update((p) => ({ ...p, dxf: p.dxf ? { ...p.dxf, region: null } : p.dxf }))}>Clear region</button> : null}</>
                : <>Whole drawing is counted. If the file also has sections or elevations, use <b>Plan region</b> to box the floor plan.</>}
            </p>
            {Object.values(t.dxf.layerRoles).includes("beams") ? (
              <div className="mt-2 grid grid-cols-2 items-end gap-2">
                <Field label="Beam depth (mm)"><NumInput value={t.params.beamDepthMm ?? 600} step={25} disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, params: { ...p.params, beamDepthMm: v } }))} /></Field>
                <p className="pb-1 text-[11px] text-graphite-500">Beam lines × (depth − slab)</p>
              </div>
            ) : null}
            {auto ? (
              <p className="mt-2 text-[11px] text-graphite-500">
                Read from layers: slab {fmtArea(auto.slabArea)}{auto.slabFromWalls ? " (outer face of walls & parapets — blue dashed line)" : ""}, ducts / lifts {fmtArea(auto.openingArea)}, wall length (faces) {fmtLen(auto.wallLineLength)}, wall tops {fmtArea(auto.wallTopArea ?? 0)}{auto.beamLineLength ? `, beam lines ${fmtLen(auto.beamLineLength)}` : ""}, {auto.columns.length} columns. Ducts not drawn as a box or an X: add them with the Opening tool. Beams from a structural drawing and the staircase: add them in the Beams and Extra rows.
              </p>
            ) : null}
          </Panel>
        ) : null}

        <Panel title={`Drawn on the plan (${t.shapes.length})`}>
          {t.shapes.length === 0 ? <p className="text-xs text-graphite-500">Nothing drawn yet. Use Slab area, Opening, Wall or Column above the plan.</p> : (
            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1 text-xs">
              {t.shapes.map((s) => {
                const m = mpp ? shapeMeasure(s, mpp) : null;
                return (
                  <li key={s.id} className={cls("flex items-center gap-2 rounded px-1.5 py-1", s.id === selected && "bg-graphite-800")}>
                    <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: SHAPE_STYLE[s.kind].stroke }} />
                    <button type="button" className="flex-1 text-left text-graphite-200" onClick={() => { setSelected(s.id); setTool("select"); }}><span className="font-mono text-graphite-400">{codes[s.id]}</span> {SHAPE_STYLE[s.kind].label}{s.kind === "wall" && s.t ? ` ${s.t}` : s.kind === "beam" ? ` ${s.b ?? t.params.beamWidthMm ?? 200}×${s.d ?? t.params.beamDepthMm ?? 600}` : s.kind === "door" || s.kind === "window" ? ` ×${s.h ?? (s.kind === "door" ? 2100 : 1200)}${s.kind === "window" ? ` sill ${s.sill ?? 900}` : ""}` : ""}</button>
                    <span className="font-mono text-graphite-400">{m ? (isOpen(s.kind) ? fmtLen(m.length) : s.kind === "column" ? colSize(s.pts, mpp!) : fmtArea(m.area)) : "—"}</span>
                    {canEdit ? <button type="button" aria-label="Delete" onClick={() => update((p) => ({ ...p, shapes: p.shapes.filter((x) => x.id !== s.id) }))} className="text-graphite-500 hover:text-signal-red"><Trash2 className="size-3.5" /></button> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {selShape && canEdit ? (
          <Panel title={`Element ${codes[selShape.id]} · ${SHAPE_STYLE[selShape.kind].label}`} hint="Leave a size blank to use the plan default.">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Code / name"><input maxLength={20} value={selShape.label ?? ""} placeholder={codes[selShape.id]} className={numIn} onChange={(e) => setShape(selShape.id, { label: e.target.value || undefined })} /></Field>
              {selShape.kind === "wall" ? <>
                <Field label="Thickness mm"><OptNum value={selShape.t} placeholder={String(t.params.wallThkMm ?? 150)} onChange={(v) => setShape(selShape.id, { t: v })} /></Field>
                <Field label="Height mm"><OptNum value={selShape.h} placeholder={String(Math.round(totals.clear_height * 1000))} onChange={(v) => setShape(selShape.id, { h: v })} /></Field>
              </> : null}
              {selShape.kind === "beam" ? <>
                <Field label="Width mm"><OptNum value={selShape.b} placeholder={String(t.params.beamWidthMm ?? 200)} onChange={(v) => setShape(selShape.id, { b: v })} /></Field>
                <Field label="Depth mm"><OptNum value={selShape.d} placeholder={String(t.params.beamDepthMm ?? 600)} onChange={(v) => setShape(selShape.id, { d: v })} /></Field>
              </> : null}
              {selShape.kind === "door" || selShape.kind === "window" ? <>
                <Field label="Height mm"><OptNum value={selShape.h} placeholder={String(selShape.kind === "door" ? 2100 : 1200)} onChange={(v) => setShape(selShape.id, { h: v })} /></Field>
                {selShape.kind === "window" ? <Field label="Sill mm"><OptNum value={selShape.sill} placeholder="900" onChange={(v) => setShape(selShape.id, { sill: v })} /></Field> : null}
                <Field label="Wall thk mm"><OptNum value={selShape.t} placeholder={String(t.params.wallThkMm ?? 150)} onChange={(v) => setShape(selShape.id, { t: v })} /></Field>
              </> : null}
              {selShape.kind === "slab" ? <>
                <Field label="Thickness mm"><OptNum value={selShape.t} placeholder={String(t.params.slabMm)} onChange={(v) => setShape(selShape.id, { t: v })} /></Field>
                <Field label="Level mm (− sunk)"><LevelInput value={selShape.lvl} onChange={(v) => setShape(selShape.id, { lvl: v })} /></Field>
              </> : null}
              {selShape.kind === "loft" ? <>
                <Field label="Thickness mm"><OptNum value={selShape.t} placeholder="75" onChange={(v) => setShape(selShape.id, { t: v })} /></Field>
                <Field label="Bottom level mm"><OptNum value={selShape.lvl} placeholder="2100" onChange={(v) => setShape(selShape.id, { lvl: v })} /></Field>
              </> : null}
              {selShape.kind === "column" ? <Field label="Height mm"><OptNum value={selShape.h} placeholder={String(Math.round(totals.clear_height * 1000))} onChange={(v) => setShape(selShape.id, { h: v })} /></Field> : null}
            </div>
          </Panel>
        ) : null}

        <Panel title="Columns by size" hint="Add columns you didn't draw (typed from the column schedule).">
          <RowsEditor
            rows={t.columns} disabled={!canEdit}
            cols={[{ k: "w_mm", label: "Width mm" }, { k: "d_mm", label: "Depth mm" }, { k: "qty", label: "Nos." }]}
            blank={{ w_mm: 230, d_mm: 600, qty: 1 }}
            onChange={(rows) => update((p) => ({ ...p, columns: rows }))}
          />
        </Panel>

        <Panel title="Beams" hint="IS 1200-5: sides and soffits of beams. Area = length × Nos × [sides × (D − slab) + Ext × D + Btm × b]. Internal beam: Sides 2. Edge beam: Sides 1 + Ext 1 (outer face full depth). Btm 1 only if the beam soffit is outside the slab outline. If Length is already the total side length (ACOFORM sheet), use Sides 1.">
          <RowsEditor
            rows={t.beams} disabled={!canEdit}
            cols={[{ k: "label", label: "Mark", text: true }, { k: "width_mm", label: "b mm" }, { k: "depth_mm", label: "D mm" }, { k: "length_m", label: "Length m" }, { k: "qty", label: "Nos" }, { k: "sides", label: "Sides" }, { k: "ext", label: "Ext" }, { k: "bottom", label: "Btm" }]}
            blank={{ label: `B${t.beams.length + 1}`, width_mm: 230, depth_mm: 600, length_m: 4, qty: 1, sides: 2, ext: 0, bottom: 0 }}
            onChange={(rows) => update((p) => ({ ...p, beams: rows }))}
          />
        </Panel>

        <Panel title="Staircase" hint="Per flight: waist slab soffit (width × sloped length) + riser faces + open side cheeks + landing soffit, × number of flights. Sizes in mm, landing in m².">
          <StairsEditor rows={t.stairs ?? []} disabled={!canEdit} onChange={(rows) => update((p) => ({ ...p, stairs: rows }))} />
        </Panel>

        <Panel title="Other items (lump sum)" hint="Lump-sum areas added to the floor total, e.g. ST1 = 100 m² if you don't use the staircase calculator.">
          <RowsEditor
            rows={t.extras ?? []} disabled={!canEdit}
            cols={[{ k: "label", label: "Item", text: true }, { k: "area_m2", label: "Area m²" }]}
            blank={{ label: "Staircase", area_m2: 100 }}
            onChange={(rows) => update((p) => ({ ...p, extras: rows }))}
          />
        </Panel>

        <Panel title="Non-typical floors — additional requirement" hint="Mivan: one set is reused on every floor, so only the typical floor is measured. Add here only the EXTRA area other floors need (first floor, terrace, refuge floor, podium changes…). Added once to the set, not per floor.">
          <RowsEditor
            rows={t.nonTypical ?? []} disabled={!canEdit}
            cols={[{ k: "label", label: "Floor / item", text: true }, { k: "area_m2", label: "Extra m²" }]}
            blank={{ label: "First floor extra", area_m2: 0 }}
            onChange={(rows) => update((p) => ({ ...p, nonTypical: rows }))}
          />
        </Panel>

        <Panel title="Formwork area (typical floor)">
          {needPick ? (
            <p className="mb-2 rounded-md border border-signal-amber/40 bg-signal-amber/10 px-2.5 py-2 text-xs text-signal-amber">The typical floor plan has not been chosen yet for this file.</p>
          ) : isDxf && t.dxf && candidates.length > 1 ? (
            <div className="mb-2 rounded-md border border-signal-green/30 bg-signal-green/10 px-2.5 py-2 text-xs text-graphite-200">
              <p>
                <b>Counting:</b> {current ? `${current.title ?? `Drawing ${current.n}`} (${current.w.toFixed(1)} × ${current.h.toFixed(1)} m)` : currentPart ? `${currentPart.title} (${currentPart.w.toFixed(1)} × ${currentPart.h.toFixed(1)} m)` : t.dxf.region ? "your marked region" : "whole drawing"}
                {canEdit ? <button type="button" onClick={() => { if (!choosing && size) fit(size.w, size.h); else if (choosing) zoomToSelected(); setChoosing((v) => !v); }} className="ml-2 underline hover:text-signal-amber">{choosing ? "Cancel" : "Choose another drawing"}</button> : null}
                {canEdit ? <button type="button" onClick={() => { if (window.confirm("Read the drawing again? The typical floor, number of floors, floor height, slab thickness and beam depth (from the sections) are picked again from the drawing (your other figures stay).")) detect(true); }} className="ml-2 inline-flex items-center gap-1 underline hover:text-signal-amber"><RefreshCw className="size-3" />Read drawing again</button> : null}
              </p>
              {autoNote ?? t.auto?.note ? <p className="mt-1 text-graphite-400">Read from the drawing when first opened: {autoNote ?? t.auto?.note} Your own changes are never overwritten.</p> : null}
              {choosing ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {candidates.map((c) => (
                    <button key={c.n} type="button" onClick={() => pickPlan(c)} className={cls("rounded border px-2 py-1 font-medium hover:bg-signal-amber/20", current?.n === c.n ? "border-signal-green" : "border-signal-amber/50")}>
                      {c.title ?? `Drawing ${c.n}`} · {c.w.toFixed(1)} × {c.h.toFixed(1)} m
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : isDxf && t.dxf && !t.dxf.region ? (
            <p className="mb-2 rounded-md border border-signal-amber/40 bg-signal-amber/10 px-2.5 py-2 text-xs text-signal-amber">
              Whole drawing is counted. If the file also has sections or elevations, click <b>Plan region</b> and box ONE typical floor plan.
            </p>
          ) : null}
          {needPick ? null : <table className="w-full text-xs">
            <tbody className="divide-y divide-graphite-800">
              <TRow k="Slab area (less ducts)" v={fmtArea(totals.plan_area)} />
              <TRow k={`1 · Slab${totals.wall_top_area ? ` (− ${fmtArea(totals.wall_top_area)} wall tops)` : ""}`} v={fmtArea(totals.slab_soffit)} />
              {totals.slab_edge ? <TRow k="Slab & duct edges (perimeter × slab)" v={fmtArea(totals.slab_edge)} /> : null}
              <TRow k={`2 · Walls · ${fmtLen(totals.wall_length * 2)} faces`} v={fmtArea(totals.wall_area)} />
              {totals.column_count ? <TRow k={`Columns · ${totals.column_count} nos.`} v={fmtArea(totals.column_area)} /> : null}
              <TRow k="3 · Beams" v={fmtArea(totals.beam_area)} />
              <TRow k="4 · Staircase & others" v={fmtArea(totals.extra_area)} />
              <TRow k="Total for typical floor" v={fmtArea(totals.contact_area)} strong />
              {totals.extra_pct ? <TRow k={`Add ${totals.extra_pct}%`} v={fmtArea(totals.typical_quote)} strong /> : null}
              {totals.nontypical_area ? <TRow k="+ Additional for non-typical floors" v={fmtArea(totals.nontypical_area)} /> : null}
              {totals.nontypical_area ? <TRow k="Formwork set (used on all floors)" v={fmtArea(totals.quote_area)} strong /> : null}
              <TRow k="Vertical set (walls + columns)" v={fmtArea(totals.vertical_area)} />
            </tbody>
          </table>}
          {!needPick ? (
            <details className="mt-2 text-[11px] text-graphite-500">
              <summary className="cursor-pointer">Measurement rules used (change in <a href="/settings#measurement" className="underline">Settings</a>)</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{describeRules(totals.rules ?? rules).map((l) => <li key={l}>{l}</li>)}</ul>
            </details>
          ) : null}
          {totals.column_sizes.length ? (
            <p className="mt-2 text-[11px] text-graphite-500">Column sizes: {totals.column_sizes.map((c) => `${c.qty} × ${c.size}`).join(", ")}</p>
          ) : null}
          {needScale && t.shapes.length ? <p className="mt-2 text-xs text-signal-amber">Set the scale to see areas of drawn items.</p> : null}
        </Panel>

        <Panel title={`Formwork area list (${totals.items.length})`} hint="Every element with its working — printed on the quotation.">
          {needPick ? <p className="text-xs text-signal-amber">The typical floor plan has not been chosen yet.</p> : totals.items.length === 0 ? <p className="text-xs text-graphite-500">Nothing measured yet.</p> : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-graphite-800">
                  {totals.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-1.5 align-top font-mono text-graphite-400">{it.code}</td>
                      <td className="py-1 pr-1.5 align-top"><div className="text-graphite-200">{it.label}</div><div className="font-mono text-graphite-500">{it.calc}</div></td>
                      <td className={cls("py-1 text-right align-top font-mono", it.area < 0 ? "text-signal-red" : "text-graphite-200")}>{it.area.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  <tr><td /><td className="py-1.5 font-medium text-graphite-100">Total for typical floor</td><td className="py-1.5 text-right font-mono font-semibold text-graphite-50">{totals.contact_area.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Shell plan" hint="Concrete-only drawing for client approval: codes, sizes, schedules and title block.">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Drawing no."><MetaInput value={t.shell?.drawingNo} placeholder="SP-01" disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, shell: { ...p.shell, drawingNo: v } }))} /></Field>
            <Field label="Revision"><MetaInput value={t.shell?.rev} placeholder="R0" disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, shell: { ...p.shell, rev: v } }))} /></Field>
            <Field label="Drawn by"><MetaInput value={t.shell?.drawnBy} placeholder="" disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, shell: { ...p.shell, drawnBy: v } }))} /></Field>
            <Field label="Checked by"><MetaInput value={t.shell?.checkedBy} placeholder="" disabled={!canEdit} onChange={(v) => update((p) => ({ ...p, shell: { ...p.shell, checkedBy: v } }))} /></Field>
          </div>
          <Field label="Notes (one per line)">
            <textarea rows={3} disabled={!canEdit} defaultValue={t.shell?.notes ?? ""} maxLength={1500} placeholder="All dimensions are in mm unless noted." className={numIn}
              onChange={(e) => update((p) => ({ ...p, shell: { ...p.shell, notes: e.target.value } }))} />
          </Field>
          <div className="mt-2 flex gap-2">
            <a href={dirty ? undefined : `/floor-plans/${plan.id}/shell-plan`} target="_blank" rel="noreferrer" aria-disabled={dirty}
              className={cls("inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white", dirty && "pointer-events-none opacity-40")}>
              <FileDown className="size-3.5" />Shell plan PDF
            </a>
            <a href={dirty ? undefined : `/floor-plans/${plan.id}/shell-plan?format=dxf`} aria-disabled={dirty}
              className={cls("inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-graphite-700 px-3 py-2 text-xs font-medium text-graphite-200", dirty && "pointer-events-none opacity-40")}>
              <FileDown className="size-3.5" />DXF for AutoCAD
            </a>
          </div>
          <a href={dirty ? undefined : `/floor-plans/${plan.id}/area-sheet`} target="_blank" rel="noreferrer" aria-disabled={dirty}
            className={cls("mt-2 flex items-center justify-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-white", dirty && "pointer-events-none opacity-40")}>
            <FileDown className="size-3.5" />Area calculation sheet (PDF)
          </a>
          <a href={dirty ? undefined : `/floor-plans/${plan.id}/panels`} aria-disabled={dirty}
            className={cls("mt-2 flex items-center justify-center gap-1.5 rounded-md border border-brand-orange/60 px-3 py-2 text-xs font-medium text-graphite-100 hover:bg-graphite-800", dirty && "pointer-events-none opacity-40")}>
            Panel layout &amp; BOM →
          </a>
          {dirty ? <p className="mt-1 text-[11px] text-signal-amber">Save the measurements first.</p> : null}
        </Panel>

        <UseInQuotation planId={plan.id} lead={plan.lead} quotes={quotes} totals={totals} dirty={dirty} canEdit={canEdit} />
        {designs ? <SendToDesign planId={plan.id} designs={designs} dirty={dirty} wallSegments={t.shapes.filter((s) => s.kind === "wall").reduce((n, s) => n + Math.max(0, s.pts.length - 1), 0)} /> : null}
      </aside>
    </div>
  );
}

/* ---------- helpers ---------- */
function colSize(pts: Pt[], mpp: number) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return `${Math.round((Math.max(...xs) - Math.min(...xs)) * mpp * 1000)} × ${Math.round((Math.max(...ys) - Math.min(...ys)) * mpp * 1000)} mm`;
}
function centroid(pts: Pt[]): Pt {
  if (pts.length === 2) return [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
function distSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  const tt = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + tt * dx), p[1] - (a[1] + tt * dy));
}
function hitTest(s: Shape, p: Pt, tol: number) {
  if (isOpen(s.kind)) return s.pts.some((q, i) => i > 0 && distSeg(p, s.pts[i - 1], q) < tol);
  let c = false;
  for (let i = 0, j = s.pts.length - 1; i < s.pts.length; j = i++) {
    const [xi, yi] = s.pts[i], [xj, yj] = s.pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c || s.pts.some((q, i) => distSeg(p, s.pts[(i + s.pts.length - 1) % s.pts.length], q) < tol);
}

/** Plan picture with the measurements drawn on it — saved as preview.jpg and printed on the quotation. */
async function renderPreview(src: HTMLCanvasElement, t: Takeoff, size: { w: number; h: number }, isDxf: boolean): Promise<Blob> {
  const codes = shapeCodes(t.shapes);
  const f = Math.min(1, 1800 / Math.max(size.w, size.h));
  const c = document.createElement("canvas"); c.width = Math.round(size.w * f); c.height = Math.round(size.h * f);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const lw = Math.max(2, Math.round(Math.max(c.width, c.height) / 500));
  for (const s of t.shapes) {
    const st = SHAPE_STYLE[s.kind];
    ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * f, p[1] * f) : ctx.moveTo(p[0] * f, p[1] * f)));
    if (!isOpen(s.kind)) { ctx.closePath(); ctx.fillStyle = st.fill; ctx.fill(); }
    ctx.setLineDash(s.kind === "opening" || s.kind === "beam" ? [lw * 3, lw * 2] : []);
    ctx.strokeStyle = st.stroke; ctx.lineWidth = isOpen(s.kind) ? lw * 1.6 : lw; ctx.lineJoin = "round"; ctx.stroke();
    if (t.metersPerPx && s.kind !== "column") {
      const m = shapeMeasure(s, t.metersPerPx); const cc = centroid(s.pts);
      const label = `${codes[s.id]} ${isOpen(s.kind) ? fmtLen(m.length) : `${s.kind === "opening" ? "−" : ""}${fmtArea(m.area)}`}`;
      ctx.setLineDash([]); ctx.font = `bold ${lw * 7}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = lw * 2; ctx.strokeStyle = "#fff"; ctx.strokeText(label, cc[0] * f, cc[1] * f);
      ctx.fillStyle = st.stroke; ctx.fillText(label, cc[0] * f, cc[1] * f);
    }
  }
  void isDxf;
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not create the plan picture."))), "image/jpeg", 0.85));
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-graphite-800 bg-graphite-900 p-3">
      <h3 className="text-sm font-medium text-graphite-100">{title}</h3>
      {hint ? <p className="mb-2 mt-0.5 text-[11px] text-graphite-500">{hint}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-[11px] font-medium uppercase tracking-wide text-graphite-500">{label}</span>{children}</label>;
}
function MetaInput({ value, placeholder, disabled, onChange }: { value: string | undefined; placeholder: string; disabled?: boolean; onChange: (v: string) => void }) {
  return <input maxLength={40} defaultValue={value ?? ""} placeholder={placeholder} disabled={disabled} className={numIn} onChange={(e) => onChange(e.target.value)} />;
}
function LevelInput({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [s, setS] = useState(value != null ? String(value) : "");
  return <input type="number" step="any" value={s} placeholder="0" className={numIn}
    onChange={(e) => { setS(e.target.value); const n = Number(e.target.value); onChange(e.target.value === "" || !Number.isFinite(n) || n === 0 ? undefined : Math.max(-2000, Math.min(5000, n))); }} />;
}
function OptNum({ value, placeholder, onChange }: { value: number | undefined; placeholder: string; onChange: (v: number | undefined) => void }) {
  const [s, setS] = useState(value != null ? String(value) : "");
  useEffect(() => { setS(value != null ? String(value) : ""); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input type="number" min={0} step="any" value={s} placeholder={placeholder} className={numIn}
    onChange={(e) => { setS(e.target.value); const n = Number(e.target.value); onChange(e.target.value === "" || !(n > 0) ? undefined : n); }} />;
}
function NumInput({ value, onChange, step, disabled }: { value: number; onChange: (v: number) => void; step?: number; disabled?: boolean }) {
  const [s, setS] = useState(String(value));
  useEffect(() => { if (Number(s) !== value) setS(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input type="number" min={0} step={step} value={s} disabled={disabled} className={numIn} onChange={(e) => { setS(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) onChange(n); }} />;
}
function TRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <tr><td className={cls("py-1.5 pr-2", strong ? "font-medium text-graphite-100" : "text-graphite-400")}>{k}</td><td className={cls("py-1.5 text-right font-mono", strong ? "font-semibold text-graphite-50" : "text-graphite-300")}>{v}</td></tr>;
}
function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="rounded-md p-1.5 text-graphite-300 hover:bg-graphite-800">{children}</button>;
}
function Cell({ value, text, disabled, onChange }: { value: number | string | undefined; text?: boolean; disabled?: boolean; onChange: (v: number | string) => void }) {
  const [s, setS] = useState(String(value ?? ""));
  useEffect(() => { if (text ? s !== String(value ?? "") : Number(s) !== Number(value ?? 0)) setS(String(value ?? "")); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return text
    ? <input type="text" maxLength={60} disabled={disabled} value={s} className={numIn} onChange={(e) => { setS(e.target.value); onChange(e.target.value); }} />
    : <input type="number" min={0} step="any" disabled={disabled} value={s} className={numIn} onChange={(e) => { setS(e.target.value); const n = Number(e.target.value); onChange(Number.isFinite(n) && n >= 0 ? n : 0); }} />;
}
function StairsEditor({ rows, onChange, disabled }: { rows: StairRow[]; onChange: (r: StairRow[]) => void; disabled?: boolean }) {
  const F: { k: keyof StairRow; label: string; text?: boolean }[] = [
    { k: "label", label: "Mark", text: true }, { k: "flights", label: "Flights" }, { k: "width_mm", label: "Width mm" },
    { k: "risers", label: "Risers / flight" }, { k: "riser_mm", label: "Riser mm" }, { k: "tread_mm", label: "Tread mm" },
    { k: "waist_mm", label: "Waist mm" }, { k: "open_sides", label: "Open sides (0-2)" }, { k: "landing_m2", label: "Landing m² / flight" },
  ];
  const set = (i: number, k: keyof StairRow, v: number | string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const b = stairBreakdown(r);
        return (
          <div key={i} className="rounded-md border border-graphite-800 p-2">
            <div className="grid grid-cols-3 gap-1.5">
              {F.map((f) => (
                <label key={f.k} className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide text-graphite-500">{f.label}
                  <Cell value={r[f.k] as number | string | undefined} text={f.text} disabled={disabled} onChange={(v) => set(i, f.k, v)} />
                </label>
              ))}
            </div>
            <div className="mt-1.5 flex items-start justify-between gap-2 text-[11px]">
              <span className="text-graphite-400">{b ? `Sloped length ${b.slope.toFixed(2)} m · soffit ${b.soffit.toFixed(2)} + risers ${b.risers.toFixed(2)}${b.cheeks ? ` + sides ${b.cheeks.toFixed(2)}` : ""}${b.landing ? ` + landing ${b.landing.toFixed(2)}` : ""} per flight` : "Fill in flights, width and risers."}</span>
              <span className="whitespace-nowrap font-mono text-graphite-100">{b ? `${b.total.toFixed(2)} m²` : ""}</span>
            </div>
            {!disabled ? <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="mt-1 text-[11px] text-signal-red hover:underline">Remove</button> : null}
          </div>
        );
      })}
      {!disabled ? (
        <button type="button" onClick={() => onChange([...rows, { label: `ST${rows.length + 1}`, flights: 2, width_mm: 1200, risers: 9, riser_mm: 160, tread_mm: 280, waist_mm: 150, open_sides: 0, landing_m2: 0 }])} className="text-xs font-medium text-brand-orange hover:underline">+ Add staircase</button>
      ) : null}
    </div>
  );
}

function RowsEditor<R extends Record<string, number | string | undefined>>({ rows, cols, blank, onChange, disabled }: {
  rows: R[]; cols: { k: keyof R & string; label: string; text?: boolean }[]; blank: R; onChange: (r: R[]) => void; disabled?: boolean;
}) {
  return (
    <div>
      {rows.length ? (
        <table className="w-full text-xs">
          <thead><tr>{cols.map((c) => <th key={c.k} className="pb-1 text-left font-medium text-graphite-500">{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.k} className="pb-1 pr-1">
                    <Cell value={r[c.k]} text={c.text} disabled={disabled} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.k]: v } : x)))} />
                  </td>
                ))}
                <td className="pb-1">{!disabled ? <button type="button" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="p-1 text-graphite-500 hover:text-signal-red"><Trash2 className="size-3.5" /></button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-xs text-graphite-500">None.</p>}
      {!disabled ? <button type="button" onClick={() => onChange([...rows, { ...blank }])} className="mt-1 inline-flex items-center gap-1 text-xs text-brand-orange hover:underline"><Plus className="size-3.5" />Add row</button> : null}
    </div>
  );
}

/** Estimator's own figures (e.g. measured in AutoCAD) — replace what the software read from the drawing, one by one. */
function OverrideBox({ t, totals, canEdit, update }: { t: Takeoff; totals: Totals; canEdit: boolean; update: (fn: (p: Takeoff) => Takeoff) => void }) {
  const it = totals.items;
  const slabDrawn = it.filter((i) => i.group === "slab").reduce((s, i) => s + i.area, 0);
  const ductDrawn = -it.filter((i) => i.group === "deduct" && i.code !== "WT" && i.code !== "CT").reduce((s, i) => s + i.area, 0);
  const beamLen = (() => { const D = (Number(t.params.beamDepthMm) || 600) / 1000 - t.params.slabMm / 1000; return D > 0 ? totals.beam_area / D : 0; })();
  const rows: { k: "slabM2" | "ductM2" | "wallLenM" | "beamLenM"; label: string; unit: string; auto: number }[] = [
    { k: "slabM2", label: "Slab area", unit: "m²", auto: slabDrawn },
    { k: "ductM2", label: "Duct area", unit: "m²", auto: ductDrawn },
    { k: "wallLenM", label: "Wall length (faces)", unit: "m", auto: totals.wall_length * 2 },
    { k: "beamLenM", label: "Beam length", unit: "m", auto: beamLen },
  ];
  return (
    <details className="mt-2 rounded-md border border-graphite-800 px-2.5 py-2 text-xs" open={rows.some((r) => t.params[r.k] != null)}>
      <summary className="cursor-pointer text-graphite-300">Use your own measured figures (optional)</summary>
      <p className="mt-1 text-[11px] text-graphite-500">Type a figure to use it instead of the one read from the drawing. Leave empty to use the drawing.</p>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const v = t.params[r.k];
          return (
            <div key={r.k} className="grid grid-cols-[1fr_auto_6rem_auto] items-center gap-2">
              <span className="text-graphite-300">{r.label}</span>
              <span className="font-mono text-[11px] text-graphite-500">drawing {r.auto.toFixed(2)}</span>
              <input type="number" step="0.01" disabled={!canEdit} value={v ?? ""} placeholder="—"
                onChange={(e) => { const x = e.target.value; update((p) => ({ ...p, params: { ...p.params, [r.k]: x === "" ? undefined : Math.max(0, Number(x)) } })); }}
                className="w-24 rounded border border-graphite-700 bg-graphite-950 px-2 py-1 text-right font-mono text-xs text-graphite-100 disabled:opacity-60" />
              <span className="text-graphite-500">{r.unit}</span>
            </div>
          );
        })}
      </div>
    </details>
  );
}


/** Bottom-left of the drawing: cursor position (drawing coordinates in metres) and a scale bar. */
function Readout({ mouse, frame, mpp, k, unitToM }: { mouse: Pt | null; frame: { fromPx: (p: Pt) => Pt } | null; mpp: number; k: number; unitToM: number }) {
  const mPerScreenPx = mpp / k;
  const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const len = nice.find((m) => m / mPerScreenPx >= 70) ?? 500;
  const px = len / mPerScreenPx;
  const pos = mouse && frame ? frame.fromPx(mouse) : null;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-end gap-3 rounded-md bg-white/85 px-2 py-1 text-[11px] text-graphite-700 shadow-sm">
      <div>
        <div className="h-1.5 border-x border-b border-graphite-700" style={{ width: px }} />
        <div className="text-center">{len >= 1 ? `${len} m` : `${len * 1000} mm`}</div>
      </div>
      {pos ? <div className="font-mono">X {(pos[0] * unitToM).toFixed(2)} m · Y {(pos[1] * unitToM).toFixed(2)} m</div> : null}
    </div>
  );
}
