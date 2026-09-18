/**
 * Fase A → Fase B da migração multi-tenant: cria (ou reaproveita) a
 * Organização padrão e preenche organizationId em todas as linhas
 * existentes que ainda estão sem ela.
 *
 * Roda DEPOIS de aplicar a migração que adiciona organizationId como
 * opcional, e ANTES de aplicar a migração que o torna obrigatório
 * (essa segunda migração falha se sobrar alguma linha sem organizationId).
 *
 * Uso:
 *   npx tsx scripts/backfill-organization.ts ["Nome da organização"]
 *
 * Sem argumento, usa "Organização Principal".
 *
 * Por que SQL cru e não `updateMany({ where: { organizationId: null } })`:
 * o schema.prisma já está na forma final, com organizationId obrigatório.
 * Para o Prisma Client, portanto, `organizationId: null` nem existe como
 * filtro — mas no banco, no meio da migração, a coluna ainda aceita nulo.
 * SQL cru é o que fala com o banco no estado em que ele está, não no estado
 * em que o schema diz que ele deveria estar.
 */
import { prisma } from "../lib/prisma";

/** Os 10 modelos que têm organizationId próprio (as raízes do tenant). */
const TABLES: Array<[table: string, label: string]> = [
  ["User", "Usuários"],
  ["Client", "Clientes"],
  ["Sector", "Setores"],
  ["Discipline", "Disciplinas"],
  ["Empresa", "Empresas"],
  ["JobFunction", "Funções"],
  ["AnalysisCode", "Códigos de análise"],
  ["RoleProfile", "Papéis de acesso"],
  ["Project", "Projetos"],
  ["AccConnection", "Conexões ACC"],
];

async function main() {
  const name = process.argv[2] ?? "Organização Principal";

  const org = await prisma.organization.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  console.log(`Organização: "${org.name}" (${org.id})`);

  console.log("\nLinhas atualizadas:");
  for (const [table, label] of TABLES) {
    const count = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "organizationId" = $1 WHERE "organizationId" IS NULL`,
      org.id,
    );
    console.log(`  ${label}: ${count}`);
  }

  // Confere que não sobrou nada sem organizationId — a próxima migração
  // (organizationId obrigatório) falha se sobrar.
  let remaining = 0;
  for (const [table, label] of TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM "${table}" WHERE "organizationId" IS NULL`,
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) console.error(`  ainda sem organização — ${label}: ${n}`);
    remaining += n;
  }

  if (remaining > 0) {
    console.error(
      `\nAinda sobraram ${remaining} linha(s) sem organizationId — rode de novo antes da próxima migração.`,
    );
    process.exit(1);
  }

  console.log("\nTudo preenchido. Pode aplicar a migração que torna organizationId obrigatório.");
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (/column .*organizationId.* does not exist/i.test(message)) {
      console.error(
        '\nA coluna organizationId ainda não existe no banco. Aplique primeiro a migração da Fase A (organizationId opcional) e rode este script depois.',
      );
    } else {
      console.error("\nFalhou:", message);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
