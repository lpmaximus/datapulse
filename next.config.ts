import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Relatórios em PDF: o renderer usa módulos nativos do Node, fora do bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
