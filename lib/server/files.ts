import { prisma } from "@/lib/prisma";

/**
 * Bytes usados no store inteiro (todas as organizações). É este número que a
 * Vercel limita (1 GB no plano gratuito), então é ele que a cota protege.
 */
export async function storeUsedBytes(): Promise<number> {
  const agg = await prisma.projectFile.aggregate({ _sum: { sizeBytes: true } });
  return agg._sum.sizeBytes ?? 0;
}

/** Bytes já usados pela organização em arquivos de projeto (exibição). */
export async function orgUsedBytes(organizationId: string): Promise<number> {
  const agg = await prisma.projectFile.aggregate({
    where: { organizationId },
    _sum: { sizeBytes: true },
  });
  return agg._sum.sizeBytes ?? 0;
}
