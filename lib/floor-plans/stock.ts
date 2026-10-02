import type { createClient } from "@/lib/supabase/server";
import type { BomRow } from "@/lib/design-engine/floor-panels";

type Supa = Awaited<ReturnType<typeof createClient>>;
export type StockRow = { code: string; description: string; group: BomRow["group"]; w: number; h: number; need: number; inStock: number; onSite: number; fromStock: number; toMake: number; kgEach: number; custom: boolean };

/**
 * Stock-first check (YJK-LMB "库存优先"): every panel type this layout needs against the QR-tracked panels in the
 * yard (status in_stock). Panels already in stock are sent first; only the shortfall goes to production.
 */
export async function stockCheck(supabase: Supa, bom: BomRow[]) {
  const rows = bom.filter((b) => b.group !== "accessory" && b.qty > 0);
  const { data } = await supabase.from("panels").select("panel_code, status").in("status", ["in_stock", "on_site", "dispatched"]);
  const yard = new Map<string, number>(), site = new Map<string, number>();
  for (const p of data ?? []) { const m = p.status === "in_stock" ? yard : site; m.set(p.panel_code, (m.get(p.panel_code) ?? 0) + 1); }
  const out: StockRow[] = rows.map((b) => {
    const need = Math.ceil(b.qty), inStock = yard.get(b.code) ?? 0, fromStock = Math.min(need, inStock);
    return { code: b.code, description: b.description, group: b.group, w: b.w, h: b.h, need, inStock, onSite: site.get(b.code) ?? 0, fromStock, toMake: need - fromStock, kgEach: b.qty ? b.weight / b.qty : 0, custom: b.custom };
  });
  const sum = (k: "need" | "fromStock" | "toMake") => out.reduce((a, r) => a + r[k], 0);
  const kg = (k: "need" | "fromStock" | "toMake") => Math.round(out.reduce((a, r) => a + r[k] * r.kgEach, 0));
  return { rows: out, trackedPanels: (data ?? []).length, totals: { need: sum("need"), fromStock: sum("fromStock"), toMake: sum("toMake"), kgNeed: kg("need"), kgFromStock: kg("fromStock"), kgToMake: kg("toMake") } };
}
