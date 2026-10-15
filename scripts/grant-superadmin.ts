/**
 * Concede (ou revoga) o papel de superadmin da plataforma a um usuário existente.
 * Superadmin vê todos os workspaces, entra em qualquer um como ADMIN e cadastra novos.
 *
 * Uso:
 *   npx tsx scripts/grant-superadmin.ts seu@email.com          # concede
 *   npx tsx scripts/grant-superadmin.ts seu@email.com --revoke # revoga
 */
import { prisma } from "../lib/prisma";

async function main() {
  const [emailRaw, flag] = process.argv.slice(2);
  if (!emailRaw) {
    console.error("Uso: npx tsx scripts/grant-superadmin.ts email@exemplo.com [--revoke]");
    process.exit(1);
  }
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) {
    console.error(`Nenhum usuário com o e-mail "${email}".`);
    process.exit(1);
  }
  const value = flag !== "--revoke";
  await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: value } });
  console.log(`${user.name} <${email}>: superadmin = ${value}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
