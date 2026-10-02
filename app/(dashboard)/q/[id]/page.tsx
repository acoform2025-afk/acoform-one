import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, FileText, Package, QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Panel" };
export const dynamic = "force-dynamic";

/** Opened by scanning a panel's QR label: what the panel is, where it goes, and the drawings for it. */
export default async function PanelScanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ n?: string; c?: string; s?: string; b?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const supabase = await createClient();
  const { data: plan } = await supabase.from("floor_plans").select("id, name, leads ( lead_code, project_name, customer_name, company_name )").eq("id", id).maybeSingle();
  if (!plan) notFound();
  const lead = Array.isArray(plan.leads) ? plan.leads[0] : plan.leads;
  const [w, h] = String(q.s ?? "").split("x");
  const no = q.n ?? "", code = q.c ?? "";
  const serial = no.includes("#") ? `#${no.split("#")[1]}` : no;
  const P = `/floor-plans/${id}`;
  const deck = /^M\d+-\d/i.test(no), wall = !deck && !no.includes("#") && /-\d+[TF]?$/.test(no);
  const links = [
    { label: deck ? "Deck installation drawing" : "Assembly drawings", href: deck ? `${P}/panels/installation` : `${P}/panels/assembly`, icon: FileText },
    { label: "Wall / column / beam modulation", href: `${P}/panels/modulation`, icon: FileText },
    { label: "Packing list (bundles)", href: `${P}/panels/packing`, icon: Package },
    { label: "3D model", href: `${P}/panels/3d`, icon: Box },
  ];
  return (
    <div className="fade-in mx-auto max-w-md">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-graphite-500"><QrCode className="size-3.5" />Panel label</p>
      <div className="mt-2 rounded-xl border border-graphite-800 bg-graphite-900 p-4">
        <p className="font-mono text-3xl font-semibold text-graphite-50">{code || "—"}</p>
        {w && h ? <p className="mt-1 text-lg text-graphite-200">{w} × {h} mm</p> : null}
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt className="text-graphite-500">Panel no.</dt><dd className="font-mono text-graphite-100">{serial || "—"}</dd>
          <dt className="text-graphite-500">Bundle / room</dt><dd className="text-graphite-100">{q.b || "—"}</dd>
          <dt className="text-graphite-500">Goes on</dt><dd className="text-graphite-100">{deck ? `Deck — zone ${no.split("-")[0]}` : wall && no.includes("-") ? `Wall face ${no.replace(/-\d+[TF]?$/, "")}` : "See drawings"}</dd>
          <dt className="text-graphite-500">Project</dt><dd className="text-graphite-100">{lead?.project_name ?? "—"}</dd>
          <dt className="text-graphite-500">Client</dt><dd className="text-graphite-100">{lead?.company_name ?? lead?.customer_name ?? "—"}</dd>
          <dt className="text-graphite-500">Floor plan</dt><dd className="text-graphite-100"><Link href={`${P}/panels`} className="underline hover:text-brand-orange">{plan.name}</Link></dd>
        </dl>
      </div>
      <div className="mt-3 grid gap-2">
        {links.map((l) => (
          <a key={l.label} href={l.href} target={l.href.includes("/3d") ? undefined : "_blank"} rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-graphite-800 bg-graphite-900 px-3 py-3 text-sm text-graphite-100 hover:border-brand-orange">
            <l.icon className="size-4 text-brand-orange" />{l.label}
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs text-graphite-500">Panel numbers match the drawings: wall face – panel (F12-03), deck zone – panel (M4-07); T = top piece, F = filler; #001 = running number of a column / beam / corner / special piece.</p>
    </div>
  );
}
