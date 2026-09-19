import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/top-nav";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DataPulse — Inteligência para projetos em movimento",
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
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen bg-frame font-sans text-ink antialiased">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
