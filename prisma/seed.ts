/**
 * Seed de demonstração: um projeto de engenharia com marcos em estados
 * diferentes, para o dashboard nascer com algo para mostrar.
 *
 * Rodar: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { recalculateProjectDRI } from "../lib/server/dri-service";

const prisma = new PrismaClient();

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  const existing = await prisma.project.findFirst({
    where: { name: "Subestação Norte — Fase 2" },
  });
  if (existing) {
    console.log("Seed já aplicado. Nada a fazer.");
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: "Subestação Norte — Fase 2",
      client: "Concessionária Exemplo",
      sector: "Engenharia / Infraestrutura",
      startsAt: daysAgo(180),
      endsAt: daysAhead(240),
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
        respondentHash: "seed-eng-01",
        respondentRole: "Engenharia",
        failureProbability: 75,
        planConfidence: 2,
        perceivedBottleneck: "Revisão elétrica parada aguardando aprovação do cliente há 3 semanas.",
        blockedDecision: true,
        createdAt: daysAgo(5),
      },
      {
        milestoneId: executivo.id,
        respondentHash: "seed-plan-02",
        respondentRole: "Planejamento",
        failureProbability: 40,
        planConfidence: 3,
        perceivedBottleneck: "Cronograma ainda absorve, mas sem folga.",
        createdAt: daysAgo(4),
      },
      {
        milestoneId: executivo.id,
        respondentHash: "seed-obra-03",
        respondentRole: "Obra",
        failureProbability: 85,
        planConfidence: 1,
        perceivedBottleneck: "Sem projeto liberado não há como mobilizar frente de montagem.",
        blockedDecision: true,
        createdAt: daysAgo(2),
      },
      {
        milestoneId: transformadores.id,
        respondentHash: "seed-sup-04",
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

  console.log(`Seed aplicado: ${project.name} (${project.milestones.length} marcos).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
