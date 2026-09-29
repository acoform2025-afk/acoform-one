"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteFloorPlan } from "../actions";

export function DeletePlanButton({ id, leadId }: { id: string; leadId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} aria-label="Delete floor plan" title="Delete floor plan"
      onClick={() => {
        if (!window.confirm("Delete this drawing and its measurements? Quotations that print it will stop showing it.")) return;
        start(async () => { const r = await deleteFloorPlan(id); if (r.error) window.alert(r.error); else router.push(leadId ? `/leads/${leadId}` : "/floor-plans"); });
      }}
      className="rounded-md border border-graphite-700 p-1.5 text-graphite-400 hover:bg-graphite-800 hover:text-signal-red disabled:opacity-50">
      <Trash2 className="size-4" />
    </button>
  );
}
