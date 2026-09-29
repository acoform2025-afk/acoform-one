"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addMedia, deleteMedia, moveMedia, renameMedia } from "./media-actions";

export type MediaTile = { id: string; kind: "site_photo" | "client_logo"; url: string; caption: string | null };

const BUCKET = "quotation-media";
const SECTIONS = [
  { kind: "site_photo" as const, title: "Site photos", max: 3, hint: "Printed under “Our work at site”. The first photo is shown large, the next two side by side. JPG or PNG.", aspect: "aspect-[4/3]", fit: "object-cover" },
  { kind: "client_logo" as const, title: "Client logos", max: 12, hint: "Printed under “Our esteemed clients”, 4 per row. A PNG with a white or clear background looks best.", aspect: "aspect-[3/2]", fit: "object-contain p-3 bg-white" },
];

/** Shrinks the picture in the browser before upload so PDFs stay small and phones' large photos upload fast. */
async function prepare(file: File, kind: MediaTile["kind"]): Promise<{ blob: Blob; ext: "jpg" | "png" }> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("This file can't be read. Please choose a JPG or PNG picture."); }
  const maxSide = kind === "site_photo" ? 1600 : 600;
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  const asPng = kind === "client_logo"; // logos keep a clear background
  if (!asPng) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, asPng ? "image/png" : "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not process this picture.");
  if (blob.size > 5 * 1024 * 1024) throw new Error("Picture is too large even after resizing (max 5 MB).");
  return { blob, ext: asPng ? "png" : "jpg" };
}

export function MediaManager({ items, tenantId, canEdit }: { items: MediaTile[]; tenantId: string; canEdit: boolean }) {
  return (
    <section id="quotation-pictures" className="overflow-hidden rounded-lg border border-graphite-800">
      <div className="border-b border-graphite-800 bg-graphite-900 px-4 py-3">
        <h2 className="text-sm font-medium text-graphite-200">Quotation pictures</h2>
        <p className="mt-0.5 text-xs text-graphite-500">
          Site photos and client logos printed on the quotation PDF page “Our work at site / Our esteemed clients”.
          Each quotation has a switch to include or leave out this page.
        </p>
      </div>
      <div className="divide-y divide-graphite-800 bg-graphite-950">
        {SECTIONS.map((sec) => (
          <MediaSection key={sec.kind} {...sec} items={items.filter((m) => m.kind === sec.kind)} tenantId={tenantId} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}

function MediaSection({ kind, title, max, hint, aspect, fit, items, tenantId, canEdit }: {
  kind: MediaTile["kind"]; title: string; max: number; hint: string; aspect: string; fit: string;
  items: MediaTile[]; tenantId: string; canEdit: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const full = items.length >= max;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null); setBusy(true);
    const supabase = createClient();
    try {
      const room = max - items.length;
      const list = Array.from(files).slice(0, room);
      if (files.length > room) setError(`Only ${room} more ${room === 1 ? "picture fits" : "pictures fit"} here — the rest were skipped.`);
      for (const file of list) {
        const { blob, ext } = await prepare(file, kind);
        const path = `${tenantId}/${kind}-${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: ext === "png" ? "image/png" : "image/jpeg" });
        if (up.error) throw new Error("Upload failed: " + up.error.message);
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
        const res = await addMedia(kind, path, name);
        if (res.error) throw new Error(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => { const r = await fn(); if (r.error) setError(r.error); });
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-graphite-100">{title} <span className="text-graphite-500">({items.length}/{max})</span></h3>
          <p className="mt-0.5 max-w-xl text-xs text-graphite-500">{hint}</p>
        </div>
        {canEdit ? (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <button
              type="button" onClick={() => fileRef.current?.click()} disabled={busy || full}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              title={full ? `Maximum ${max}. Delete one to add another.` : undefined}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {busy ? "Uploading…" : full ? "Maximum reached" : kind === "site_photo" ? "Upload photo" : "Upload logo"}
            </button>
          </>
        ) : null}
      </div>

      {error ? <p className="mt-3 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{error}</p> : null}

      {items.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-graphite-700 px-4 py-6 text-center text-sm text-graphite-500">
          None yet{canEdit ? " — click Upload to add." : "."}
        </p>
      ) : (
        <ul className={`mt-4 grid gap-3 ${kind === "site_photo" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
          {items.map((m, i) => (
            <li key={m.id} className="overflow-hidden rounded-md border border-graphite-800 bg-graphite-900">
              <div className={`relative ${aspect}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.caption ?? title} className={`absolute inset-0 h-full w-full ${fit}`} />
                {kind === "site_photo" && i === 0 ? (
                  <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Large photo</span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 p-2">
                {canEdit ? (
                  <input
                    defaultValue={m.caption ?? ""} maxLength={120} placeholder="Name (optional)"
                    onBlur={(e) => { if (e.target.value !== (m.caption ?? "")) run(() => renameMedia(m.id, e.target.value)); }}
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-graphite-200 hover:border-graphite-700 focus:border-brand-orange focus:outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate px-1.5 text-xs text-graphite-300">{m.caption ?? "—"}</span>
                )}
                {canEdit ? (
                  <>
                    <IconBtn label="Move earlier" disabled={isPending || i === 0} onClick={() => run(() => moveMedia(m.id, -1))}><ArrowLeft className="size-3.5" /></IconBtn>
                    <IconBtn label="Move later" disabled={isPending || i === items.length - 1} onClick={() => run(() => moveMedia(m.id, 1))}><ArrowRight className="size-3.5" /></IconBtn>
                    <IconBtn label="Delete" danger disabled={isPending} onClick={() => { if (window.confirm("Remove this picture from quotations?")) run(() => deleteMedia(m.id)); }}><Trash2 className="size-3.5" /></IconBtn>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`rounded p-1.5 text-graphite-400 hover:bg-graphite-800 disabled:opacity-30 ${danger ? "hover:text-signal-red" : "hover:text-graphite-100"}`}
    >
      {children}
    </button>
  );
}
