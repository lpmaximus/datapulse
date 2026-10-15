/**
 * Dá a um usuário existente acesso a OUTRO workspace (além do de origem), com
 * papel próprio nele. É o que faz a tela de seleção aparecer no login dele.
 *
 * Uso:
 *   npx tsx scripts/add-workspace-member.ts "IDG Engenharia" pessoa@email.com MANAGER
 * Papéis: ADMIN | MANAGER | SPECIALIST | EXECUTIVE
 */
import { prisma } from "../lib/prisma";

const ROLES = ["ADMIN", "MANAGER", "SPECIALIST", "EXECUTIVE"] as const;

async function main() {
  const [orgName, emailRaw, roleRaw = "SPECIALIST"] = process.argv.slice(2);
  const role = roleRaw.toUpperCase() as (typeof ROLES)[number];
  if (!orgName || !emailRaw || !ROLES.includes(role)) {
    console.error('Uso: npx tsx scripts/add-workspace-member.ts "Workspace" email@exemplo.com [ADMIN|MANAGER|SPECIALIST|EXECUTIVE]');
    process.exit(1);
  }
  const org = await prisma.organization.findUnique({ where: { name: orgName } });
  if (!org) {
    console.error(`Workspace "${orgName}" não encontrado.`);
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
  if (!user) {
    console.error(`Nenhum usuário com o e-mail "${emailRaw}".`);
    process.exit(1);
  }
  if (user.organizationId === org.id) {
    console.error("Esse workspace já é a organização de origem do usuário.");
    process.exit(1);
  }
  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: { userId: user.id, organizationId: org.id, role },
    update: { role },
  });
  console.log(`${user.name} agora acessa "${org.name}" como ${role}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
