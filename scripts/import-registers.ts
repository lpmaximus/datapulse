/**
 * Reimporta os cadastros exportados por `scripts/export-registers.ts` dentro
 * de uma organização, no banco JÁ migrado para multi-tenant.
 *
 *   npx tsx scripts/import-registers.ts "Nome da organização" [arquivo.json]
 *
 * Padrão do arquivo: cadastros-export.json.
 *
 * É idempotente: rodar duas vezes não duplica nada (tudo por upsert nas
 * chaves compostas por organização).
 *
 * Usuários: a senha antiga é restaurada como estava (o hash é copiado), então
 * cada um volta a entrar com a mesma senha de antes. E-mail é único no sistema
 * inteiro — se já pertencer a OUTRA organização, a pessoa é pulada com aviso.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import type { UserRole, AnalysisEffect } from "@prisma/client";

interface Export {
  clients: Array<{ name: string; code: string | null; contactName: string | null; email: string | null; phone: string | null; isActive: boolean }>;
  sectors: Array<{ name: string; isActive: boolean }>;
  disciplines: Array<{ tag: string; name: string; isActive: boolean }>;
  empresas: Array<{ name: string; coordinatorName: string | null; email: string | null; phone: string | null; isActive: boolean }>;
  jobFunctions: Array<{ name: string; isActive: boolean }>;
  analysisCodes: Array<{ tag: string; name: string; effect: string; description: string | null; sortOrder: number; isActive: boolean }>;
  roleProfiles: Array<{ role: string; label: string; description: string | null }>;
  users: Array<{
    name: string; email: string; passwordHash: string; mustChangePassword: boolean;
    role: string; isActive: boolean; functionName: string | null; companyName: string | null;
  }>;
}

async function main() {
  const orgName = process.argv[2];
  const file = process.argv[3] ?? "cadastros-export.json";

  if (!orgName) {
    console.error('Uso: npx tsx scripts/import-registers.ts "Nome da organização" [arquivo.json]');
    const orgs = await prisma.organization.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    if (orgs.length > 0) {
      console.error("\nOrganizações existentes:");
      for (const o of orgs) console.error(`  - ${o.name}`);
    }
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({ where: { name: orgName } });
  if (!org) {
    console.error(`Nenhuma organização chamada "${orgName}". Crie antes com scripts/create-organization.ts.`);
    process.exit(1);
  }

  const data: Export = JSON.parse(readFileSync(file, "utf-8"));
  const oid = org.id;

  /* --- função e empresa primeiro: os usuários apontam para elas --- */

  const functionId = new Map<string, string>();
  for (const f of data.jobFunctions) {
    const row = await prisma.jobFunction.upsert({
      where: { organizationId_name: { organizationId: oid, name: f.name } },
      update: { isActive: f.isActive },
      create: { organizationId: oid, name: f.name, isActive: f.isActive },
      select: { id: true },
    });
    functionId.set(f.name, row.id);
  }

  const companyId = new Map<string, string>();
  for (const e of data.empresas) {
    const row = await prisma.empresa.upsert({
      where: { organizationId_name: { organizationId: oid, name: e.name } },
      update: { coordinatorName: e.coordinatorName, email: e.email, phone: e.phone, isActive: e.isActive },
      create: {
        organizationId: oid, name: e.name, coordinatorName: e.coordinatorName,
        email: e.email, phone: e.phone, isActive: e.isActive,
      },
      select: { id: true },
    });
    companyId.set(e.name, row.id);
  }

  /* --- demais cadastros --- */

  for (const c of data.clients) {
    await prisma.client.upsert({
      where: { organizationId_name: { organizationId: oid, name: c.name } },
      update: { code: c.code, contactName: c.contactName, email: c.email, phone: c.phone, isActive: c.isActive },
      create: {
        organizationId: oid, name: c.name, code: c.code, contactName: c.contactName,
        email: c.email, phone: c.phone, isActive: c.isActive,
      },
    });
  }

  for (const s of data.sectors) {
    await prisma.sector.upsert({
      where: { organizationId_name: { organizationId: oid, name: s.name } },
      update: { isActive: s.isActive },
      create: { organizationId: oid, name: s.name, isActive: s.isActive },
    });
  }

  for (const d of data.disciplines) {
    await prisma.discipline.upsert({
      where: { organizationId_tag: { organizationId: oid, tag: d.tag } },
      update: { name: d.name, isActive: d.isActive },
      create: { organizationId: oid, tag: d.tag, name: d.name, isActive: d.isActive },
    });
  }

  for (const a of data.analysisCodes) {
    await prisma.analysisCode.upsert({
      where: { organizationId_tag: { organizationId: oid, tag: a.tag } },
      update: { name: a.name, description: a.description, sortOrder: a.sortOrder, isActive: a.isActive },
      create: {
        organizationId: oid, tag: a.tag, name: a.name, effect: a.effect as AnalysisEffect,
        description: a.description, sortOrder: a.sortOrder, isActive: a.isActive,
      },
    });
  }

  for (const r of data.roleProfiles) {
    await prisma.roleProfile.upsert({
      where: { organizationId_role: { organizationId: oid, role: r.role as UserRole } },
      update: { label: r.label, description: r.description },
      create: { organizationId: oid, role: r.role as UserRole, label: r.label, description: r.description },
    });
  }

  /* --- usuários --- */

  let restored = 0;
  let skipped = 0;
  for (const u of data.users) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
      select: { id: true, organizationId: true },
    });
    if (existing && existing.organizationId !== oid) {
      console.log(`  aviso: ${u.email} já pertence a outra organização — pulando.`);
      skipped += 1;
      continue;
    }

    const fields = {
      name: u.name,
      passwordHash: u.passwordHash,
      mustChangePassword: u.mustChangePassword,
      role: u.role as UserRole,
      isActive: u.isActive,
      functionId: u.functionName ? (functionId.get(u.functionName) ?? null) : null,
      companyId: u.companyName ? (companyId.get(u.companyName) ?? null) : null,
    };

    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: fields });
    } else {
      await prisma.user.create({ data: { organizationId: oid, email: u.email, ...fields } });
    }
    restored += 1;
  }

  console.log(`Reimportado em "${org.name}":`);
  console.log(`  clientes           ${data.clients.length}`);
  console.log(`  setores            ${data.sectors.length}`);
  console.log(`  disciplinas        ${data.disciplines.length}`);
  console.log(`  empresas           ${data.empresas.length}`);
  console.log(`  funções            ${data.jobFunctions.length}`);
  console.log(`  códigos de análise ${data.analysisCodes.length}`);
  console.log(`  papéis de acesso   ${data.roleProfiles.length}`);
  console.log(`  usuários           ${restored}${skipped ? `, ${skipped} pulados` : ""} (senhas antigas restauradas)`);
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
