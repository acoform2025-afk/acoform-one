"use client";

import { useEffect, useState } from "react";

const MINE = process.env.BUILD_STAMP ?? "";
const STALE = /Server Action .* was not found|failed-to-find-server-action/i;

/**
 * After a new version goes live, a page opened before it can no longer save ("Server Action … was not found").
 * This notices the new version (checked every 2 minutes and whenever the tab comes back) and shows a bar to reload;
 * if a save already failed for that reason, it says so.
 */
export function VersionWatch() {
  const [stale, setStale] = useState<"new" | "failed" | null>(null);
  useEffect(() => {
    let off = false;
    const check = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" }); if (!r.ok) return;
        const j = (await r.json()) as { build?: string };
        if (!off && j.build && MINE && j.build !== MINE) setStale((s) => s ?? "new");
      } catch { /* offline / restarting */ }
    };
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    const onRej = (e: PromiseRejectionEvent) => { if (STALE.test(String(e.reason?.message ?? e.reason ?? ""))) setStale("failed"); };
    const onErr = (e: ErrorEvent) => { if (STALE.test(String(e.message ?? ""))) setStale("failed"); };
    // screens that show a failed save in a pop-up: this one message becomes the reload bar instead
    const alert0 = window.alert;
    window.alert = (m?: unknown) => { if (STALE.test(String(m ?? ""))) { setStale("failed"); return; } alert0.call(window, m as string); };
    const id = window.setInterval(check, 120_000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("unhandledrejection", onRej);
    window.addEventListener("error", onErr);
    void check();
    return () => { off = true; window.alert = alert0; window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("unhandledrejection", onRej); window.removeEventListener("error", onErr); };
  }, []);
  if (!stale) return null;
  return (
    <div className="sticky top-0 z-50 -mx-4 -mt-6 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-brand-orange/60 bg-graphite-900 px-4 py-2 text-xs text-graphite-100 md:-mx-8 md:-mt-8 md:px-8">
      <span>{stale === "failed" ? "This page is from the old version of ACOFORM ONE, so it could not save. Reload the page and do the last step again — everything saved before is kept." : "A new version of ACOFORM ONE is live. Reload the page to use it (save your work first)."}</span>
      <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-brand-orange px-3 py-1 font-medium text-white hover:opacity-90">Reload</button>
    </div>
  );
}
