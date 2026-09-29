import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { ActionButton } from "@/components/action-button";
import { inr, num, titleCase } from "@/lib/format";
import { WallForm } from "./wall-form";
import {
  approveDesign, deleteWall, generateBom, rejectDesign, runCheck, runLayoutEngine, selectOption, submitDesign,
} from "../actions";

const STATUS: Record<string, string> = {
  draft: "bg-graphite-800 text-graphite-300", calculated: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  pending_approval: "bg-signal-amber/15 text-signal-amber", approved: "bg-signal-green/15 text-signal-green", rejected: "bg-signal-red/15 text-signal-red",
};

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: d } = await supabase.from("designs").select("*, projects ( id, project_code, customer_name )").eq("id", id).single();
  if (!d) notFound();
  const project = Array.isArray(d.projects) ? d.projects[0] : d.projects;

  const [{ data: walls }, { data: options }, { data: calcs }, { data: boms }, { data: params_ }] = await Promise.all([
    supabase.from("design_walls").select("*").eq("design_id", id).order("sequence_order"),
    supabase.from("layout_options").select("*").eq("design_id", id).order("rank"),
    d.selected_layout_option_id
      ? supabase.from("engineering_calculations").select("*, design_walls ( wall_code )").eq("layout_option_id", d.selected_layout_option_id)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("bom_headers").select("id, version, status, total_panel_count, total_weight_kg").eq("design_id", id).order("version"),
    supabase.from("engineering_parameters").select("is_certified").maybeSingle(),
  ]);

  const selected = options?.find((o) => o.id === d.selected_layout_option_id);
  const { data: selPanels } = selected
    ? await supabase.from("layout_panels").select("panel_role, custom_width_mm, quantity, design_wall_id, panel_master ( panel_code )").eq("layout_option_id", selected.id).order("sequence_in_wall")
    : { data: [] as never[] };

  const [canCreate, canApprove, canBom] = await Promise.all([
    hasPermission("designs", "create"), hasPermission("designs", "approve"), hasPermission("bom", "generate"),
  ]);
  const editable = canCreate && ["draft", "calculated", "rejected"].includes(d.status);
  const allPass = (walls?.length ?? 0) > 0 && calcs?.length === walls?.length && calcs!.every((c) => c.overall_pass);
  const placeholder = calcs?.some((c) => c.uses_placeholder_constants);
  const nextWall = `W${(walls?.length ?? 0) + 1}`;

  return (
    <div className="fade-in max-w-5xl">
      <p className="text-xs text-graphite-500">
        <Link href={`/projects/${project?.id}`} className="hover:text-signal-amber">{project?.project_code}</Link> · {project?.customer_name}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-graphite-50">{d.design_code}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS[d.status] ?? ""}`}>{titleCase(d.status)}</span>
      </div>

      {params_ && !params_.is_certified && (
        <p className="mt-4 rounded-md border border-signal-amber/30 bg-signal-amber/10 px-4 py-3 text-sm text-signal-amber">
          Engineering parameters are still placeholders. Designs can be checked but not approved until the design head enters ACOFORM&apos;s certified values in <Link href="/settings#engineering" className="underline">Settings</Link>.
        </p>
      )}

      {/* 1. Walls */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-graphite-200">1 · Walls</h2>
        <div className="overflow-hidden rounded-lg border border-graphite-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
              <tr><th className="px-4 py-2.5">Wall</th><th className="px-4 py-2.5 text-right">Length</th><th className="px-4 py-2.5 text-right">Height</th><th className="px-4 py-2.5 text-right">Thickness</th><th className="px-4 py-2.5">Corners</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-graphite-800">
              {(walls ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-600">No walls yet.</td></tr>}
              {(walls ?? []).map((w) => (
                <tr key={w.id} className="bg-graphite-950">
                  <td className="px-4 py-2.5 font-mono text-xs text-aluminium-300">{w.wall_code}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{num(w.length_mm, 0)} mm</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{num(w.height_mm, 0)} mm</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{num(w.thickness_mm, 0)} mm</td>
                  <td className="px-4 py-2.5 text-xs text-graphite-400">{titleCase(w.start_corner)} → {titleCase(w.end_corner)}</td>
                  <td className="px-4 py-2.5 text-right">{editable && <ActionButton small variant="danger" label="Remove" action={deleteWall.bind(null, id, w.id)} confirm={`Remove wall ${w.wall_code}? Layouts will need to be generated again.`} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && <div className="mt-3"><WallForm designId={id} nextCode={nextWall} /></div>}
      </section>

      {/* 2. Layouts */}
      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-graphite-200">2 · Panel layout options</h2>
          {editable && (walls?.length ?? 0) > 0 && (
            <ActionButton variant="primary" label={options?.length ? "Regenerate layouts" : "Generate layouts"} pendingLabel="Generating…" action={runLayoutEngine.bind(null, id)} />
          )}
        </div>
        {(options ?? []).length === 0 ? (
          <p className="rounded-lg border border-graphite-800 bg-graphite-900 px-4 py-6 text-center text-sm text-graphite-600">Add walls, then generate layouts. Three strategies are compared and ranked.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {options!.map((o) => (
              <div key={o.id} className={`rounded-lg border p-4 ${o.is_selected ? "border-signal-amber bg-signal-amber/5" : "border-graphite-800 bg-graphite-900"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-graphite-100">{o.strategy_label}</p>
                  <span className="rounded-full bg-graphite-800 px-2 py-0.5 text-[11px] text-graphite-300">Rank {o.rank}</span>
                </div>
                <p className="mt-2 font-mono text-2xl text-graphite-50">{num(o.composite_score, 1)}<span className="text-xs text-graphite-500"> / 100</span></p>
                <dl className="mt-2 space-y-0.5 text-xs text-graphite-400">
                  <div className="flex justify-between"><dt>Standard panels</dt><dd>{num(Number(o.standardization_rate) * 100, 1)}%</dd></div>
                  <div className="flex justify-between"><dt>Panel types</dt><dd>{o.distinct_panel_type_count}</dd></div>
                  <div className="flex justify-between"><dt>Custom fillers</dt><dd>{o.custom_filler_count}</dd></div>
                  <div className="flex justify-between"><dt>Weight</dt><dd>{num(o.total_weight_kg, 1)} kg</dd></div>
                  <div className="flex justify-between"><dt>Est. cost</dt><dd>{inr(o.total_estimated_cost, 0)}</dd></div>
                </dl>
                <p className="mt-2 text-[11px] leading-snug text-graphite-500">{o.reasoning}</p>
                <div className="mt-3">
                  {o.is_selected ? <span className="text-xs font-medium text-signal-amber">Selected</span>
                    : editable && <ActionButton small label="Use this layout" action={selectOption.bind(null, id, o.id)} />}
                </div>
              </div>
            ))}
          </div>
        )}
        {selected && (selPanels ?? []).length > 0 && (
          <details className="mt-3 rounded-lg border border-graphite-800 bg-graphite-900 p-4 text-sm">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-graphite-400">Selected layout — panel list</summary>
            <ul className="mt-2 grid gap-1 text-xs text-graphite-300 md:grid-cols-2">
              {(selPanels as { panel_role: string; custom_width_mm: number | null; quantity: number; design_wall_id: string; panel_master: { panel_code: string } | { panel_code: string }[] | null }[]).map((p, i) => {
                const pm = Array.isArray(p.panel_master) ? p.panel_master[0] : p.panel_master;
                const wall = walls?.find((w) => w.id === p.design_wall_id)?.wall_code;
                return <li key={i} className="font-mono">{wall} · {pm?.panel_code ?? `CUSTOM ${num(p.custom_width_mm, 0)} mm`} × {p.quantity}</li>;
              })}
            </ul>
          </details>
        )}
      </section>

      {/* 3. Engineering */}
      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-graphite-200">3 · Engineering check</h2>
          {editable && selected && <ActionButton variant="primary" label="Run engineering check" pendingLabel="Checking…" action={runCheck.bind(null, id)} />}
        </div>
        {(calcs ?? []).length === 0 ? (
          <p className="rounded-lg border border-graphite-800 bg-graphite-900 px-4 py-6 text-center text-sm text-graphite-600">Not checked yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-graphite-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
                <tr><th className="px-4 py-2.5">Wall</th><th className="px-4 py-2.5 text-right">Pressure</th><th className="px-4 py-2.5 text-right">Tie load / capacity</th><th className="px-4 py-2.5 text-right">Safety factor</th><th className="px-4 py-2.5 text-right">Deflection L/</th><th className="px-4 py-2.5">Result</th></tr>
              </thead>
              <tbody className="divide-y divide-graphite-800">
                {calcs!.map((c) => {
                  const wall = Array.isArray(c.design_walls) ? c.design_walls[0] : c.design_walls;
                  return (
                    <tr key={c.id} className="bg-graphite-950 text-xs">
                      <td className="px-4 py-2.5 font-mono text-aluminium-300">{wall?.wall_code}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{num(c.concrete_pressure_kpa, 1)} kPa</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${c.tie_load_pass ? "" : "text-signal-red"}`}>{num(c.tie_load_kn, 1)} / {num(c.tie_capacity_kn, 0)} kN</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${c.safety_factor_pass ? "" : "text-signal-red"}`}>{num(c.safety_factor, 2)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${c.deflection_pass ? "" : "text-signal-red"}`}>{num(c.deflection_ratio, 0)} (min {num(c.deflection_limit_ratio, 0)})</td>
                      <td className="px-4 py-2.5">{c.overall_pass ? <span className="text-signal-green">Pass</span> : <span className="text-signal-red">Fail</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {placeholder && <p className="border-t border-graphite-800 bg-graphite-900 px-4 py-2 text-xs text-signal-amber">Calculated with placeholder parameters — not valid for approval.</p>}
          </div>
        )}
      </section>

      {/* 4. Approval & BOM */}
      <section className="mt-8 flex flex-wrap items-start gap-3">
        {canCreate && d.status === "calculated" && allPass && <ActionButton variant="primary" label="Submit for approval" action={submitDesign.bind(null, id)} />}
        {canApprove && d.status === "pending_approval" && (
          <>
            <ActionButton variant="success" label="Approve design" action={approveDesign.bind(null, id)} />
            <ActionButton variant="danger" label="Reject" action={rejectDesign.bind(null, id)} confirm="Reject this design and send it back for changes?" />
          </>
        )}
        {canBom && d.status === "approved" && <ActionButton variant="primary" label="Generate BOM" pendingLabel="Generating…" action={generateBom.bind(null, id)} />}
      </section>

      {(boms ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-graphite-200">Bills of material</h2>
          <ul className="space-y-1 text-sm">
            {boms!.map((b) => (
              <li key={b.id}><Link href={`/boms/${b.id}`} className="text-aluminium-300 hover:underline">BOM v{b.version}</Link>
                <span className="text-xs text-graphite-500"> · {titleCase(b.status)} · {b.total_panel_count} panels · {num(b.total_weight_kg, 1)} kg</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
