import type { createClient } from "@/lib/supabase/server";

type Sb = Awaited<ReturnType<typeof createClient>>;

/** One lead = one quotation number (per kind of quotation): the lead's current quotation of this kind is edited while it is a
 *  draft / pending, and becomes the next revision (R1, R2 …) once it is approved or sent. null = nothing to reuse, make a new one. */
export async function reuseForLead(supabase: Sb, leadId: string | null | undefined, type: "accessories" | "detailed"): Promise<{ id: string } | { error: string } | null> {
  if (!leadId || !/^[0-9a-f-]{36}$/i.test(leadId)) return null;
  const { data: ex } = await supabase.from("quotations").select("id,status,quotation_code").eq("lead_id", leadId).eq("quotation_type", type).neq("status", "superseded").order("created_at", { ascending: false }).limit(1);
  const head = ex?.[0];
  if (!head) return null;
  if (head.status === "accepted") return { error: `${head.quotation_code} for this lead is already accepted and converted to a project, so it cannot be changed.` };
  if (head.status === "draft" || head.status === "pending_approval") return { id: head.id };
  const rv = await supabase.rpc("create_quotation_revision", { p_quotation_id: head.id, p_reprice: false });
  if (rv.error) return { error: rv.error.message.replace(/^.*ERROR:\s*/i, "") };
  return { id: rv.data as string };
}
