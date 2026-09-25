import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acoform-logo.png" alt="ACOFORM" className="mx-auto h-10 w-auto" />
          <p className="mt-3 text-sm text-graphite-500">ACOFORM ONE · Aco Form Work Pvt Ltd</p>
        </div>
        <div className="rounded-xl border border-graphite-800 bg-graphite-900/60 p-6">
          <LoginForm next={next ?? "/"} />
        </div>
      </div>
    </main>
  );
}
