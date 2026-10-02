import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/permissions";
import { titleCase } from "@/lib/format";
import { CompanyForm } from "./company-form";
import { EngineeringForm } from "./engineering-form";
import { RulesForm } from "./rules-form";
import { LayoutRulesForm } from "./layout-rules-form";
import { SiteLearning } from "./site-learning";
import type { SiteReportRow } from "@/lib/floor-plans/site-learn";
import { loadLayoutRules } from "@/lib/design-engine/layout-rules";
import { loadRules } from "@/lib/floor-plans/rules";
import { hasPermission } from "@/lib/auth/permissions";
import { listMedia, mediaViewUrls } from "@/lib/quotations/media";
import { MediaManager, type MediaTile } from "./media-manager";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: tenant } = await supabase.from("tenants").select("*").eq("id", profile!.tenant_id).single();
  const { data: isAdmin } = await supabase.rpc("is_super_admin");
  const { data: eng } = await supabase.from("engineering_parameters").select("*").maybeSingle();
  const canEng = await hasPermission("designs", "approve");
  const canMedia = await hasPermission("quotations", "approve");
  const rules = await loadRules(supabase);
  const layoutRules = await loadLayoutRules(supabase);
  const { data: siteRows } = await supabase.from("site_reports").select("id, floor_label, pour_date, cycle_days, system, lines, issues, notes, created_at, floor_plan_id").eq("system", layoutRules.system).order("created_at", { ascending: false }).limit(500);
  const media = await listMedia(supabase);
  const mediaUrls = await mediaViewUrls(supabase, media);
  const tiles: MediaTile[] = media.filter((m) => mediaUrls[m.id]).map((m) => ({ id: m.id, kind: m.kind, url: mediaUrls[m.id], caption: m.caption }));

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, email, is_active, role_assignments!role_assignments_user_id_fkey ( roles ( code ) )")
    .order("full_name");

  return (
    <div className="fade-in max-w-4xl">
      <h1 className="text-2xl font-semibold text-graphite-50">Settings</h1>
      <div className="mt-6">
        <CompanyForm tenant={(tenant ?? {}) as Record<string, string | null>} canEdit={isAdmin === true} />
      </div>

      <div className="mt-8">
        <MediaManager items={tiles} tenantId={profile!.tenant_id} canEdit={canMedia} />
      </div>

      <div className="mt-8">
        <RulesForm r={rules} canEdit={canEng || canMedia} />
      </div>

      <div className="mt-8">
        <LayoutRulesForm r={layoutRules} canEdit={canEng} />
      </div>

      <div className="mt-8">
        <SiteLearning reports={(siteRows ?? []) as unknown as SiteReportRow[]} rules={layoutRules} canEdit={canEng} />
      </div>

      <div className="mt-8">
        <EngineeringForm p={(eng ?? {}) as Record<string, number | string | boolean | null>} canEdit={canEng} />
      </div>

      <section className="mt-8 overflow-hidden rounded-lg border border-graphite-800">
        <div className="border-b border-graphite-800 bg-graphite-900 px-4 py-3"><h2 className="text-sm font-medium text-graphite-200">Users</h2></div>
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-graphite-800">
            {(users ?? []).map((u) => {
              const roles = (u.role_assignments ?? [])
                .map((ra: { roles: { code: string } | { code: string }[] | null }) => (Array.isArray(ra.roles) ? ra.roles[0]?.code : ra.roles?.code))
                .filter(Boolean) as string[];
              return (
                <tr key={u.id} className="bg-graphite-950">
                  <td className="px-4 py-3 text-graphite-100">{u.full_name}</td>
                  <td className="px-4 py-3 text-graphite-400">{u.email}</td>
                  <td className="px-4 py-3 text-xs text-graphite-400">{roles.map(titleCase).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-xs">{u.is_active ? <span className="text-signal-green">Active</span> : <span className="text-graphite-500">Inactive</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
