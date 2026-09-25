import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { QuotationDocument, type PdfLine, type PdfQuotation, type PdfCompany } from "@/lib/pdf/quotation-document";
import { formworkKind, pdfFileName } from "@/lib/quotations/document-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: q } = await supabase.from("quotations").select("*").eq("id", id).single();
  if (!q) return new Response("Quotation not found", { status: 404 });

  const { data: company } = await supabase
    .from("tenants")
    .select("company_name, company_address, company_phone, company_website, gst_number, bank_account_name, bank_name, bank_account_number, bank_ifsc_code, bank_branch")
    .eq("id", q.tenant_id)
    .single();

  const { data: rawLines } = await supabase
    .from("quotation_lines")
    .select("id, line_type, description, unit, quantity, unit_rate, line_total, notes, unit_weight_kg, rate_per_kg, sort_order, panel_master ( panel_code, width_mm, height_mm, area_sqm )")
    .eq("quotation_id", id)
    .order("line_type")
    .order("sort_order");

  const lines: PdfLine[] = (rawLines ?? []).map((l) => {
    const pm = Array.isArray(l.panel_master) ? l.panel_master[0] : l.panel_master;
    return {
      id: l.id, line_type: l.line_type, description: l.description, unit: l.unit, quantity: Number(l.quantity),
      unit_rate: l.unit_rate, line_total: l.line_total, notes: l.notes, unit_weight_kg: l.unit_weight_kg, rate_per_kg: l.rate_per_kg,
      panel_code: pm?.panel_code ?? null, width_mm: pm?.width_mm ?? null, height_mm: pm?.height_mm ?? null, area_sqm: pm?.area_sqm ?? null,
    };
  });

  const buffer = await renderToBuffer(
    <QuotationDocument q={q as unknown as PdfQuotation} lines={lines} company={(company ?? {}) as PdfCompany} />,
  );

  const name = pdfFileName(q.quotation_code, q.revision_no, formworkKind(q.formwork_type), q.quotation_date);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
