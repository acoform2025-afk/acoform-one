"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type Result = { success: boolean; error?: string; redirectTo?: string };

const STYLES = {
  primary: "bg-signal-amber text-graphite-950 font-semibold hover:opacity-90",
  secondary: "border border-graphite-700 text-graphite-200 hover:bg-graphite-800",
  success: "border border-signal-green/40 bg-signal-green/10 text-signal-green hover:bg-signal-green/20",
  danger: "border border-signal-red/40 bg-signal-red/10 text-signal-red hover:bg-signal-red/20",
};

/** Button bound to a server action (pass the action with its arguments already bound). */
export function ActionButton({ action, label, pendingLabel, variant = "secondary", confirm, small }: {
  action: () => Promise<Result>; label: string; pendingLabel?: string; variant?: keyof typeof STYLES; confirm?: string; small?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const r = await action();
            if (!r.success) setError(r.error ?? "Something went wrong.");
            else if (r.redirectTo) router.push(r.redirectTo);
          });
        }}
        className={`rounded-md ${small ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"} transition-colors disabled:opacity-50 ${STYLES[variant]}`}
      >
        {pending ? pendingLabel ?? "Working…" : label}
      </button>
      {error && <span className="max-w-md text-xs text-signal-red">{error}</span>}
    </span>
  );
}
