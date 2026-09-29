import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { getCurrentProfile, getCurrentUserRoles } from "@/lib/auth/permissions";
import { titleCase } from "@/lib/format";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const roles = await getCurrentUserRoles();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar name={profile.full_name ?? profile.email ?? "User"} roles={roles.map(titleCase).join(", ") || "No role assigned"} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
