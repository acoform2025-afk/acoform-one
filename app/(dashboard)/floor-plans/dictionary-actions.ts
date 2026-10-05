"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { dbError } from "@/lib/format";
import { CONCEPT_BY_KEY } from "@/lib/floor-plans/vocab";

type Result = { ok?: boolean; error?: string };
const ROLES = ["ignore", "walls", "columns", "slab", "opening", "beams", "upstand"] as const;
const schema = z.object({
  terms: z.record(z.string().min(1).max(80), z.string().max(40).nullable()).optional(),
  layers: z.record(z.string().min(1).max(200), z.enum(ROLES).nullable()).optional(),
});

/**
 * Teaches the company drawing dictionary: words ("O.H.W.T" → water tank) and layer names ("g-r.c.c" → walls).
 * null forgets an entry. Every later drawing is read with it.
 */
export async function teachDrawing(input: z.infer<typeof schema>): Promise<Result> {
  try { await requirePermission("quotations", "create"); } catch { return { error: "Your role can't teach the drawing dictionary." }; }
  const p = schema.safeParse(input); if (!p.success) return { error: "Invalid dictionary entry." };
  for (const v of Object.values(p.data.terms ?? {})) if (v && v !== "ignore" && !CONCEPT_BY_KEY.has(v)) return { error: `Unknown meaning "${v}".` };
  const supabase = await createClient();
  const { data: row } = await supabase.from("drawing_dictionary").select("tenant_id, terms, layers").maybeSingle();
  const merge = (base: unknown, add: Record<string, string | null> | undefined) => {
    const out = { ...((base && typeof base === "object" ? base : {}) as Record<string, string>) };
    for (const [k, v] of Object.entries(add ?? {})) { if (v == null) delete out[k]; else out[k] = v; }
    return out;
  };
  const terms = merge(row?.terms, p.data.terms), layers = merge(row?.layers, p.data.layers);
  const { error } = row
    ? await supabase.from("drawing_dictionary").update({ terms, layers, updated_at: new Date().toISOString() }).eq("tenant_id", row.tenant_id)
    : await supabase.from("drawing_dictionary").insert({ terms, layers });
  if (error) return { error: dbError(error.message) };
  revalidatePath("/floor-plans", "layout");
  return { ok: true };
}
