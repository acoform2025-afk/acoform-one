export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true, app: "acoform-one", build: process.env.BUILD_STAMP ?? "", time: new Date().toISOString() });
}
