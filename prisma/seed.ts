/**
 * Seed de demonstração: um projeto de engenharia com marcos em estados
 * diferentes, para o dashboard nascer com algo para mostrar.
 *
 * Rodar: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { recalculateProjectDRI } from "../lib/server/dri-service";
import { hashPassword } from "../lib/password";
import { applyDemoTaskDetails, backfillDoneTasks } from "./demo-tasks";
import { hashRespondent } from "../lib/auth";
import { DEFAULT_ANALYSIS_CODES } from "../lib/documents";
import { ROLE_LABEL, ROLE_DESCRIPTION } from "../lib/authz";

const prisma = new PrismaClient();

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

/**
 * Usuários de demonstração. A senha inicial é a mesma para todos e o primeiro
 * login obriga a troca — nunca use este seed em produção com dados reais.
 */
const SEED_PASSWORD = "datapulse2026";

/** Organização única deste seed — tudo abaixo nasce vinculado a ela. */
const ORG_NAME = "Organização Demo";

/** Cargos de exemplo — cadastro em Cadastros > Funções, editável depois. */
const JOB_FUNCTIONS = ["Coordenador", "Projetista", "Suprimentos", "Fiscal de obra"];

async function seedOrganization() {
  return prisma.organization.upsert({
    where: { name: ORG_NAME },
    create: { name: ORG_NAME },
    update: {},
  });
}

async function seedJobFunctions(organizationId: string) {
  const byName = new Map<string, { id: string }>();
  for (const name of JOB_FUNCTIONS) {
    const f = await prisma.jobFunction.upsert({
      where: { organizationId_name: { organizationId, name } },
      create: { organizationId, name },
      update: {},
    });
    byName.set(name, f);
  }
  return byName;
}

async function seedUsers(organizationId: string) {
  const passwordHash = await hashPassword(SEED_PASSWORD);
  const functions = await seedJobFunctions(organizationId);

  const people = [
    { name: "Admin DataPulse", email: "admin@datapulse.local", role: "ADMIN" as const, functionName: null },
    { name: "Ana Ribeiro", email: "ana@datapulse.local", role: "MANAGER" as const, functionName: "Coordenador" },
    { name: "Carlos Menezes", email: "carlos@datapulse.local", role: "SPECIALIST" as const, functionName: "Projetista" },
    { name: "Bruna Tavares", email: "bruna@datapulse.local", role: "SPECIALIST" as const, functionName: "Suprimentos" },
    { name: "Diego Alves", email: "diego@datapulse.local", role: "SPECIALIST" as const, functionName: "Fiscal de obra" },
    { name: "Executivo Conselho", email: "exec@datapulse.local", role: "EXECUTIVE" as const, functionName: null },
  ];

  const created = [];
  for (const p of people) {
    const { functionName, ...rest } = p;
    const functionId = functionName ? functions.get(functionName)?.id ?? null : null;
    created.push(
      // E-mail é único globalmente (login), não por organização — o `where`
      // aqui é sempre só o e-mail, mesmo com múltiplas organizações no banco.
      await prisma.user.upsert({
        where: { email: rest.email },
        create: { ...rest, organizationId, functionId, passwordHash, mustChangePassword: true },
        update: {},
      }),
    );
  }
  return created;
}

/**
 * Rótulo/descrição de cada papel de acesso — cadastro editável em
 * Settings > Cadastros > "Papéis de acesso". O papel em si (`UserRole`)
 * continua fixo no código; isto só popula o texto exibido.
 */
async function seedRoleProfiles(organizationId: string) {
  for (const role of Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]) {
    await prisma.roleProfile.upsert({
      where: { organizationId_role: { organizationId, role } },
      create: { organizationId, role, label: ROLE_LABEL[role], description: ROLE_DESCRIPTION[role] },
      update: {},
    });
  }
}

/** Tabelas de referência: sem elas, projetos e documentos nascem incompletos. */
async function seedRegisters(organizationId: string) {
  for (const c of DEFAULT_ANALYSIS_CODES) {
    await prisma.analysisCode.upsert({
      where: { organizationId_tag: { organizationId, tag: c.tag } },
      create: { ...c, organizationId },
      update: { name: c.name, effect: c.effect, sortOrder: c.sortOrder },
    });
  }

  const disciplines = [
    { tag: "ELE", name: "Elétrica" },
    { tag: "CIV", name: "Civil" },
    { tag: "MEC", name: "Mecânica" },
    { tag: "AUT", name: "Automação" },
    { tag: "AMB", name: "Ambiental" },
  ];
  for (const d of disciplines) {
    await prisma.discipline.upsert({
      where: { organizationId_tag: { organizationId, tag: d.tag } },
      create: { ...d, organizationId },
      update: {},
    });
  }

  for (const name of ["Engenharia", "Suprimentos", "Obra", "Licenciamento"]) {
    await prisma.sector.upsert({
      where: { organizationId_name: { organizationId, name } },
      create: { name, organizationId },
      update: {},
    });
  }

  const client = await prisma.client.upsert({
    where: { organizationId_name: { organizationId, name: "Concessionária Exemplo" } },
    create: {
      organizationId,
      name: "Concessionária Exemplo",
      code: "CE-001",
      contactName: "Depto. de Engenharia",
      email: "engenharia@exemplo.com.br",
    },
    update: {},
  });

  const firm = await prisma.empresa.upsert({
    where: { organizationId_name: { organizationId, name: "Projetec Engenharia" } },
    create: {
      organizationId,
      name: "Projetec Engenharia",
      coordinatorName: "Eng. Roberto Lima",
      email: "roberto@projetec.com.br",
      phone: "(11) 4002-8922",
    },
    update: {},
  });

  const sector = await prisma.sector.findUnique({
    where: { organizationId_name: { organizationId, name: "Engenharia" } },
  });
  const ele = await prisma.discipline.findUnique({
    where: { organizationId_tag: { organizationId, tag: "ELE" } },
  });
  const amb = await prisma.discipline.findUnique({
    where: { organizationId_tag: { organizationId, tag: "AMB" } },
  });

  return { client, firm, sector, ele, amb };
}

async function main() {
  const org = await seedOrganization();
  const users = await seedUsers(org.id);
  const refs = await seedRegisters(org.id);
  await seedRoleProfiles(org.id);
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const manager = byEmail.get("ana@datapulse.local")!;
  const eng = byEmail.get("carlos@datapulse.local")!;
  const sup = byEmail.get("bruna@datapulse.local")!;
  const obra = byEmail.get("diego@datapulse.local")!;

  // Carlos (Projetista) é funcionário da empresa contratada de exemplo —
  // mostra o vínculo Usuário ↔ Empresa já preenchido na demonstração.
  await prisma.user.update({
    where: { id: eng.id },
    data: { companyId: refs.firm.id },
  });

  const existing = await prisma.project.findFirst({
    where: { name: "Subestação Norte — Fase 2", organizationId: org.id },
  });
  if (existing) {
    await backfillDoneTasks(prisma);
    await applyDemoTaskDetails(prisma);
    console.log(
      `Projeto de demonstração já existe. Usuários e cadastros garantidos (${users.length} usuários).`,
    );
    // upsert usa update: {} — usuário que já existia manteve a senha antiga,
    // que pode não ser mais esta. Só é confiável na primeira criação (abaixo).
    console.log(
      `Login (só vale se o usuário acabou de ser criado agora): admin@datapulse.local / ${SEED_PASSWORD}`,
    );
    console.log(
      "Se o admin já existia, a senha dele não mudou. Para redefinir, rode: npx tsx scripts/reset-admin-password.ts",
    );
    return;
  }

  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: "Subestação Norte — Fase 2",
      osNumber: "OS-2026-014",
      cost: 12_500_000,
      clientId: refs.client.id,
      sectorId: refs.sector?.id ?? null,
      designFirmId: refs.firm.id,
      startsAt: daysAgo(180),
      endsAt: daysAhead(240),
      managerId: manager.id,
      members: {
        create: [
          { userId: eng.id, roleInProject: "Engenharia" },
          { userId: sup.id, roleInProject: "Suprimentos" },
          { userId: obra.id, roleInProject: "Obra" },
        ],
      },
      milestones: {
        create: [
          {
            name: "Liberação do projeto executivo",
            type: "Engenharia",
            criticality: "CRITICAL",
            economicImpact: 2_400_000,
            plannedDate: daysAgo(20),
            forecastDate: daysAhead(15),
          },
          {
            name: "Chegada dos transformadores",
            type: "Suprimentos",
            criticality: "HIGH",
            economicImpact: 5_800_000,
            plannedDate: daysAhead(45),
          },
          {
            name: "Licença ambiental de instalação",
            type: "Licenciamento",
            criticality: "HIGH",
            economicImpact: 1_200_000,
            plannedDate: daysAgo(60),
            actualDate: daysAgo(52),
          },
          {
            name: "Montagem eletromecânica",
            type: "Obra",
            criticality: "MEDIUM",
            economicImpact: 900_000,
            plannedDate: daysAhead(120),
          },
        ],
      },
    },
    include: { milestones: true },
  });

  const [executivo, transformadores, licenca] = project.milestones;

  // Camada 1 — o marco de engenharia já mostra desvio de prazo e custo.
  await prisma.systemicSignal.createMany({
    data: [
      {
        milestoneId: executivo.id,
        source: "CSV",
        referenceDate: daysAgo(7),
        plannedDate: daysAgo(20),
        delayDays: 35,
        plannedCost: 800_000,
        actualCost: 968_000,
        replanCount: 2,
        openIssues: 11,
      },
      {
        milestoneId: transformadores.id,
        source: "CSV",
        referenceDate: daysAgo(7),
        plannedDate: daysAhead(45),
        delayDays: 0,
        plannedCost: 5_000_000,
        actualCost: 5_050_000,
        replanCount: 0,
        openIssues: 2,
      },
      {
        milestoneId: licenca.id,
        source: "CSV",
        referenceDate: daysAgo(7),
        plannedDate: daysAgo(60),
        actualDate: daysAgo(52),
        delayDays: 8,
      },
    ],
  });

  // Camada 2 — três respondentes, com divergência real sobre o executivo.
  await prisma.humanSignal.createMany({
    data: [
      {
        milestoneId: executivo.id,
        respondentHash: hashRespondent(eng.id),
        respondentRole: "Engenharia",
        failureProbability: 75,
        planConfidence: 2,
        perceivedBottleneck: "Revisão elétrica parada aguardando aprovação do cliente há 3 semanas.",
        blockedDecision: true,
        createdAt: daysAgo(5),
      },
      {
        milestoneId: executivo.id,
        respondentHash: hashRespondent(manager.id),
        respondentRole: "Planejamento",
        failureProbability: 40,
        planConfidence: 3,
        perceivedBottleneck: "Cronograma ainda absorve, mas sem folga.",
        createdAt: daysAgo(4),
      },
      {
        milestoneId: executivo.id,
        respondentHash: hashRespondent(obra.id),
        respondentRole: "Obra",
        failureProbability: 85,
        planConfidence: 1,
        perceivedBottleneck: "Sem projeto liberado não há como mobilizar frente de montagem.",
        blockedDecision: true,
        createdAt: daysAgo(2),
      },
      {
        milestoneId: transformadores.id,
        respondentHash: hashRespondent(sup.id),
        respondentRole: "Suprimentos",
        failureProbability: 30,
        planConfidence: 4,
        perceivedBottleneck: "Fornecedor confirmou embarque; risco é logística portuária.",
        createdAt: daysAgo(3),
      },
    ],
  });

  // Dois cálculos em datas diferentes para a linha de tendência nascer visível.
  await recalculateProjectDRI(project.id, daysAgo(3));
  await recalculateProjectDRI(project.id);

  // Demandas abertas para a área do especialista nascer com conteúdo.
  await prisma.signalRequest.createMany({
    data: [
      {
        milestoneId: transformadores.id,
        assigneeId: eng.id,
        status: "PENDING",
        dueAt: daysAhead(3),
        note: "Fornecedor sinalizou possível atraso no embarque.",
        requestedById: manager.id,
      },
      {
        milestoneId: executivo.id,
        assigneeId: sup.id,
        status: "PENDING",
        dueAt: daysAgo(2),
        note: "Preciso da sua leitura sobre o impacto em compras.",
        requestedById: manager.id,
      },
      {
        milestoneId: executivo.id,
        assigneeId: eng.id,
        status: "ANSWERED",
        answeredAt: daysAgo(5),
        requestedById: manager.id,
      },
    ],
  });

  // Documento com trâmite real: R00 comentada e reprovada, R01 em análise.
  const codes = Object.fromEntries(
    (await prisma.analysisCode.findMany({ where: { organizationId: org.id } })).map(
      (c: { id: string; tag: string }) => [c.tag, c],
    ),
  );

  const doc = await prisma.document.create({
    data: {
      projectId: project.id,
      number: "PE-ELE-001",
      name: "Projeto executivo — elétrica",
      type: "Projeto executivo",
      disciplineId: refs.ele?.id ?? null,
      designFirmId: refs.firm.id,
      responsibleId: eng.id,
      notes: "Documento que trava a liberação do marco de engenharia.",
    },
  });

  // R00 — enviada e devolvida com comentários.
  await prisma.documentRevision.create({
    data: {
      documentId: doc.id,
      name: "R00",
      sequence: 0,
      status: "COMMENTED",
      round: 1,
      specialistId: manager.id,
      analysisCodeId: codes.COM?.id ?? null,
      issuedAt: daysAgo(70),
      analyzedAt: daysAgo(48),
      transitions: {
        create: [
          { action: "CREATED", toStatus: "DRAFT", round: 0, actorName: eng.name, createdAt: daysAgo(70) },
          { action: "SUBMITTED", fromStatus: "DRAFT", toStatus: "IN_REVIEW", round: 1, actorName: eng.name, assignedToName: manager.name, daysInPreviousStage: 4, createdAt: daysAgo(66) },
          { action: "COMMENTED", fromStatus: "IN_REVIEW", toStatus: "COMMENTED", round: 1, actorName: manager.name, analysisCodeTag: "COM", comment: "Faltam memoriais de cálculo do sistema de aterramento.", daysInPreviousStage: 18, createdAt: daysAgo(48) },
        ],
      },
    },
  });

  // R01 — reemitida e reprovada.
  await prisma.documentRevision.create({
    data: {
      documentId: doc.id,
      name: "R01",
      sequence: 1,
      status: "REJECTED",
      round: 1,
      specialistId: manager.id,
      analysisCodeId: codes.REJ?.id ?? null,
      issuedAt: daysAgo(45),
      analyzedAt: daysAgo(23),
      notes: "Incluídos os memoriais de aterramento.",
      transitions: {
        create: [
          { action: "REVISED", toStatus: "DRAFT", round: 0, actorName: eng.name, comment: "Incluídos os memoriais de aterramento.", createdAt: daysAgo(45) },
          { action: "SUBMITTED", fromStatus: "DRAFT", toStatus: "IN_REVIEW", round: 1, actorName: eng.name, assignedToName: manager.name, daysInPreviousStage: 7, createdAt: daysAgo(38) },
          { action: "REJECTED", fromStatus: "IN_REVIEW", toStatus: "REJECTED", round: 1, actorName: manager.name, analysisCodeTag: "REJ", comment: "Divergência com o as-built do barramento existente.", daysInPreviousStage: 15, createdAt: daysAgo(23) },
        ],
      },
    },
  });

  // R02 — em análise agora, já parada há 11 dias.
  await prisma.documentRevision.create({
    data: {
      documentId: doc.id,
      name: "R02",
      sequence: 2,
      status: "IN_REVIEW",
      round: 1,
      specialistId: manager.id,
      inReviewSince: daysAgo(11),
      issuedAt: daysAgo(12),
      dueAt: daysAhead(2),
      notes: "Corrigido o barramento conforme as-built.",
      transitions: {
        create: [
          { action: "REVISED", toStatus: "DRAFT", round: 0, actorName: eng.name, comment: "Corrigido o barramento conforme as-built.", createdAt: daysAgo(12) },
          { action: "SUBMITTED", fromStatus: "DRAFT", toStatus: "IN_REVIEW", round: 1, actorName: eng.name, assignedToName: manager.name, daysInPreviousStage: 1, createdAt: daysAgo(11) },
        ],
      },
    },
  });

  // Documento simples, aprovado de primeira.
  await prisma.document.create({
    data: {
      projectId: project.id,
      number: "LIC-AMB-002",
      name: "Licença ambiental de instalação",
      type: "Licença",
      disciplineId: refs.amb?.id ?? null,
      responsibleId: manager.id,
      revisions: {
        create: {
          name: "R00",
          sequence: 0,
          status: "APPROVED",
          round: 1,
          specialistId: manager.id,
          analysisCodeId: codes.APR?.id ?? null,
          issuedAt: daysAgo(90),
          analyzedAt: daysAgo(52),
          transitions: {
            create: [
              { action: "CREATED", toStatus: "DRAFT", round: 0, actorName: manager.name, createdAt: daysAgo(90) },
              { action: "SUBMITTED", fromStatus: "DRAFT", toStatus: "IN_REVIEW", round: 1, actorName: manager.name, daysInPreviousStage: 5, createdAt: daysAgo(85) },
              { action: "APPROVED", fromStatus: "IN_REVIEW", toStatus: "APPROVED", round: 1, actorName: manager.name, analysisCodeTag: "APR", comment: "Aprovado sem ressalvas.", daysInPreviousStage: 33, createdAt: daysAgo(52) },
            ],
          },
        },
      },
    },
  });

  await backfillDoneTasks(prisma);
  await applyDemoTaskDetails(prisma);

  console.log(`Seed aplicado: ${project.name} (${project.milestones.length} tarefas).`);
  console.log(`Organização: ${org.name}`);
  console.log(`Usuários criados: ${users.length}`);
  console.log("Cadastros: 4 códigos de análise, 5 disciplinas, 4 setores, 1 cliente, 1 empresa.");
  console.log(`Login: admin@datapulse.local / ${SEED_PASSWORD} (troca obrigatória no 1º acesso)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
