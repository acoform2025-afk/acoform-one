"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyReadingAnswer, approveReading } from "../../actions";
import type { ReadFix } from "@/lib/floor-plans/read-checks";

/** One-click answers to a reader's doubt: the answer is saved on the plan and the page re-reads the plan. */
export function AnswerButtons({ id, fixes }: { id: string; fixes: ReadFix[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (f: ReadFix) => {
    setBusy(true);
    const r = await applyReadingAnswer(id, { kind: f.kind, box: f.box });
    setBusy(false);
    if (r.error) { window.alert(r.error); return; }
    router.refresh();
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {fixes.map((f, i) => (
        <button key={i} type="button" disabled={busy} onClick={() => run(f)} className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${f.kind === "include" ? "bg-signal-green text-white hover:opacity-90" : "border border-graphite-600 text-graphite-200 hover:bg-graphite-800"}`}>
          {busy ? "Reading again…" : f.label}
        </button>
      ))}
    </div>
  );
}

export function ClearAnswers({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={async () => { if (!window.confirm("Forget every answer given on this plan and read it again?")) return; setBusy(true); const r = await applyReadingAnswer(id, { kind: "clear" }); setBusy(false); if (r.error) window.alert(r.error); else router.refresh(); }}
      className="rounded-md border border-graphite-700 px-2 py-1 text-xs text-graphite-300 hover:bg-graphite-800 disabled:opacity-60">{busy ? "…" : "Forget answers"}</button>
  );
}

/** "This reading is correct": keeps the reading's fingerprint on the plan; later reads are compared with it. */
export function ApproveButton({ id, approved, label }: { id: string; approved: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await approveReading(id, !approved); setBusy(false); if (r.error) window.alert(r.error); else router.refresh(); }}
      className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${approved ? "border border-graphite-700 text-graphite-300 hover:bg-graphite-800" : "bg-signal-green text-white hover:opacity-90"}`}>
      {busy ? "…" : label ?? (approved ? "Withdraw approval" : "This reading is correct — approve it")}
    </button>
  );
}
