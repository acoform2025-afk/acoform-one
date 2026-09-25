import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { RateCardForm } from "./rate-card-form";
import { QuickQuoteRateForm } from "./quick-quote-rate-form";

const CATEGORY_LABELS: Record<string, string> = {
  wall_panel:       "Wall Panels",
  extension_panel:  "Extension Panels",
  deck_panel:       "Deck Panels",
  internal_corner:  "Internal Corners",
  external_corner:  "External Corners",
  filler_panel:     "Filler Panels",
  beam_side_panel:  "Beam Side Panels",
  beam_soffit_panel:"Beam Soffit Panels",
};

export default async function PanelCatalogPage() {
  const supabase = await createClient();

  const { data: panels } = await supabase
    .from("panel_master")
    .select("*")
    .eq("is_active", true)
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

  const grouped = (panels ?? []).reduce<Record<string, typeof panels>>((acc, p) => {
    if (!p) return acc;
    const cat = p.panel_category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(p);
    return acc;
  }, {});

  return (
    <div className="fade-in max-w-5xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-graphite-50">
        Panel Catalog
      </h1>
      <p className="mt-1 text-sm text-graphite-400">
        The 14 standard ACOFORM panel types, plus rate configuration for both quotation paths.
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
          Standard panel library
        </h2>
        {Object.entries(grouped).map(([cat, catPanels]) => (
          <div key={cat}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite-500">
              {CATEGORY_LABELS[cat] ?? cat}
            </h3>
            <div className="overflow-hidden rounded-lg border border-graphite-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">W × H (mm)</th>
                    <th className="px-4 py-2.5 font-medium text-right">Area (m²)</th>
                    <th className="px-4 py-2.5 font-medium text-right">Weight (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-graphite-800">
                  {catPanels?.map((p) => (
                    <tr key={p.id} className="bg-graphite-950">
                      <td className="px-4 py-2.5 font-mono text-xs text-aluminium-300">{p.panel_code}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-graphite-300">
                        {p.width_mm} × {p.height_mm}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-graphite-400">
                        {Number(p.area_sqm).toFixed(4)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-graphite-200">
                        {p.weight_kg}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
