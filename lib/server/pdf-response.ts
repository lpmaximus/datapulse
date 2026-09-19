import { NextResponse } from "next/server";
import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";

/** Nome de arquivo seguro para o cabeçalho: sem acento, espaço nem símbolo. */
export function safeFileName(base: string): string {
  const clean = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return clean || "relatorio";
}

/**
 * Renderiza o PDF e responde. Sem cache: o relatório é uma fotografia do
 * momento e depende de quem pede (visibilidade por papel).
 * `?download=1` força o download; sem ele o navegador abre no leitor de PDF.
 */
export async function pdfResponse(
  element: ReactElement<DocumentProps>,
  fileBase: string,
  download: boolean,
): Promise<NextResponse> {
  const buffer = await renderToBuffer(element);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${safeFileName(fileBase)}-${stamp}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
