"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes, Factory, FileText, FolderKanban, LayoutDashboard, LogOut, Menu, Ruler, Settings, Users, X, DraftingCompass } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type Group = { label: string; items: Item[] };

// ERP menu, grouped by department (same idea as ERPNext / Odoo module menus)
const NAV: Group[] = [
  { label: "", items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  { label: "Sales", items: [
    { href: "/leads", label: "Leads", icon: Users },
    { href: "/quotations", label: "Quotations", icon: FileText },
    { href: "/floor-plans", label: "Floor plans & area", icon: DraftingCompass },
  ] },
  { label: "Engineering", items: [
    { href: "/projects", label: "Projects & designs", icon: FolderKanban },
    { href: "/panel-catalog", label: "Panel catalog & rates", icon: Ruler },
  ] },
  { label: "Operations", items: [
    { href: "/production", label: "Production & QC", icon: Factory },
    { href: "/inventory", label: "Inventory & dispatch", icon: Boxes },
  ] },
  { label: "Admin", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-4">
      {NAV.map((g) => (
        <div key={g.label || "home"}>
          {g.label ? <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-graphite-500">{g.label}</p> : null}
          <div className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = isActive(path, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-brand-orange/10 font-medium text-brand-orange-dark dark:text-brand-orange"
                      : "text-graphite-300 hover:bg-graphite-800/70 hover:text-graphite-50",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-brand-orange" : "text-graphite-500")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UserBox({ name, roles }: { name: string; roles: string }) {
  return (
    <div className="border-t border-graphite-800 px-3 pt-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-sm font-semibold text-brand-orange-dark">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-graphite-100">{name}</p>
          <p className="truncate text-xs text-graphite-500">{roles}</p>
        </div>
      </div>
      <form action="/auth/signout" method="post" className="mt-3">
        <button className="flex items-center gap-1.5 text-xs text-graphite-500 hover:text-signal-red">
          <LogOut className="size-3.5" /> Sign out
        </button>
      </form>
    </div>
  );
}

function Logo() {
  return (
    <Link href="/" className="block px-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/acoform-logo.png" alt="ACOFORM" className="h-7 w-auto" />
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-graphite-500">One · ERP</p>
    </Link>
  );
}

export function AppSidebar({ name, roles }: { name: string; roles: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {/* desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-graphite-800 bg-graphite-900 py-5 md:flex">
        <Logo />
        <div className="px-2"><NavLinks /></div>
        <div className="mt-auto pb-1"><UserBox name={name} roles={roles} /></div>
      </aside>

      {/* mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-graphite-800 bg-graphite-950/95 px-4 py-2.5 backdrop-blur md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/acoform-logo.png" alt="ACOFORM" className="h-6 w-auto" />
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-graphite-300 hover:bg-graphite-900" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto bg-graphite-950 py-5 shadow-xl">
            <div className="flex items-start justify-between pr-3">
              <Logo />
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-graphite-400 hover:bg-graphite-900" aria-label="Close menu"><X className="size-5" /></button>
            </div>
            <div className="px-2"><NavLinks onNavigate={() => setOpen(false)} /></div>
            <div className="mt-auto pb-1"><UserBox name={name} roles={roles} /></div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
