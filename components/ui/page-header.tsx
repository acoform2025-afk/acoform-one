import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, className }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-graphite-50">{title}</h1>
        {description ? <p className="mt-1 text-sm text-graphite-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
