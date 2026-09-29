import { cn } from "@/lib/utils";

// One place for every status colour in the ERP (leads, quotations, production, …)
const TONES: Record<string, string> = {
  gray: "bg-graphite-800 text-graphite-300",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  green: "bg-green-500/15 text-green-800 dark:text-green-300",
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  // leads
  new: "blue", contacted: "violet", qualified: "amber", quoted: "amber", won: "green", lost: "red",
  // quotations
  draft: "gray", pending_approval: "amber", approved: "green", sent: "blue", accepted: "green",
  rejected: "red", expired: "gray", superseded: "gray",
  // generic
  active: "green", completed: "green", cancelled: "red", in_progress: "blue", planned: "gray",
};

export function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONES[STATUS_TONE[status] ?? "gray"];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tone, className)}>
      {statusLabel(status)}
    </span>
  );
}
