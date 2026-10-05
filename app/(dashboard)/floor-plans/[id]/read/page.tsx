import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { loadDictionary } from "@/lib/floor-plans/dictionary";
import { ReadOut } from "./read-out";

export const metadata = { title: "Drawing read-out" };
export const dynamic = "force-dynamic";

/** Everything the app read from the drawing, drawing by drawing — and the words / layers it does not know yet. */
export default async function DrawingReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans").select("id, name, source_kind, file_path, takeoff").eq("id", id).maybeSingle();
  if (!plan || plan.source_kind !== "dxf") notFound();
  const [dict, canEdit] = await Promise.all([loadDictionary(supabase), hasPermission("quotations", "create")]);
  const { data: url } = await supabase.storage.from("floor-plans").createSignedUrl(plan.file_path, 60 * 60);
  const tk = (plan.takeoff && typeof plan.takeoff === "object" ? plan.takeoff : {}) as { dxf?: { layerRoles?: Record<string, string>; units?: string }; params?: { floors?: number; floorHeight?: number; slabMm?: number } };
  const indexPath = plan.file_path.replace(/[^/]+$/, "index.json");
  return (
    <div className="fade-in">
      <Link href={`/floor-plans/${id}`} className="text-xs text-graphite-500 hover:text-graphite-300">← {plan.name}</Link>
      <h1 className="mt-1 text-lg font-semibold text-graphite-50">Drawing read-out</h1>
      <p className="mb-4 max-w-3xl text-xs text-graphite-400">
        The whole file read once, in detail: every drawing in it (with its title, type and level), every layer (what it is and why),
        every word written on it and what it means. Words and layers the app does not know yet are listed — tell it once what they mean and
        every later drawing from any architect is read with it.
      </p>
      {url?.signedUrl ? (
        <ReadOut planId={id} planName={plan.name} fileUrl={url.signedUrl} indexPath={indexPath} dict={dict} canEdit={canEdit}
          roles={(tk.dxf?.layerRoles ?? {}) as Record<string, never>} units={tk.dxf?.units}
          said={{ floors: tk.params?.floors, floorMm: tk.params?.floorHeight ? Math.round(tk.params.floorHeight * 1000) : undefined, slabMm: tk.params?.slabMm }} />
      ) : <p className="text-sm text-signal-red">The drawing file could not be opened.</p>}
    </div>
  );
}
