import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { RateCardForm } from "./rate-card-form";
import { QuickQuoteRateForm } from "./quick-quote-rate-form";
import { CatalogEditor, type CatRow } from "./catalog-editor";


export default async function PanelCatalogPage() {
  const supabase = await createClient();

  const { data: panels } = await supabase
    .from("panel_master")
    .select("*")
    .order("panel_category")
    .order("width_mm");

  const { data: rateCard } = await supabase
    .from("cost_rate_cards")
    .select("id, rate_name, rate_per_kg, effective_from")
    .eq("is_active", true)
    .single();

  const { data: quickRates } = await supabase
    .from("quick_quote_rates")
    .select("formwork_type, rate_per_sqm, effective_from")
    .eq("is_active", true);

  const monolithicRate = quickRates?.find((r) => r.formwork_type === "monolithic") ?? null;
  const verticalRate = quickRates?.find((r) => r.formwork_type === "vertical") ?? null;

  const canManageRates = await hasPermission("cost_rate_cards", "manage");
  const canEditCatalog = await hasPermission("panel_master", "manage");



  return (
    <div className="fade-in max-w-5xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-graphite-50">
        Panel Catalog
      </h1>
      <p className="mt-1 text-sm text-graphite-400">
        Panels, corners, kickers, mid beams, prop heads, props, pins, wedges and ties used by the panel layout and BOM, plus rates for both quotation paths.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-graphite-400">
          Weight-based rate (detailed quotations)
        </h2>
        {rateCard ? (
          <div className="mb-4 flex items-center gap-6 rounded-lg border border-signal-green/30 bg-signal-green/5 px-5 py-4">
            <div>
              <p className="text-xs text-graphite-500">Rate name</p>
              <p className="text-sm text-graphite-100">{rateCard.rate_name}</p>
            </div>
            <div>
              <p className="text-xs text-graphite-500">Rate per kg</p>
              <p className="font-mono text-sm text-graphite-100">₹ {Number(rateCard.rate_per_kg).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-graphite-500">Effective from</p>
              <p className="font-mono text-sm text-graphite-100">{rateCard.effective_from}</p>
            </div>
          </div>
        ) : (
          <p className="mb-4 rounded-lg border border-signal-red/30 bg-signal-red/5 px-4 py-3 text-sm text-signal-red">
            No active rate card. Set one below before creating detailed quotations.
          </p>
        )}
        {canManageRates && (
          <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-5">
            <RateCardForm current={rateCard ?? null} />
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-graphite-400">
          Quick quote rates (area-based)
        </h2>
        <p className="mb-3 text-xs text-graphite-600">
          Monolithic uses floor plate area; Vertical uses vertical formwork face area.
        </p>
        {canManageRates ? (
          <div className="grid grid-cols-2 gap-4">
            <QuickQuoteRateForm formworkType="monolithic" current={monolithicRate} />
            <QuickQuoteRateForm formworkType="vertical" current={verticalRate} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-4">
              <p className="text-xs uppercase text-graphite-500">Monolithic</p>
              <p className="mt-1.5 font-mono text-lg text-graphite-100">
                {monolithicRate ? `₹${Number(monolithicRate.rate_per_sqm).toFixed(2)}/sqm` : "Not set"}
              </p>
            </div>
            <div className="rounded-lg border border-graphite-800 bg-graphite-900 p-4">
              <p className="text-xs uppercase text-graphite-500">Vertical</p>
              <p className="mt-1.5 font-mono text-lg text-graphite-100">
                {verticalRate ? `₹${Number(verticalRate.rate_per_sqm).toFixed(2)}/sqm` : "Not set"}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8 space-y-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-graphite-400">
          Component catalogue
        </h2>
        <CatalogEditor rows={(panels ?? []) as unknown as CatRow[]} canEdit={canEditCatalog} />
      </section>
    </div>
  );
}
