/**
 * Carga do controle documental que a equipe mantém em Excel
 * ("CONTROLE MASTER"): cadastros, projetos, documentos, revisões e histórico.
 *
 *   npm run import:master -- "examples/CONTROLE MASTER MRS.xlsx" --organizacao "Nome da organização"
 *
 * Opções:
 *   --organizacao "N"  organização (empresa) dona da carga — obrigatório
 *   --dry              só analisa e imprime o resumo, não grava nada
 *   --manter           não apaga os documentos já existentes antes de carregar
 *   --todos-projetos   cadastra também os projetos do ANEXO sem documento
 *   --cliente "NOME"   nome do cliente dono dos projetos (padrão: MRS)
 *   --dominio "x.y"    domínio dos e-mails gerados (padrão: mrs.local)
 *   --senha "..."      senha inicial das contas criadas (padrão: aleatória)
 *
 * A interpretação da planilha mora em `lib/parse-master.ts` (módulo puro e
 * testado). Aqui fica só a gravação: quem já existe é reaproveitado, e rodar
 * duas vezes não duplica nada.
 *
 * Tudo que esta carga cria — cliente, disciplinas, códigos de análise,
 * empresas, usuários e projetos — é gravado dentro da organização indicada
 * em `--organizacao`. É isso que garante que a carga de uma empresa nunca
 * apareça para outra.
 */

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword, generateTemporaryPassword } from "../lib/password";
import { daysBetween, type DocumentAction, type DocumentStatus } from "../lib/documents";
import {
  parseMaster,
  normalizeName,
  type MasterPlan,
  type MasterRevision,
} from "../lib/parse-master";

const prisma = new PrismaClient();

/* ------------------------------ argumentos ------------------------------- */

const argv = process.argv.slice(2);

function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}

function option(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const file =
  argv.find((a) => !a.startsWith("--") && /\.xlsx?$/i.test(a)) ??
  "examples/CONTROLE MASTER MRS.xlsx";

const DRY = flag("dry");
const KEEP = flag("manter");
const ALL_PROJECTS = flag("todos-projetos");
const ORG_NAME = option("organizacao", "");
const CLIENT_NAME = option("cliente", "MRS");
const EMAIL_DOMAIN = option("dominio", "mrs.local");

/* ------------------------------- helpers -------------------------------- */

/** Parecer → ação registrada no histórico. */
const ACTION_BY_TAG: Record<string, DocumentAction> = {
  APR: "APPROVED",
  REJ: "REJECTED",
  COM: "COMMENTED",
  CLD: "CANCELLED",
};

function sheetGrid(wb: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`A planilha não tem a aba "${name}".`);

  // Sem forçar a origem em A1, o SheetJS devolve as colunas a partir da
  // primeira preenchida — e nesta planilha a coluna A é vazia, o que jogaria
  // todos os índices uma casa para a esquerda.
  const ref = sheet["!ref"];
  const range = ref ? XLSX.utils.decode_range(ref) : undefined;
  if (range) {
    range.s.c = 0;
    range.s.r = 0;
  }

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
    ...(range ? { range: XLSX.utils.encode_range(range) } : {}),
  });
}

function log(...parts: unknown[]): void {
  console.log(...parts);
}

/**
 * Resolve a organização dona da carga. Sem ela não há como gravar nada:
 * cliente, projetos e usuários nascem todos dentro de uma organização.
 */
async function resolveOrganization(): Promise<{ id: string; name: string }> {
  if (!ORG_NAME) {
    console.error(
      'Informe a organização: --organizacao "Nome da organização" (use scripts/create-organization.ts para criar uma nova).',
    );
    const orgs = await prisma.organization.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    });
    if (orgs.length > 0) {
      console.error("\nOrganizações existentes:");
      for (const o of orgs) console.error(`  - ${o.name}`);
    }
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({ where: { name: ORG_NAME } });
  if (!org) {
    console.error(`Nenhuma organização chamada "${ORG_NAME}".`);
    process.exit(1);
  }
  return org;
}

/* -------------------------------- carga --------------------------------- */

async function main(): Promise<void> {
  const org = await resolveOrganization();

  const wb = XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });
  const plan = parseMaster(
    sheetGrid(wb, "BANCO DADOS"),
    sheetGrid(wb, "ANEXO"),
    EMAIL_DOMAIN,
  );

  report(plan, org);
  if (DRY) {
    log("\n--dry: nada foi gravado.");
    return;
  }

  if (!KEEP) {
    // Document não tem organizationId próprio — herda via projeto. Apaga só
    // os documentos desta organização; as demais não são tocadas.
    const removed = await prisma.document.deleteMany({
      where: { project: { organizationId: org.id } },
    });
    log(`\nDocumentos anteriores apagados: ${removed.count} (revisões e histórico junto).`);
  }

  /* --- cadastros de referência --- */

  const client = await prisma.client.upsert({
    where: { organizationId_name: { organizationId: org.id, name: CLIENT_NAME } },
    update: {},
    create: { organizationId: org.id, name: CLIENT_NAME },
    select: { id: true },
  });

  const disciplineId = new Map<string, string>();
  for (const d of plan.disciplines) {
    const row = await prisma.discipline.upsert({
      where: { organizationId_tag: { organizationId: org.id, tag: d.tag } },
      update: { name: d.name },
      create: { organizationId: org.id, tag: d.tag, name: d.name },
      select: { id: true },
    });
    disciplineId.set(d.tag, row.id);
  }

  const analysisCodeId = new Map<string, string>();
  for (const [i, c] of plan.analysisCodes.entries()) {
    const row = await prisma.analysisCode.upsert({
      where: { organizationId_tag: { organizationId: org.id, tag: c.tag } },
      // Efeito de um código já cadastrado não é sobrescrito: pode ter sido
      // ajustado no /settings/registers de propósito.
      update: { name: c.name },
      create: {
        organizationId: org.id,
        tag: c.tag,
        name: c.name,
        effect: c.effect,
        sortOrder: i + 1,
      },
      select: { id: true },
    });
    analysisCodeId.set(c.tag, row.id);
  }

  const firmId = new Map<string, string>();
  for (const name of plan.designFirms) {
    const row = await prisma.empresa.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
      select: { id: true },
    });
    firmId.set(normalizeName(name), row.id);
  }

  /* --- pessoas --- */

  const password = option("senha", generateTemporaryPassword());
  const passwordHash = await hashPassword(password);

  // Só reaproveita conta que já existe NESTA organização — usuário de outra
  // organização com o mesmo nome não deve ser reusado aqui (cada organização
  // tem sua própria conta, mesmo sendo a mesma pessoa no mundo real).
  const existing = await prisma.user.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, email: true },
  });
  const byName = new Map(existing.map((u) => [normalizeName(u.name), u.id]));
  const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u.id]));

  const userId = new Map<string, string>();
  let created = 0;
  let skipped = 0;
  for (const person of plan.people) {
    const key = normalizeName(person.name);
    // Quem já tem conta é reaproveitado pelo nome — a senha dele não é tocada.
    const found = byName.get(key) ?? byEmail.get(person.email.toLowerCase());
    if (found) {
      userId.set(key, found);
      continue;
    }

    // E-mail é único no sistema inteiro (é a chave de login). Se já pertencer
    // a outra organização, não dá para criar nem reaproveitar — pula a pessoa
    // e avisa, em vez de travar a carga inteira.
    const emailOwner = await prisma.user.findUnique({
      where: { email: person.email },
      select: { organizationId: true },
    });
    if (emailOwner && emailOwner.organizationId !== org.id) {
      log(
        `  aviso: e-mail ${person.email} já pertence a outra organização — pulando "${person.name}".`,
      );
      skipped += 1;
      continue;
    }

    const row = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: person.name,
        email: person.email,
        passwordHash,
        role: "SPECIALIST",
        mustChangePassword: false,
      },
      select: { id: true },
    });
    userId.set(key, row.id);
    created += 1;
  }

  /* --- projetos --- */

  const projectId = new Map<string, string>();
  for (const p of plan.projects) {
    if (!p.hasDocuments && !ALL_PROJECTS) continue;

    const data = {
      organizationId: org.id,
      name: p.name,
      osNumber: p.os,
      description: p.serviceOrder ? `OS ${p.serviceOrder}` : null,
      clientId: client.id,
      designFirmId: p.designFirm ? (firmId.get(normalizeName(p.designFirm)) ?? null) : null,
    };

    const found = await prisma.project.findFirst({
      where: { osNumber: p.os, organizationId: org.id },
      select: { id: true },
    });
    const row = found
      ? await prisma.project.update({
          where: { id: found.id },
          data,
          select: { id: true },
        })
      : await prisma.project.create({ data, select: { id: true } });

    projectId.set(p.os, row.id);
  }

  /* --- documentos --- */

  let docs = 0;
  let revisions = 0;
  for (const doc of plan.documents) {
    const project = projectId.get(doc.projectOs);
    if (!project) continue;

    const firmForDoc = plan.projects.find((p) => p.os === doc.projectOs)?.designFirm;

    await prisma.document.create({
      data: {
        projectId: project,
        number: doc.number,
        name: doc.name,
        type: doc.type,
        disciplineId: doc.disciplineTag
          ? (disciplineId.get(doc.disciplineTag) ?? null)
          : null,
        designFirmId: firmForDoc ? (firmId.get(normalizeName(firmForDoc)) ?? null) : null,
        revisions: {
          create: doc.revisions.map((rev) => revisionInput(rev, userId, analysisCodeId)),
        },
      },
    });
    docs += 1;
    revisions += doc.revisions.length;
  }

  log(`\nCarga concluída em "${org.name}".`);
  log(`  projetos    ${projectId.size}`);
  log(`  documentos  ${docs}`);
  log(`  revisões    ${revisions}`);
  log(
    `  usuários    ${created} criados, ${plan.people.length - created - skipped} já existiam${skipped ? `, ${skipped} pulados (e-mail de outra organização)` : ""}`,
  );
  if (created > 0) {
    log(`\n  Senha das contas criadas: ${password}`);
    log(`  (papel SPECIALIST, e-mail nome.sobrenome@${EMAIL_DOMAIN})`);
  }
}

/**
 * Monta a revisão com seu histórico.
 *
 * Cada round vira dois eventos — envio e parecer — porque é isso que o
 * histórico precisa responder: quanto tempo ficou parado em cada análise.
 * Os dias de cada etapa são congelados aqui, como no fluxo normal do app.
 */
function revisionInput(
  rev: MasterRevision,
  userId: Map<string, string>,
  analysisCodeId: Map<string, string>,
): Prisma.DocumentRevisionUncheckedCreateWithoutDocumentInput {
  const specialist = rev.analyst ? userId.get(normalizeName(rev.analyst)) : undefined;
  const transitions: Prisma.DocumentTransitionUncheckedCreateWithoutRevisionInput[] = [];

  const first = rev.rounds[0];
  const createdAt = first.issuedAt ?? new Date();

  transitions.push({
    action: "CREATED",
    fromStatus: null,
    toStatus: "DRAFT",
    round: 0,
    actorName: "Carga CONTROLE MASTER",
    createdAt,
    comment: "Importado do controle em Excel.",
  });

  let previousStatus: DocumentStatus = "DRAFT";
  let previousAt = createdAt;

  rev.rounds.forEach((round, index) => {
    const roundNo = index + 1;
    const issuedAt = round.issuedAt ?? previousAt;
    const analyst = round.analyst ? userId.get(normalizeName(round.analyst)) : undefined;

    transitions.push({
      action: "SUBMITTED",
      fromStatus: previousStatus,
      toStatus: "IN_REVIEW",
      round: roundNo,
      actorName: "Carga CONTROLE MASTER",
      assignedToId: analyst,
      assignedToName: round.analyst,
      dueAt: round.dueAt,
      daysInPreviousStage: daysBetween(issuedAt, previousAt),
      createdAt: issuedAt,
    });
    previousStatus = "IN_REVIEW";
    previousAt = issuedAt;

    const tag = round.analysisTag;
    const action = tag ? ACTION_BY_TAG[tag] : undefined;
    if (!action || !tag) return; // sem parecer: a revisão continua em análise

    const analyzedAt = round.analyzedAt ?? issuedAt;
    transitions.push({
      action,
      fromStatus: "IN_REVIEW",
      toStatus: statusFor(action),
      round: roundNo,
      analysisCodeId: analysisCodeId.get(tag),
      analysisCodeTag: tag,
      actorId: analyst,
      actorName: round.analyst,
      comment: round.notes,
      daysInPreviousStage: daysBetween(analyzedAt, issuedAt),
      createdAt: analyzedAt,
    });
    previousStatus = statusFor(action);
    previousAt = analyzedAt;
  });

  return {
    name: rev.name,
    sequence: rev.sequence,
    status: rev.status,
    round: rev.rounds.length,
    specialistId: specialist,
    analysisCodeId: rev.analysisTag ? analysisCodeId.get(rev.analysisTag) : undefined,
    issuedAt: rev.issuedAt,
    dueAt: rev.dueAt,
    analyzedAt: rev.analyzedAt,
    inReviewSince: rev.status === "IN_REVIEW" ? (rev.issuedAt ?? undefined) : null,
    notes: rev.notes,
    createdAt: createdAt,
    transitions: { create: transitions },
  };
}

function statusFor(action: DocumentAction): DocumentStatus {
  switch (action) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "COMMENTED":
      return "COMMENTED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "IN_REVIEW";
  }
}

function report(plan: MasterPlan, org: { name: string }): void {
  log(`Organização: ${org.name}`);
  log(`Planilha: ${file}`);
  log(`  lançamentos lidos   ${plan.stats.rows}`);
  log(`  documentos          ${plan.stats.documents}`);
  log(`  revisões            ${plan.stats.revisions}`);
  log(`  ciclos de análise   ${plan.stats.rounds}`);
  log(`  revisões em aberto  ${plan.stats.open}`);
  const comDocumento = plan.projects.filter((p) => p.hasDocuments).length;
  log(`  projetos            ${comDocumento} com documento (${plan.projects.length} no total)`);
  log(`  disciplinas         ${plan.disciplines.length}`);
  log(`  projetistas         ${plan.designFirms.length}`);
  log(`  equipe de análise   ${plan.people.length}`);

  if (plan.warnings.length > 0) {
    log(`\nAvisos (${plan.warnings.length}):`);
    for (const w of plan.warnings) log(`  - ${w}`);
  }
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
