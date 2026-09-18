/**
 * Limpeza de dados de demonstração antes de começar a usar de verdade.
 *
 * Apaga, DENTRO DE UMA ORGANIZAÇÃO: todos os Projetos (em cascata:
 * Tarefas/Marcos, Documentos e revisões, Solicitações, Impedimentos,
 * sinais, membros de projeto), todos os Usuários com papel diferente de
 * ADMIN, e os cadastros de Clientes e Empresas (valores fictícios da
 * demonstração).
 *
 * Mantém: usuários ADMIN, Setores, Disciplinas, Funções, Códigos de análise
 * e Papéis de acesso — são categorias de configuração reaproveitáveis, não
 * dados de teste.
 *
 * Agora que o banco é multi-tenant (várias organizações no mesmo banco), o
 * nome da organização é obrigatório — sem ele, um `deleteMany({})` sem
 * `where` apagaria os dados de TODAS as organizações, não só da que está
 * sendo zerada.
 *
 * Por segurança, sem `--yes` o script só mostra o que seria apagado (dry
 * run) e não toca no banco.
 *
 * Uso:
 *   npx tsx scripts/clean-database.ts "Nome da organização"             (mostra o plano, não apaga)
 *   npx tsx scripts/clean-database.ts "Nome da organização" --yes       (apaga de fato)
 */
import { prisma } from "../lib/prisma";

async function main() {
  const confirmed = process.argv.includes("--yes");
  const orgName = process.argv.slice(2).find((a) => a !== "--yes");

  if (!orgName) {
    const orgs = await prisma.organization.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    console.error('Informe o nome da organização: npx tsx scripts/clean-database.ts "Nome da organização" [--yes]');
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

  const [
    projectCount,
    nonAdminUsers,
    adminUsers,
    clientCount,
    empresaCount,
  ] = await Promise.all([
    prisma.project.count({ where: { organizationId: org.id } }),
    prisma.user.findMany({
      where: { organizationId: org.id, role: { not: "ADMIN" } },
      select: { name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: org.id, role: "ADMIN" },
      select: { name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.count({ where: { organizationId: org.id } }),
    prisma.empresa.count({ where: { organizationId: org.id } }),
  ]);

  console.log(`Organização: "${org.name}" (${org.id})`);
  console.log("\nPlano de limpeza:");
  console.log(`  Projetos a apagar (com tudo em cascata): ${projectCount}`);
  console.log(`  Clientes a apagar: ${clientCount}`);
  console.log(`  Empresas a apagar: ${empresaCount}`);
  console.log(`  Usuários a apagar (${nonAdminUsers.length}):`);
  for (const u of nonAdminUsers) console.log(`    - ${u.name} <${u.email}> (${u.role})`);
  console.log(`  Usuários ADMIN mantidos (${adminUsers.length}):`);
  for (const u of adminUsers) console.log(`    - ${u.name} <${u.email}>`);
  console.log(
    "  Mantidos sem alteração: Setores, Disciplinas, Funções, Códigos de análise, Papéis de acesso.",
  );
  console.log("  Outras organizações: não tocadas.");

  if (!confirmed) {
    console.log("\nNada foi apagado (dry run). Rode de novo com --yes para confirmar.");
    return;
  }

  console.log("\nApagando...");

  const deletedProjects = await prisma.project.deleteMany({ where: { organizationId: org.id } });
  console.log(`  Projetos apagados: ${deletedProjects.count}`);

  const deletedUsers = await prisma.user.deleteMany({
    where: { organizationId: org.id, role: { not: "ADMIN" } },
  });
  console.log(`  Usuários apagados: ${deletedUsers.count}`);

  const deletedClients = await prisma.client.deleteMany({ where: { organizationId: org.id } });
  console.log(`  Clientes apagados: ${deletedClients.count}`);

  const deletedEmpresas = await prisma.empresa.deleteMany({ where: { organizationId: org.id } });
  console.log(`  Empresas apagadas: ${deletedEmpresas.count}`);

  console.log(`\n"${org.name}" limpa. Restaram só os cadastros de configuração e o(s) ADMIN. Outras organizações não foram tocadas.`);
}

main().finally(() => prisma.$disconnect());
