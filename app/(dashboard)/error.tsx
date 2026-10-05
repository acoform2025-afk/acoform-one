"use client";

import { useEffect } from "react";

/** Friendly screen instead of "Application error": usually the server was restarting (new version / busy). */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunk = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|502|Server Action .* was not found|failed-to-find-server-action/i.test(`${error?.name} ${error?.message}`);
  useEffect(() => {
    // a page file failed to load (server restarted with a new version): reload once automatically
    if (chunk && typeof window !== "undefined" && !sessionStorage.getItem("acoform-reloaded")) {
      try { sessionStorage.setItem("acoform-reloaded", "1"); } catch { /* ignore */ }
      window.location.reload();
    }
  }, [chunk]);
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-graphite-800 bg-graphite-900 p-6 text-center">
      <h2 className="text-base font-semibold text-graphite-50">This page didn&apos;t load</h2>
      <p className="mt-2 text-sm text-graphite-400">The server was probably restarting (a new version, or it was busy). Wait a few seconds and try again.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={() => { try { sessionStorage.removeItem("acoform-reloaded"); } catch { /* ignore */ } window.location.reload(); }} className="rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90">Reload the page</button>
        <button onClick={() => reset()} className="rounded-md border border-graphite-700 px-4 py-2 text-sm text-graphite-200 hover:bg-graphite-800">Try again</button>
      </div>
      {error?.digest ? <p className="mt-3 text-[11px] text-graphite-600">Ref {error.digest}</p> : null}
    </div>
  );
}
