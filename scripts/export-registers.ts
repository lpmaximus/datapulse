/**
 * Exporta os cadastros de referência (e os usuários) do banco ATUAL para um
 * JSON, antes da migração multi-tenant.
 *
 *   npx tsx scripts/export-registers.ts [arquivo.json]
 *
 * Padrão: cadastros-export.json na raiz do projeto.
 *
 * Por que SQL cru: este script roda ANTES da migração, num banco que ainda
 * não tem a coluna organizationId. O Prisma Client, porém, já foi gerado a
 * partir do schema novo e tentaria selecionar essa coluna em todo SELECT —
 * quebrando na hora. SQL cru pede exatamente as colunas que existem hoje.
 *
 * O que NÃO vem junto: projetos, documentos, tarefas, sinais e histórico.
 * Só os cadastros e as contas de usuário (com a senha preservada — o hash é
 * copiado como está, então todo mundo continua entrando com a mesma senha).
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

type Row = Record<string, unknown>;

async function q(sql: string): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(sql);
}

async function main() {
  const out = process.argv[2] ?? "cadastros-export.json";

  const [clients, sectors, disciplines, empresas, jobFunctions, analysisCodes, roleProfiles, users] =
    await Promise.all([
      q(`SELECT name, code, "contactName", email, phone, "isActive" FROM "Client" ORDER BY name`),
      q(`SELECT name, "isActive" FROM "Sector" ORDER BY name`),
      q(`SELECT tag, name, "isActive" FROM "Discipline" ORDER BY tag`),
      q(`SELECT name, "coordinatorName", email, phone, "isActive" FROM "Empresa" ORDER BY name`),
      q(`SELECT name, "isActive" FROM "JobFunction" ORDER BY name`),
      q(
        `SELECT tag, name, effect::text AS effect, description, "sortOrder", "isActive"
           FROM "AnalysisCode" ORDER BY "sortOrder", tag`,
      ),
      q(`SELECT role::text AS role, label, description FROM "RoleProfile" ORDER BY role`),
      // Função e empresa vêm pelo NOME, não pelo id: os ids mudam no banco novo.
      q(
        `SELECT u.name, u.email, u."passwordHash", u."mustChangePassword",
                u.role::text AS role, u."isActive",
                f.name AS "functionName", e.name AS "companyName"
           FROM "User" u
           LEFT JOIN "JobFunction" f ON f.id = u."functionId"
           LEFT JOIN "Empresa" e ON e.id = u."companyId"
          ORDER BY u.name`,
      ),
    ]);

  const data = {
    exportedAt: new Date().toISOString(),
    clients,
    sectors,
    disciplines,
    empresas,
    jobFunctions,
    analysisCodes,
    roleProfiles,
    users,
  };

  writeFileSync(out, JSON.stringify(data, null, 2), "utf-8");

  console.log(`Exportado para ${out}:`);
  console.log(`  clientes           ${clients.length}`);
  console.log(`  setores            ${sectors.length}`);
  console.log(`  disciplinas        ${disciplines.length}`);
  console.log(`  empresas           ${empresas.length}`);
  console.log(`  funções            ${jobFunctions.length}`);
  console.log(`  códigos de análise ${analysisCodes.length}`);
  console.log(`  papéis de acesso   ${roleProfiles.length}`);
  console.log(`  usuários           ${users.length} (senhas preservadas)`);
  console.log("\nNÃO exportado: projetos, documentos, tarefas, sinais e histórico.");
  console.log("Guarde este arquivo fora do projeto antes de resetar o banco — ele tem hashes de senha.");
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
