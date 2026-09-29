import path from "node:path";
import type { createClient } from "@/lib/supabase/server";

/**
 * Site photos + client logos printed on the quotation PDF ("Our work at site" / "Our esteemed clients").
 * Managed from Settings. storage_path is either "builtin:<folder>/<file>" (shipped in /public/brand)
 * or "<tenant_id>/<file>" in the private "quotation-media" storage bucket.
 */
export const MEDIA_BUCKET = "quotation-media";
export const MEDIA_LIMITS = { site_photo: 3, client_logo: 12 } as const;
export type MediaKind = keyof typeof MEDIA_LIMITS;

export type MediaItem = { id: string; kind: MediaKind; storage_path: string; caption: string | null; sort_order: number };

type Supa = Awaited<ReturnType<typeof createClient>>;

export async function listMedia(supabase: Supa): Promise<MediaItem[]> {
  const { data } = await supabase
    .from("quotation_media")
    .select("id, kind, storage_path, caption, sort_order")
    .order("kind")
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as MediaItem[];
}

const isBuiltin = (p: string) => p.startsWith("builtin:");
const builtinRel = (p: string) => p.slice("builtin:".length).replace(/\.\.+/g, "");

/** Browser-viewable URLs (for the Settings screen). Uploaded files get short-lived signed links. */
export async function mediaViewUrls(supabase: Supa, items: MediaItem[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uploaded = items.filter((m) => !isBuiltin(m.storage_path));
  if (uploaded.length) {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(uploaded.map((m) => m.storage_path), 60 * 60);
    (data ?? []).forEach((d, i) => { if (d.signedUrl) out[uploaded[i].id] = d.signedUrl; });
  }
  for (const m of items) if (isBuiltin(m.storage_path)) out[m.id] = `/brand/${builtinRel(m.storage_path)}`;
  return out;
}

/** Image sources react-pdf can draw: a file path for built-ins, raw bytes for uploads. */
export type PdfImageSrc = string | { data: Buffer; format: "png" | "jpg" };

export async function mediaForPdf(supabase: Supa): Promise<{ photos: PdfImageSrc[]; logos: PdfImageSrc[] }> {
  const items = await listMedia(supabase);
  const resolve = async (m: MediaItem): Promise<PdfImageSrc | null> => {
    if (isBuiltin(m.storage_path)) return path.join(process.cwd(), "public", "brand", builtinRel(m.storage_path));
    const { data } = await supabase.storage.from(MEDIA_BUCKET).download(m.storage_path);
    if (!data) return null;
    const format = /\.png$/i.test(m.storage_path) ? "png" : "jpg";
    return { data: Buffer.from(await data.arrayBuffer()), format };
  };
  const all = await Promise.all(items.map(async (m) => ({ kind: m.kind, src: await resolve(m) })));
  return {
    photos: all.filter((x) => x.kind === "site_photo" && x.src).map((x) => x.src!).slice(0, MEDIA_LIMITS.site_photo),
    logos: all.filter((x) => x.kind === "client_logo" && x.src).map((x) => x.src!).slice(0, MEDIA_LIMITS.client_logo),
  };
}
