import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ACOFORM ONE", template: "%s · ACOFORM ONE" },
  description: "ERP, design automation and MES for Aco Form Work Pvt Ltd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen bg-graphite-950 font-sans text-graphite-100 antialiased">{children}</body>
    </html>
  );
}
