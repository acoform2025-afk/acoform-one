import { redirect } from "next/navigation";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { getCurrentProfile, getCurrentUserRoles } from "@/lib/auth/permissions";
import { titleCase } from "@/lib/format";

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/quotations", label: "Quotations" },
  { href: "/projects", label: "Projects" },
  { href: "/panel-catalog", label: "Panel catalog & rates" },
  { href: "/settings", label: "Settings" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const roles = await getCurrentUserRoles();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-graphite-800 bg-graphite-900/40 p-4 md:flex">
        <div className="mb-6 px-3">
          <p className="text-lg font-bold tracking-tight">
            <span className="text-signal-amber">ACOFORM</span> <span className="text-graphite-300">ONE</span>
          </p>
        </div>
        <SidebarNav items={NAV} />
        <div className="mt-auto border-t border-graphite-800 px-3 pt-4">
          <p className="truncate text-sm text-graphite-200">{profile.full_name}</p>
          <p className="truncate text-xs text-graphite-500">{roles.map(titleCase).join(", ") || "No role assigned"}</p>
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="text-xs text-graphite-500 hover:text-signal-amber">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-graphite-800 px-4 py-3 md:hidden">
          <p className="font-bold"><span className="text-signal-amber">ACOFORM</span> ONE</p>
          <details className="relative">
            <summary className="cursor-pointer list-none text-sm text-graphite-400">Menu</summary>
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-graphite-800 bg-graphite-900 p-2">
              <SidebarNav items={NAV} />
            </div>
          </details>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
