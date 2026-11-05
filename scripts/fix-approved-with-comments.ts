/**
 * Corrige revisões já analisadas com "aprovado com comentários" (efeito
 * APPROVES_WITH_COMMENTS) que ficaram como Aprovada. A regra mudou: esse
 * parecer exige nova revisão, então a revisão passa a Comentada e o pacote
 * dela é recalculado (deixa de contar como concluído).
 *
 * Uso:
 *   npx tsx scripts/fix-approved-with-comments.ts --dry   # só lista
 *   npx tsx scripts/fix-approved-with-comments.ts         # grava
 *
 * Idempotente: só toca revisões ainda em APPROVED. Revisões que já têm
 * sucessora ficam Comentada também (o desfecho é o mesmo do comentado).
 */
import { PrismaClient } from "@prisma/client";
import { recomputePackages } from "../lib/server/package-service";
import { recalculateProjectDRI } from "../lib/server/dri-service";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

async function main() {
  const revisions = await prisma.documentRevision.findMany({
    where: { status: "APPROVED", analysisCode: { effect: "APPROVES_WITH_COMMENTS" } },
    select: {
      id: true,
      name: true,
      milestoneId: true,
      analysisCode: { select: { tag: true } },
      document: { select: { number: true, name: true, projectId: true } },
    },
  });

  console.log(`${revisions.length} revisão(ões) aprovada(s) com comentários como Aprovada.`);
  for (const r of revisions) {
    console.log(`  ${r.document.number ?? ""} ${r.document.name} — ${r.name} (${r.analysisCode?.tag})`);
  }
  if (DRY || revisions.length === 0) return;

  await prisma.documentRevision.updateMany({
    where: { id: { in: revisions.map((r) => r.id) } },
    data: { status: "COMMENTED" },
  });
  await recomputePackages(revisions.map((r) => r.milestoneId), prisma);
  for (const projectId of new Set(revisions.map((r) => r.document.projectId))) {
    await recalculateProjectDRI(projectId);
  }
  console.log("Corrigido. Pacotes e DRI recalculados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
