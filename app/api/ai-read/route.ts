import { createClient } from "@/lib/supabase/server";
import { AI_SYSTEM, parseAiRead } from "@/lib/floor-plans/ai-read";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sends the pictures + layer table of a drawing to the AI and returns its reading. The key stays on the server (ANTHROPIC_API_KEY). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "NO_KEY" }, { status: 501 });
  let body: { images?: string[]; table?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }
  const images = (body.images ?? []).filter((s) => typeof s === "string" && s.length < 6_000_000).slice(0, 4);
  if (!images.length || typeof body.table !== "string" || body.table.length > 120_000) return Response.json({ error: "Missing pictures or table." }, { status: 400 });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const content: unknown[] = [];
  images.forEach((b64, i) => { content.push({ type: "text", text: `Picture ${i + 1}${i === 0 ? " (whole drawing)" : " (zoom)"}:` }); content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } }); });
  content.push({ type: "text", text: body.table });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 8000, system: AI_SYSTEM, messages: [{ role: "user", content }] }),
    });
    const j = await r.json();
    if (!r.ok) return Response.json({ error: `AI service said: ${j?.error?.message ?? r.status}` }, { status: 502 });
    const text = (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
    const out = parseAiRead(text, model);
    if (!out) return Response.json({ error: "The AI answer could not be understood. Try again." }, { status: 502 });
    return Response.json({ read: out });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "AI call failed." }, { status: 502 }); }
}
