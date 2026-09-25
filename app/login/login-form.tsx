"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

const input =
  "rounded-md border border-graphite-700 bg-graphite-900 px-3.5 py-2.5 text-sm text-graphite-100 placeholder:text-graphite-600 focus:border-signal-amber focus:outline-none";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {state?.error && (
        <p className="rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">{state.error}</p>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">Email</span>
        <input name="email" type="email" autoComplete="email" required className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-graphite-400">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-signal-amber px-4 py-2.5 text-sm font-semibold text-graphite-950 transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
