import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { AppShell } from "@/components/top-nav";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DataPulse — MVP",
  description:
    "Identificação antecipada da restrição dominante em projetos (TOC).",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="pt-BR" className={figtree.variable}>
      <body className="min-h-screen bg-frame font-sans text-ink antialiased">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
