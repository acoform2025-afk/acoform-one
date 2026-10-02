"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { touchPlanFile } from "../actions";

/**
 * Reads the original AutoCAD DWG again in this browser with the latest drawing reader (e.g. after the app learned to
 * read door / window / railing lines or sections) and replaces the converted drawing. The plan's measurements,
 * region and settings stay; every plan using the same drawing gets the new reading.
 */
export function ReReadDwgButton({ id, originalUrl, filePath }: { id: string; originalUrl: string; filePath: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async () => {
    if (!window.confirm("Read the original DWG again with the latest drawing reader? Your region, settings and measurements stay. It can take a minute for a big drawing.")) return;
    try {
      setBusy("Downloading DWG…");
      const res = await fetch(originalUrl); if (!res.ok) throw new Error("Could not download the original DWG.");
      const bytes = new Uint8Array(await res.arrayBuffer());
      setBusy("Reading drawing…");
      const { convertDwgInBrowser } = await import("@/lib/floor-plans/dwg-web");
      let dxf: string | null = (await convertDwgInBrowser(bytes)).dxf;
      setBusy("Saving…");
      const { gzipText } = await import("@/lib/floor-plans/dxf-text");
      const packed = await gzipText(dxf); dxf = null;
      const up = await createClient().storage.from("floor-plans").upload(filePath, packed, { contentType: "application/dxf", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const r = await touchPlanFile(id); if (r.error) throw new Error(r.error);
      setBusy(null); router.refresh();
    } catch (e) { setBusy(null); window.alert(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <button type="button" disabled={!!busy} onClick={run} title="Read the original DWG again with the latest reader"
      className="inline-flex items-center gap-1.5 rounded-md border border-graphite-700 px-3 py-1.5 text-xs text-graphite-200 hover:bg-graphite-800 disabled:opacity-60">
      <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />{busy ?? "Re-read DWG"}
    </button>
  );
}
