"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createFloorPlan, createFloorPlanFromDwg } from "../actions";

type Lead = { id: string; lead_code: string; label: string };
const input = "w-full rounded-md border border-graphite-700 bg-graphite-950 px-3 py-2 text-sm text-graphite-100 focus:border-brand-orange focus:outline-none";

function kindOf(name: string): { kind: "dwg" | "dxf" | "pdf" | "image"; ext: string; mime: string } | null {
  const e = name.toLowerCase().split(".").pop() ?? "";
  if (e === "dwg") return { kind: "dwg", ext: "dwg", mime: "image/vnd.dwg" };
  if (e === "dxf") return { kind: "dxf", ext: "dxf", mime: "application/dxf" };
  if (e === "pdf") return { kind: "pdf", ext: "pdf", mime: "application/pdf" };
  if (e === "jpg" || e === "jpeg") return { kind: "image", ext: "jpg", mime: "image/jpeg" };
  if (e === "png") return { kind: "image", ext: "png", mime: "image/png" };
  return null;
}

export function UploadFloorPlanForm({ tenantId, leads, leadId, quotationId }: { tenantId: string; leads: Lead[]; leadId?: string; quotationId?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [lead, setLead] = useState(leadId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [drawingType, setDrawingType] = useState<"plan" | "section" | "elevation" | "other">("plan");
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setError(null); setFile(null);
    if (!f) return;
    if (!kindOf(f.name)) { setError("Please choose a DWG, DXF, PDF, JPG or PNG file."); return; }
    if (f.size > 25 * 1024 * 1024) { setError("File is larger than 25 MB. In AutoCAD run PURGE and save again, or export only the needed sheet."); return; }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 150));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Choose a floor plan file first."); return; }
    const k = kindOf(file.name)!;
    setBusy("Uploading…"); setError(null);
    try {
      const id = crypto.randomUUID();
      const base = { id, name: name.trim() || file.name, leadId: lead || undefined, fileName: file.name.slice(0, 255), drawingType };
      const bucket = createClient().storage.from("floor-plans");
      let res: { error?: string };
      if (k.kind === "dwg") {
        const path = `${tenantId}/${id}/original.dwg`;
        const up = await bucket.upload(path, file, { contentType: k.mime });
        if (up.error) throw new Error("Upload failed: " + up.error.message);
        setBusy("Reading AutoCAD drawing…");
        res = await createFloorPlanFromDwg({ ...base, originalPath: path });
      } else {
        const path = `${tenantId}/${id}/source.${k.ext}`;
        const up = await bucket.upload(path, file, { contentType: k.mime });
        if (up.error) throw new Error("Upload failed: " + up.error.message);
        res = await createFloorPlan({ ...base, sourceKind: k.kind, filePath: path });
      }
      if (res.error) throw new Error(res.error);
      router.push(`/floor-plans/${id}${quotationId ? `?quotation=${quotationId}` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl rounded-lg border border-graphite-800 bg-graphite-900 p-5">
      <button
        type="button" onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null); }}
        className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-graphite-700 bg-graphite-950 px-4 py-8 text-center hover:border-brand-orange"
      >
        <FileUp className="size-8 text-graphite-500" />
        <span className="text-sm font-medium text-graphite-200">{file ? file.name : "Click to choose the floor plan, or drop it here"}</span>
        <span className="text-xs text-graphite-500">
          {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "AutoCAD DWG or DXF (areas read automatically) · PDF · JPG · PNG — up to 25 MB"}
        </span>
      </button>
      <input ref={fileRef} type="file" accept=".dwg,.dxf,.pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="e.g. Typical floor plan – Tower A" className={input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">Drawing type</span>
          <select value={drawingType} onChange={(e) => setDrawingType(e.target.value as typeof drawingType)} className={input}>
            <option value="plan">Floor plan</option><option value="section">Section</option><option value="elevation">Elevation</option><option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">Lead (optional)</span>
          <select value={lead} onChange={(e) => setLead(e.target.value)} className={input}>
            <option value="">— None —</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.lead_code} — {l.label}</option>)}
          </select>
        </label>
      </div>

      {error ? <p className="mt-4 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{error}</p> : null}

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={!!busy || !file} className="inline-flex items-center gap-2 rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} {busy ?? "Upload & open"}
        </button>
        <p className="text-xs text-graphite-500">DWG files are read with the open-source LibreDWG reader. If one won&apos;t open, use Save As → DXF.</p>
      </div>
    </form>
  );
}
