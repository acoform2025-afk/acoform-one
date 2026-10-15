import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { runPanels, type PanelQuery } from "@/lib/floor-plans/run-panels";
import { FaceEditor } from "./face-editor";

export const metadata = { title: "Edit panels by hand" };
export const dynamic = "force-dynamic";

export default async function EditPanelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PanelQuery> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const r = await runPanels(supabase, id, q);
  if (!r) notFound();
  const back = <Link href={`/floor-plans/${id}/panels?${new URLSearchParams(q as Record<string, string>).toString()}`} className="text-xs text-graphite-500 hover:text-graphite-300">← Panel layout &amp; BOM</Link>;
  if (r.error || !r.result) return <div className="fade-in">{back}<p className="mt-4 text-sm text-signal-amber">{r.error ?? "Measure and save this plan first."}</p></div>;
  const edits = (r.t.panelEdits ?? {}) as Record<string, number[]>;
  const faces = r.result.faces.filter((f) => !f.end && f.length > 250 && !/-O\d+[HS]$/.test(f.code)).map((f) => ({ code: f.code, length: f.length, panels: f.panels, filler: f.filler, hand: !!edits[f.code] }));
  const widths = r.layoutRules?.pk?.enabled ? [...new Set([...r.layoutRules.pk.wallWidthPriority, ...r.layoutRules.pk.wallWidthPriorityOut])].sort((a, b) => b - a) : r.layoutRules?.wallWidths?.length ? r.layoutRules.wallWidths : r.catalog.filter((c) => c.panel_category === "wall_panel" && Number(c.height_mm) === r.opt.stdHeight).map((c) => Number(c.width_mm));
  const canEdit = await hasPermission("quotations", "create");
  return (
    <div className="fade-in max-w-6xl">
      {back}
      <h1 className="mt-2 text-xl font-semibold text-graphite-50">Edit panels by hand</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-graphite-400">
        Wall faces of <b>{r.plan.name}</b>. Change, add or remove panels on any face, or type them (for example <span className="font-mono">3×600 + 450</span>). The filler left on the face, or any overrun past the wall, is shown at once.
        A face changed by hand keeps your panels every time the layout is run again; &ldquo;Back to automatic&rdquo; returns it to the program&apos;s layout. If the walls are changed on the measuring screen, check that the face codes still match.
      </p>
      <FaceEditor planId={id} faces={faces} widths={widths} canEdit={canEdit} />
    </div>
  );
}
