/**
 * Apaga uma organização inteira — e, em cascata, TUDO que pertence a ela:
 * usuários, cadastros, projetos, documentos, tarefas, sinais e histórico.
 *
 *   npx tsx scripts/delete-organization.ts "Nome da organização"        # dry run
 *   npx tsx scripts/delete-organization.ts "Nome da organização" --yes  # apaga
 *
 * Sem --yes, só mostra o que seria apagado. As outras organizações nunca são
 * tocadas.
 *
 * Não tem volta: o banco não guarda lixeira. Para um cliente que só saiu de
 * cena, desativar (Organization.isActive) é mais prudente que apagar.
 */
import { prisma } from "../lib/prisma";

async function main() {
  const confirmed = process.argv.includes("--yes");
  const orgName = process.argv.slice(2).find((a) => a !== "--yes");

  if (!orgName) {
    console.error(
      'Uso: npx tsx scripts/delete-organization.ts "Nome da organização" [--yes]',
    );
    const orgs = await prisma.organization.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    if (orgs.length > 0) {
      console.error("\nOrganizações existentes:");
      for (const o of orgs) console.error(`  - ${o.name}`);
    }
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({ where: { name: orgName } });
  if (!org) {
    console.error(`Nenhuma organização chamada "${orgName}".`);
    process.exit(1);
  }

  const where = { where: { organizationId: org.id } };
  const [users, projects, clients, sectors, disciplines, empresas, jobFunctions, codes, accConnections] =
    await Promise.all([
      prisma.user.count(where),
      prisma.project.count(where),
      prisma.client.count(where),
      prisma.sector.count(where),
      prisma.discipline.count(where),
      prisma.empresa.count(where),
      prisma.jobFunction.count(where),
      prisma.analysisCode.count(where),
      prisma.accConnection.count(where),
    ]);
  const documents = await prisma.document.count({
    where: { project: { organizationId: org.id } },
  });

  console.log(`Organização: "${org.name}" (${org.id})`);
  console.log("\nSeria apagado (em cascata):");
  console.log(`  usuários            ${users}`);
  console.log(`  projetos            ${projects} (com documentos, tarefas, sinais e histórico)`);
  console.log(`  documentos          ${documents}`);
  console.log(`  clientes            ${clients}`);
  console.log(`  setores             ${sectors}`);
  console.log(`  disciplinas         ${disciplines}`);
  console.log(`  empresas            ${empresas}`);
  console.log(`  funções             ${jobFunctions}`);
  console.log(`  códigos de análise  ${codes}`);
  console.log(`  conexões ACC        ${accConnections}`);
  console.log("  Outras organizações: não tocadas.");

  if (!confirmed) {
    console.log("\nNada foi apagado (dry run). Rode de novo com --yes para confirmar.");
    return;
  }

  await prisma.organization.delete({ where: { id: org.id } });
  console.log(`\n"${org.name}" apagada por completo.`);
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
