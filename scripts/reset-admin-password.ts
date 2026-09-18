/**
 * Reseta a senha do admin quando não há mais nenhuma sessão ADMIN ativa
 * (o botão "Resetar senha" em /users exige estar logado como ADMIN).
 *
 * Uso: npx tsx scripts/reset-admin-password.ts [email]
 * Sem argumento, usa admin@datapulse.local (o admin do seed).
 */
import { prisma } from "../lib/prisma";
import { hashPassword, generateTemporaryPassword } from "../lib/password";

async function main() {
  const email = process.argv[2] ?? "admin@datapulse.local";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Nenhum usuário com o e-mail "${email}".`);
    process.exit(1);
  }

  const temporaryPassword = generateTemporaryPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      isActive: true,
    },
  });

  console.log(`Senha resetada para ${user.name} <${email}>`);
  console.log(`Senha provisória: ${temporaryPassword}`);
  console.log("Troca obrigatória no próximo login.");
}

main().finally(() => prisma.$disconnect());
