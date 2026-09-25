import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { date, titleCase } from "@/lib/format";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_code, customer_name, site_address, status, start_date, target_completion")
    .order("created_at", { ascending: false });

  return (
    <div className="fade-in max-w-5xl">
      <h1 className="text-2xl font-semibold text-graphite-50">Projects</h1>
      <p className="mt-1 text-sm text-graphite-400">Projects are created from an approved quotation (open the quotation → Convert to project).</p>
      <div className="mt-6 overflow-hidden rounded-lg border border-graphite-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite-900 text-xs uppercase tracking-wide text-graphite-500">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Site</th><th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Target</th><th />
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {(projects ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-graphite-600">No projects yet.</td></tr>}
            {(projects ?? []).map((p) => (
              <tr key={p.id} className="bg-graphite-950 hover:bg-graphite-900/40">
                <td className="px-4 py-3 font-mono text-xs text-aluminium-300">{p.project_code}</td>
                <td className="px-4 py-3 text-graphite-100">{p.customer_name}</td>
                <td className="px-4 py-3 text-graphite-400">{p.site_address ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-graphite-300">{titleCase(p.status)}</td>
                <td className="px-4 py-3 text-xs text-graphite-400">{date(p.target_completion)}</td>
                <td className="px-4 py-3 text-right"><Link href={`/projects/${p.id}`} className="text-xs text-aluminium-300 hover:underline">Open →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
