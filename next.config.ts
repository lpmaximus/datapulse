import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Relatórios em PDF: o renderer usa módulos nativos do Node, fora do bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // O pdfkit (dentro do renderer) carrega as fontes padrão (Helvetica.cjs...) com
  // require dinâmico, que o rastreamento da Vercel não enxerga: sem isto o
  // relatório dá 500 em produção ("Cannot find module .../standard-fonts/Helvetica.cjs").
  outputFileTracingIncludes: {
    "/api/reports/**/*": [
      "./node_modules/pdfkit/js/**/*",
      "./node_modules/fontkit/**/*",
      "./node_modules/unicode-properties/**/*",
      "./node_modules/unicode-trie/**/*",
      "./node_modules/restructure/**/*",
      "./node_modules/linebreak/**/*",
      "./node_modules/png-js/**/*",
      "./node_modules/jay-peg/**/*",
      "./node_modules/brotli/**/*",
    ],
  },
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
