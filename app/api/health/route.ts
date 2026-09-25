export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true, app: "acoform-one", time: new Date().toISOString() });
}
