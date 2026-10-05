import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { sceneOf } from "@/lib/floor-plans/scene-of";
import { faceFrames } from "@/lib/design-engine/design-check";
import { PRESETS } from "@/lib/design-engine/layout-rules";
import { assemblyModel, type CodeFor } from "@/lib/pdf/assembly-data";
import { AssemblyDocument } from "@/lib/pdf/assembly-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/**
 * Formwork assembly diagram of the typical floor (A3 PDF): one plan sheet per part family with every piece at its
 * place and its code, part list per sheet, key plan — as in a professional formwork package. Part of the design package.
 * Query: h (panel height), kg, prop (prop spacing), floor (floor height mm for a taller level).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const floorMm = Number(url.searchParams.get("floor")) || undefined;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.inp || !r.shell || !r.result) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const scene = sceneOf(r, floorMm);
  if (!scene) return new Response("Could not build the floor model.", { status: 400 });
  const rules = r.layoutRules;
  // codes as in the company's panel master (fallback: WP-width-height / DP-width-length)
  const cat = r.catalog;
  const codes: Partial<CodeFor> = {
    wall: (w, h) => cat.find((c) => c.panel_category === "wall_panel" && Number(c.width_mm) === w && Number(c.height_mm) === h)?.panel_code ?? `WP-${w}-${h}`,
    deck: (w, L) => cat.find((c) => c.panel_category === "deck_panel" && Number(c.width_mm) === w && Number(c.height_mm) === L)?.panel_code ?? `DP-${w}-${L}`,
    ic: cat.find((c) => /^IC/i.test(c.panel_code))?.panel_code.replace(/[-_ ]?\d+.*$/, "") ?? "IC",
    ec: cat.find((c) => /^EC/i.test(c.panel_code))?.panel_code.replace(/[-_ ]?\d+.*$/, "") ?? "EC",
    keel: (L) => `${rules?.system === "flattie" ? "ZL" : "MB"}-${L}`,
  };
  const frames = faceFrames(r.result.faces, r.shell.mpp, r.inp.zoneWalls);
  const m = assemblyModel(scene, { codes, stdH: r.opt.stdHeight, propSpacing: r.opt.propSpacing, tieH: rules?.tieH ?? 800, tieV: rules?.tieV ?? 600, faces: frames.map(({ f, a, b, n }) => ({ code: f.code, a, b, n })) });
  const sunk = r.inp.sunk ?? [];
  const tie = rules?.tie === "flat" ? "flat ties" : "tie rods";
  const notes = [
    `Wall panels are ${r.opt.stdHeight} mm high${rules?.fullHeight ? " (full height)" : ` with a top panel above to the slab soffit`}; codes are the company's panel master codes (WP = wall panel, WT = top panel, WF = filler, OH / OS = over / under an opening, CP = column panel).`,
    `Corners: IC = internal corner (${rules?.internalCorner ?? 100} mm legs), EC = external corner (${rules?.externalCorner ?? 65} mm), SC = soffit corner ${rules?.soffitCornerW ?? 100} × ${rules?.soffitCornerLeg ?? 125} along the top of every wall face, KB = kicker ${rules?.kickerMm ?? 0} mm along the slab edge.`,
    `Deck: DP = deck panel (width-length), DS = made-to-size deck piece, keel / mid beam ${rules?.midBeam ?? 150} mm wide between the rows with its length in the code, PH = prop head in the keel line at ≤ ${r.opt.propSpacing.toFixed(2)} m, props below every head.`,
    `Beams: BS = beam side panel (height-width) on both faces, BB = beam bottom panel (width-length) on BPH beam prop heads; the soffit corner runs over the beam side.`,
    `Walers (back stiffeners): ${rules?.tie === "flat" ? "rows on both wall faces" : "rows on one face"} every ${rules?.tieV ?? 600} mm up the wall, ${tie} @ ${rules?.tieH ?? 800} mm — sheet 5 shows the lowest row and its ties; lengths in the Excel part lists.`,
    sunk.length ? `Drop / sunk slabs: ${sunk.length} area(s), ${sunk.reduce((s, x) => s + x.perimeter, 0).toFixed(1)} m of drop formwork (sunk kicker + square tube) — see the "drop" lines of the part lists.` : "No sunk / drop slab areas marked on this plan.",
    "Stairs (sheet 6): soffit deck rows (width D length), SPCPP prop strips with SPH stair prop heads, SPCH cheek panels, SPW special wall panels cut to the slope, STP stop panel, CC C-channel at the foot, RS risers; SPTR step covers and SPTREC nosing angles are in the staircase sheet of the package.",
    "Pins, wedges, ties and sleeves include the loss % of the panel layout rules; props and prop heads include the extra sets kept under the floors below. Check every special panel against the production drawings before cutting.",
  ];
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const drawingNo = `FA-${r.lead?.lead_code?.split("/").pop() ?? "01"}`;
  const rev = r.t.shell?.rev?.trim() || "R0";
  const buf = await renderToBuffer(<AssemblyDocument m={m} notes={notes} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name,
    project: r.lead?.project_name ?? r.plan.name, client: r.lead?.company_name ?? r.lead?.customer_name ?? "—",
    drawingNo, rev, date: new Date().toLocaleDateString("en-GB"), system: PRESETS[rules?.system ?? "acoform"].label,
    floor: floorMm ? `FLOOR HEIGHT ${floorMm} mm` : undefined,
  }} />);
  const name = safe(`${drawingNo}_${rev}_Assembly_diagram_${r.plan.name}`);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
