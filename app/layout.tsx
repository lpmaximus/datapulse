import type { Metadata } from "next";
import { TopNav } from "@/components/top-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataPulse — MVP",
  description:
    "Identificação antecipada da restrição dominante em projetos (TOC).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <TopNav />
        <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
        <footer className="mx-auto max-w-[1400px] px-6 pb-10 text-xs text-ink-faint">
          DRI é indicador antecipado, não previsão. Score com confiança baixa
          significa dado insuficiente — não ausência de risco.
        </footer>
      </body>
    </html>
  );
}
