import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ChallanDocument, type ChallanData } from "@/lib/pdf/challan-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: n } = await supabase.from("dispatch_notes").select("*, projects ( project_code, customer_name, site_address )").eq("id", id).single();
  if (!n) return new Response("Not found", { status: 404 });
  const proj = Array.isArray(n.projects) ? n.projects[0] : n.projects;
  const [{ data: company }, { data: rows }] = await Promise.all([
    supabase.from("tenants").select("company_name, company_address, company_phone, company_website, gst_number").eq("id", n.tenant_id).single(),
    supabase.from("inventory_ledger").select("panels ( qr_code, panel_code, panel_master ( weight_kg ) )").eq("dispatch_note_id", id).eq("event_type", "dispatched"),
  ]);
  const panels = (rows ?? []).map((r) => (Array.isArray(r.panels) ? r.panels[0] : r.panels)).filter(Boolean) as
    { qr_code: string; panel_code: string; panel_master: { weight_kg: number } | { weight_kg: number }[] | null }[];
  const byCode = new Map<string, { quantity: number; unit_weight_kg: number }>();
  panels.forEach((p) => {
    const pm = Array.isArray(p.panel_master) ? p.panel_master[0] : p.panel_master;
    const e = byCode.get(p.panel_code) ?? { quantity: 0, unit_weight_kg: Number(pm?.weight_kg ?? 0) };
    e.quantity += 1;
    byCode.set(p.panel_code, e);
  });
  const data: ChallanData = {
    dc_number: n.dc_number, dispatch_date: n.dispatch_date, vehicle_no: n.vehicle_no, driver_name: n.driver_name, driver_phone: n.driver_phone,
    transporter: n.transporter, notes: n.notes, project_code: proj?.project_code ?? "", customer_name: proj?.customer_name ?? "", site_address: proj?.site_address ?? null,
    company: company ?? { company_name: null, company_address: null, company_phone: null, company_website: null, gst_number: null },
    lines: [...byCode.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([panel_code, v]) => ({ panel_code, ...v })),
    qr_codes: panels.map((p) => ({ qr_code: p.qr_code, panel_code: p.panel_code })).sort((a, b) => a.panel_code.localeCompare(b.panel_code) || a.qr_code.localeCompare(b.qr_code)),
  };
  const buf = await renderToBuffer(<ChallanDocument d={data} />);
  const file = `DC ${n.dc_number.split("/").slice(-2).join("-")} ${proj?.project_code ?? ""}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file}"`, "Cache-Control": "no-store" },
  });
}
