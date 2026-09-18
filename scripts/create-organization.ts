/**
 * Cria uma nova organização (cliente) e o primeiro usuário ADMIN dela.
 *
 * Decisão do produto: não há autocadastro público por enquanto — toda
 * organização nova entra por aqui, rodado por quem administra a instalação.
 *
 * Uso:
 *   npx tsx scripts/create-organization.ts "Nome da Empresa" "Nome do Admin" admin@empresa.com
 *
 * Os três argumentos são obrigatórios. O e-mail precisa ser único
 * globalmente (é a chave de login) — se já existir, o script recusa.
 */
import { prisma } from "../lib/prisma";
import { hashPassword, generateTemporaryPassword } from "../lib/password";

async function main() {
  const [orgName, adminName, adminEmailRaw] = process.argv.slice(2);

  if (!orgName || !adminName || !adminEmailRaw) {
    console.error(
      'Uso: npx tsx scripts/create-organization.ts "Nome da Empresa" "Nome do Admin" admin@empresa.com',
    );
    process.exit(1);
  }

  const adminEmail = adminEmailRaw.trim().toLowerCase();
  if (!adminEmail.includes("@")) {
    console.error(`E-mail inválido: "${adminEmailRaw}"`);
    process.exit(1);
  }

  const existingOrg = await prisma.organization.findUnique({ where: { name: orgName } });
  if (existingOrg) {
    console.error(`Já existe uma organização chamada "${orgName}" (${existingOrg.id}).`);
    console.error("Se a intenção é adicionar outro admin a ela, use a tela Usuários já logado nessa organização.");
    process.exit(1);
  }

  // E-mail é único globalmente (login) — não por organização.
  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingUser) {
    console.error(`Já existe um usuário com o e-mail "${adminEmail}" (em outra organização). Escolha outro e-mail.`);
    process.exit(1);
  }

  const temporaryPassword = generateTemporaryPassword();

  const org = await prisma.organization.create({
    data: {
      name: orgName,
      users: {
        create: {
          name: adminName,
          email: adminEmail,
          role: "ADMIN",
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        },
      },
    },
    include: { users: true },
  });

  const admin = org.users[0];

  console.log(`Organização criada: "${org.name}" (${org.id})`);
  console.log(`Admin: ${admin.name} <${admin.email}>`);
  console.log(`Senha provisória: ${temporaryPassword}`);
  console.log("Troca obrigatória no próximo login. Repasse a senha por um canal seguro (não fica gravada em nenhum outro lugar).");
  console.log("");
  console.log("Papéis de acesso (rótulo/descrição) e demais cadastros nascem vazios — o admin cria pelo próprio painel em Cadastros.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
