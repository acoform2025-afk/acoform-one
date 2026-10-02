import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { buildZones, runPanels } from "@/lib/floor-plans/run-panels";
import { wallPanelNumbers } from "@/lib/floor-plans/zones";
import { packingByZone } from "@/lib/floor-plans/packing";
import { labelUrl, panelLabels, qrPath } from "@/lib/floor-plans/labels";
import { fabSpec } from "@/lib/design-engine/fabrication";
import { LABEL_SIZES, PanelLabelsDocument, type LabelSize } from "@/lib/pdf/panel-labels-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
const MAX = 1000;   // labels per PDF (a thermal printer job; bigger floors are printed by family / bundle / range)

/**
 * Panel QR labels for a thermal printer (one label per page). Filters: size=100x50|100x75|75x50, family=wall,deck…
 * (BOM groups), bundle=M12 (packing bundle / room), from / to (label numbers). The QR opens the panel in the app.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? undefined;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, { h: g("h"), kg: g("kg"), prop: g("prop") });
  if (!r) return new Response("Floor plan not found", { status: 404 });
  if (r.error || !r.inp || !r.shell || !r.result) return new Response(r.error ?? "Measure and save this plan first.", { status: 400 });
  const zones = (r.zones ?? buildZones(r.inp, r.catalog, r.layoutRules));
  const cat = new Map(r.catalog.map((c) => [c.panel_code, c]));
  const wallCode = (w: number) => r.catalog.find((c) => c.panel_category === "wall_panel" && Number(c.width_mm) === w && Number(c.height_mm) === r.opt.stdHeight)?.panel_code ?? `WP-${w}-${r.opt.stdHeight}`;
  const wallPanels = wallPanelNumbers(r.result.faces, r.opt.stdHeight, wallCode);
  const kgOf = (code: string, w: number, h: number) => { const c = cat.get(code); return c && Number(c.weight_kg) > 0 ? Number(c.weight_kg) : fabSpec(code, "", w, h, 1).kgEach; };
  const packs = packingByZone({ zones, faces: r.result.faces, mpp: r.shell.mpp, walls: r.inp.zoneWalls, wallPanels, kgOf });
  let labels = panelLabels(r.result.bom, packs);
  // filters (label numbers k / n stay those of the whole floor, so a reprint matches the first print)
  const fam = g("family")?.split(",").filter(Boolean);
  if (fam?.length) { const groupOf = new Map(r.result.bom.map((b) => [b.code, b.group as string])); labels = labels.filter((l) => fam.includes(groupOf.get(l.code) ?? (l.family.startsWith("Deck") ? "deck" : "wall"))); }
  const bundle = g("bundle")?.trim().toUpperCase();
  if (bundle) labels = labels.filter((l) => l.bundle.toUpperCase() === bundle);
  const from = Math.max(1, Number(g("from")) || 1), to = Number(g("to")) || Infinity;
  labels = labels.filter((l) => l.k >= from && l.k <= to);
  if (!labels.length) return new Response("No panels match these filters.", { status: 400 });
  if (labels.length > MAX) return new Response(`${labels.length} labels — too many for one print job. Print by family, bundle or range (from / to, at most ${MAX} at a time).`, { status: 400 });
  const size = (g("size") && g("size")! in LABEL_SIZES ? g("size") : "100x50") as LabelSize;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto.split(",")[0]}://${host}`;
  const qrs = labels.map((l) => qrPath(labelUrl(origin, id, l)));
  const { data: company } = await supabase.from("tenants").select("company_name").eq("id", r.plan.tenant_id).maybeSingle();
  const buf = await renderToBuffer(<PanelLabelsDocument labels={labels} qrs={qrs} size={size} info={{
    company: company?.company_name ?? "Aco Form Work Pvt Ltd", planName: r.plan.name, project: r.lead?.project_name ?? "",
  }} />);
  const name = safe(`Panel_labels_${size}_${r.plan.name}${bundle ? `_${bundle}` : ""}`);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
}
