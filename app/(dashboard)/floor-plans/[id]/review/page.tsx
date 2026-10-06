import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { runPanels } from "@/lib/floor-plans/run-panels";
import { readChecks, type ReadBox } from "@/lib/floor-plans/read-checks";
import type { Pt } from "@/lib/floor-plans/calc";
import { AnswerButtons, ClearAnswers } from "./answer-buttons";

export const metadata = { title: "Reading review" };
export const dynamic = "force-dynamic";

const SEV: Record<string, { label: string; cls: string }> = {
  error: { label: "Must fix", cls: "bg-signal-red/15 text-signal-red" },
  warn: { label: "Check", cls: "bg-signal-amber/15 text-signal-amber" },
  info: { label: "Decided", cls: "bg-graphite-800 text-graphite-300" },
};

/** A small plan: walls grey, the item's box red. */
function MiniPlan({ walls, box, focus }: { walls: Pt[][]; box: ReadBox; focus: ReadBox }) {
  const W = 220, H = 150, pad = 0.4;
  const bw = box[2] - box[0] + 2 * pad, bh = box[3] - box[1] + 2 * pad, sc = Math.min(W / bw, H / bh);
  const d = (r: Pt[]) => r.map((p, i) => `${i ? "L" : "M"}${((p[0] - box[0] + pad) * sc).toFixed(1)} ${((p[1] - box[1] + pad) * sc).toFixed(1)}`).join(" ") + " Z";
  const fx = (focus[0] - box[0] + pad) * sc, fy = (focus[1] - box[1] + pad) * sc, fw = Math.max(4, (focus[2] - focus[0]) * sc), fh = Math.max(4, (focus[3] - focus[1]) * sc);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 rounded border border-graphite-800 bg-graphite-950">
      <path d={walls.map(d).join(" ")} fill="#6b7280" fillRule="evenodd" stroke="none" />
      <rect x={fx} y={fy} width={fw} height={fh} fill="#ef4444" fillOpacity={0.25} stroke="#ef4444" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Reading review: the reader lists what it decided on its own and what looks doubtful, each with a picture of where it
 * is on the plan and a one-click answer. Answers are kept on the plan; the plan is read again with them at once.
 */
export default async function ReadingReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [r, canEdit] = await Promise.all([runPanels(supabase, id, {}), hasPermission("quotations", "create")]);
  if (!r) notFound();
  const back = <Link href={`/floor-plans/${id}`} className="text-xs text-graphite-500 hover:text-graphite-300">← {r.plan.name}</Link>;
  if (r.error || !r.inp) {
    return <div className="fade-in">{back}<h1 className="mt-1 text-lg font-semibold text-graphite-50">Reading review</h1><p className="mt-3 text-sm text-graphite-400">{r.error ?? "Measure and save this plan first."}</p></div>;
  }
  const inp = r.inp;
  const walls = inp.zoneWalls;
  const pts = walls.flat();
  const box: ReadBox = pts.length ? [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] : [0, 0, 10, 10];
  const dxf = r.t.dxf as { includeM?: ReadBox[]; excludeM?: ReadBox[] } | undefined;
  const marked = { includeM: dxf?.includeM ?? [], excludeM: dxf?.excludeM ?? [] };
  const checks = readChecks({ notes: (inp.readNotes ?? []) as never, zoneWalls: walls, zones: r.zones ?? [], faces: r.result.faces, stairs: inp.zoneStairs.length, box, marked });
  const counts = { error: checks.filter((c) => c.sev === "error").length, warn: checks.filter((c) => c.sev === "warn").length, info: checks.filter((c) => c.sev === "info").length };
  return (
    <div className="fade-in">
      {back}
      <h1 className="mt-1 text-lg font-semibold text-graphite-50">Reading review</h1>
      <p className="mb-4 max-w-3xl text-xs text-graphite-400">
        The reader checks itself: everything it decided on its own (left out as a detail, merged a column into a wall, took a stair from a label, made a
        slab bay from beam lines) and everything that looks doubtful is listed here with its place on the plan. Answer with one click; the plan is read again with
        your answer at once, and the answer stays with the plan.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-signal-red/15 px-2 py-1 text-signal-red">{counts.error} must fix</span>
        <span className="rounded-md bg-signal-amber/15 px-2 py-1 text-signal-amber">{counts.warn} to check</span>
        <span className="rounded-md bg-graphite-800 px-2 py-1 text-graphite-300">{counts.info} decided</span>
        <span className="text-graphite-500">· {inp.zoneWalls.length} wall outlines · {r.zones?.length ?? 0} deck zones · {inp.zoneStairs.length} stair{inp.zoneStairs.length === 1 ? "" : "s"} · {r.result.faces.length} wall faces</span>
        {marked.includeM.length + marked.excludeM.length ? <span className="ml-auto flex items-center gap-2 text-graphite-400">{marked.includeM.length} marked as part of the floor · {marked.excludeM.length} marked as not part of it {canEdit ? <ClearAnswers id={id} /> : null}</span> : null}
        <Link href={`/floor-plans/${id}/panels/3d`} className="rounded-md border border-graphite-700 px-2 py-1 text-graphite-200 hover:bg-graphite-800">3D model</Link>
        <Link href={`/floor-plans/${id}/read`} className="rounded-md border border-graphite-700 px-2 py-1 text-graphite-200 hover:bg-graphite-800">Drawing read-out</Link>
      </div>
      {checks.length === 0 ? <p className="rounded-md border border-graphite-800 p-4 text-sm text-graphite-300">Nothing doubtful: the reader found one connected floor, every wall face has a panel and no decision needed a guess.</p> : null}
      <ul className="space-y-3">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-4 rounded-md border border-graphite-800 bg-graphite-900/40 p-3">
            <MiniPlan walls={walls} box={box} focus={c.box} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEV[c.sev].cls}`}>{SEV[c.sev].label}</span>
                <span className="text-sm font-medium text-graphite-100">{c.title}</span>
              </div>
              <p className="mt-1 text-xs text-graphite-400">{c.detail}</p>
              {canEdit && c.fixes.length ? <AnswerButtons id={id} fixes={c.fixes} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
