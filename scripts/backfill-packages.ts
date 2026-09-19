/**
 * Roda uma vez, depois da migração dos pacotes de revisão.
 *
 * Uso:
 *   npx tsx scripts/backfill-packages.ts                      # todas as organizações
 *   npx tsx scripts/backfill-packages.ts --organizacao "L2tech"
 *   npx tsx scripts/backfill-packages.ts --dry                # só conta, não grava
 *
 * Toda revisão de documento passa a ficar dentro de um pacote (Tarefa) que fica
 * dentro de um Marco. As revisões antigas não têm pacote: aqui elas são
 * agrupadas por projeto + dia de emissão + disciplina do documento, dentro de
 * um Marco "Legado — documentos existentes" por projeto. Idempotente: só toca
 * revisões sem pacote, e reaproveita marco/pacote do legado que já existam.
 */
import { PrismaClient } from "@prisma/client";
import { groupLegacyRevisionsIntoPackages } from "../lib/server/package-service";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const orgIdx = argv.indexOf("--organizacao");
const ORG_NAME = orgIdx >= 0 ? argv[orgIdx + 1] : "";

async function main() {
  const orgs = await prisma.organization.findMany({
    where: ORG_NAME ? { name: ORG_NAME } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (orgs.length === 0) {
    console.error(ORG_NAME ? `Organização "${ORG_NAME}" não encontrada.` : "Nenhuma organização.");
    process.exit(1);
  }

  for (const org of orgs) {
    if (DRY) {
      const orphans = await prisma.documentRevision.count({
        where: { milestoneId: null, document: { project: { organizationId: org.id } } },
      });
      console.log(`${org.name}: ${orphans} revisão(ões) sem pacote (dry — nada gravado).`);
      continue;
    }
    const r = await groupLegacyRevisionsIntoPackages(prisma, { organizationId: org.id });
    console.log(
      `${org.name}: ${r.revisions} revisão(ões) em ${r.projects} projeto(s) → ${r.packages} pacote(s) novo(s).`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
