import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { buildZones, runPanels } from "@/lib/floor-plans/run-panels";
import { faceFrames, inRings } from "@/lib/design-engine/design-check";
import { PRESETS } from "@/lib/design-engine/layout-rules";
import { AssemblyDocument, type AsmData } from "@/lib/pdf/assembly-document";
import type { Pt } from "@/lib/floor-plans/calc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);

/** Corner marks from the wall outlines: wall solid round 3/4 of a vertex = internal corner, 1/4 = external corner. */
function cornersOf(walls: Pt[][]): { at: Pt; ext: boolean }[] {
  const out: { at: Pt; ext: boolean }[] = []; const seen = new Set<string>();
  for (const ring of walls) for (const p of ring) {
    const key = `${Math.round(p[0] * 20)}:${Math.round(p[1] * 20)}`; if (seen.has(key)) continue; seen.add(key);
    let n = 0; for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4; if (inRings([p[0] + Math.cos(a) * 0.05, p[1] + Math.sin(a) * 0.05], walls)) n++; }
    if (n >= 5 && n <= 7) out.push({ at: p, ext: false }); else if (n >= 1 && n <= 3) out.push({ at: p, ext: true });
    if (out.length > 4000) return out;
  }
  return out;
}

/** Assembly plans of the typical floor (A3 PDF, 6 sheets) — part of the design package. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const q = { h: url.searchParams.get("h") ?? undefined, kg: url.searchParams.get("kg") ?? undefined, prop: url.searchParams.get("prop") ?? undefined };
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.inp || !r.shell || !r.result) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const zones = (r.zones ?? buildZones(r.inp, r.catalog, r.layoutRules));
  const rules = r.layoutRules;
  const frames = faceFrames(r.result.faces, r.shell.mpp, r.inp.zoneWalls);
  // beam types: identical size + make-up counted together
  const bm = new Map<string, AsmData["beams"][number]>();
  for (const b of r.result.beams) {
    const size = `${b.b}×${b.d}`; const k = `${size}|${b.pieces.join("+")}|${b.sides}|${b.bottom}`;
    const e = bm.get(k); if (e) e.n++; else bm.set(k, { code: b.code, size, pieces: b.pieces, sides: b.sides, bottom: b.bottom, n: 1 });
  }
  const sunk = r.inp.sunk ?? [];
  const tie = rules?.tie === "flat" ? "flat ties" : "tie rods";
  const data: AsmData = {
    walls: r.inp.zoneWalls,
    faces: frames.map(({ f, a, b, n }) => ({ code: f.code, a, b, n, panels: f.panels, filler: f.filler, top: f.top, column: f.set === "column" })),
    zones, beamRings: r.inp.zoneBeams ?? [], beams: [...bm.values()],
    slab: r.inp.decks.map((p) => p.pts),
    propSpacing: r.opt.propSpacing, corners: cornersOf(r.inp.zoneWalls),
    walerNote: `Walers (back stiffeners): ${rules?.tie === "flat" ? "rows on both wall faces" : "rows on one face"} every ${rules?.tieV ?? 600} mm up the wall, ${tie} @ ${rules?.tieH ?? 800} mm — lengths in list 05.`,
    sunkNote: sunk.length ? `Drop / sunk slabs: ${sunk.length} area(s), ${sunk.reduce((s, x) => s + x.perimeter, 0).toFixed(1)} m of drop formwork (sunk kicker + square tube) — see the "drop" lines of list 03.` : "No sunk / drop slab areas marked on this plan.",
  };
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const drawingNo = `AS-${r.lead?.lead_code?.split("/").pop() ?? "01"}`;
  const rev = r.t.shell?.rev?.trim() || "R0";
  const buf = await renderToBuffer(<AssemblyDocument data={data} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name,
    project: r.lead?.project_name ?? r.plan.name, client: r.lead?.company_name ?? r.lead?.customer_name ?? "—",
    drawingNo, rev, date: new Date().toLocaleDateString("en-GB"), system: PRESETS[rules?.system ?? "acoform"].label,
  }} />);
  const name = safe(`${drawingNo}_${rev}_Assembly_${r.plan.name}`);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
