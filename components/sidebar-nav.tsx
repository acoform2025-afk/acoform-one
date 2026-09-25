"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

export function SidebarNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path === item.href || path.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              active ? "bg-signal-amber/15 font-medium text-signal-amber" : "text-graphite-400 hover:bg-graphite-800 hover:text-graphite-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
