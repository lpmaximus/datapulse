import { prisma } from "@/lib/prisma";
import { toNumber, toJsonValue } from "@/lib/format";
import {
  aggregateGroupDRI,
  computeMilestoneDRI,
  computeProjectDRI,
  FORMULA_VERSION,
  type MilestoneInput,
} from "@/lib/dri";
import { leafTasks } from "@/lib/tasks";

/**
 * Orquestra o recálculo do DRI: lê os sinais, chama o motor puro (lib/dri.ts)
 * e persiste um snapshot por item + um snapshot agregado do projeto.
 *
 * Só as FOLHAS são pontuadas (tarefas simples, pacotes de revisão e marcos sem
 * filhas). Marco que agrupa tarefas recebe o pior score das filhas: assim o
 * mesmo atraso não é contado no filho e no pai, e a restrição dominante do
 * projeto continua sendo o pior gargalo, não uma média inflada por duplicatas.
 * Tarefa cancelada não é restrição e fica de fora.
 *
 * Histórico é preservado (nunca sobrescreve) porque a tendência é o que
 * revela a restrição se formando.
 */
export async function recalculateProjectDRI(projectId: string, now = new Date()) {
  const milestones = await prisma.milestone.findMany({
    where: { projectId, status: { not: "CANCELLED" } },
    include: {
      humanSignals: {
        orderBy: { createdAt: "desc" },
        take: 200,
      },
      systemicSignals: {
        orderBy: { referenceDate: "desc" },
        take: 50,
      },
      // Sinais operacionais: o que trava a tarefa, já registrado no banco.
      impediments: { where: { resolvedAt: null }, select: { createdAt: true } },
      requests: { where: { status: "PENDING" }, select: { dueAt: true } },
      documentRevisions: {
        select: {
          status: true,
          inReviewSince: true,
          document: { select: { _count: { select: { revisions: true } } } },
        },
      },
    },
  });

  if (milestones.length === 0) {
    return { projectId, milestones: 0, projectScore: 0 };
  }

  const leafIds = new Set(
    leafTasks(milestones.map((m) => ({ id: m.id, parentId: m.parentId }))).map((m) => m.id),
  );

  const results = milestones
    .filter((m) => leafIds.has(m.id))
    .map((m) => {
      const input: MilestoneInput = {
        id: m.id,
        name: m.name,
        criticality: m.criticality,
        economicImpact: toNumber(m.economicImpact),
        plannedDate: m.plannedDate,
        forecastDate: m.forecastDate,
        actualDate: m.actualDate,
        humanSignals: m.humanSignals.map((h) => ({
          failureProbability: h.failureProbability,
          planConfidence: h.planConfidence,
          blockedDecision: h.blockedDecision,
          createdAt: h.createdAt,
        })),
        systemicSignals: m.systemicSignals.map((sig) => ({
          referenceDate: sig.referenceDate,
          plannedDate: sig.plannedDate,
          actualDate: sig.actualDate,
          delayDays: sig.delayDays,
          plannedCost: toNumber(sig.plannedCost),
          actualCost: toNumber(sig.actualCost),
          openIssues: sig.openIssues,
          replanCount: sig.replanCount,
        })),
        operational: {
          openImpedimentDates: m.impediments.map((i) => i.createdAt),
          pendingRequestDueDates: m.requests.map((r) => r.dueAt),
          reviewsInReviewSince: m.documentRevisions.flatMap((r) =>
            r.status === "IN_REVIEW" && r.inReviewSince ? [r.inReviewSince] : [],
          ),
          maxRevisionsPerDocument: Math.max(
            0,
            ...m.documentRevisions.map((r) => r.document._count.revisions),
          ),
        },
      };
      return { milestone: m, dri: computeMilestoneDRI(input, now) };
    });

  const project = computeProjectDRI(
    results.map((r) => ({
      score: r.dri.score,
      economicImpact: toNumber(r.milestone.economicImpact),
    })),
  );

  // Marcos que agrupam tarefas: pior score das filhas.
  const scoreById = new Map(results.map((r) => [r.milestone.id, r.dri.score]));
  const groups = milestones
    .filter((m) => !leafIds.has(m.id))
    .map((m) => {
      const children = milestones
        .filter((c) => c.parentId === m.id && scoreById.has(c.id))
        .map((c) => ({ name: c.name, score: scoreById.get(c.id) as number }));
      return { milestone: m, agg: aggregateGroupDRI(children) };
    });

  await prisma.$transaction([
    prisma.dRIScore.createMany({
      data: [
        ...results.map((r) => ({
          projectId,
          milestoneId: r.milestone.id,
          score: r.dri.score,
          humanScore: r.dri.humanScore,
          systemicScore: r.dri.systemicScore,
          calculatedAt: now,
          breakdown: toJsonValue({
            ...r.dri.breakdown,
            confidence: r.dri.confidence,
            economicExposure: r.dri.economicExposure,
          }),
        })),
        ...groups.map((g) => ({
          projectId,
          milestoneId: g.milestone.id,
          score: g.agg.score,
          humanScore: null,
          systemicScore: null,
          calculatedAt: now,
          breakdown: toJsonValue({
            aggregate: "pior das filhas",
            dominantChild: g.agg.dominantChild,
            childCount: g.agg.childCount,
            calculatedAt: now.toISOString(),
            formulaVersion: FORMULA_VERSION,
          }),
        })),
      ],
    }),
    prisma.dRIScore.create({
      data: {
        projectId,
        milestoneId: null,
        score: project.score,
        calculatedAt: now,
        breakdown: toJsonValue({
          dominant: project.dominant,
          contextual: project.contextual,
          milestoneCount: results.length,
          topMilestone:
            results.slice().sort((a, b) => b.dri.score - a.dri.score)[0]
              ?.milestone.name ?? null,
        }),
      },
    }),
  ]);

  return {
    projectId,
    milestones: results.length,
    projectScore: project.score,
  };
}

export async function recalculateAllProjects(now = new Date()) {
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const results = [];
  for (const p of projects) {
    results.push(await recalculateProjectDRI(p.id, now));
  }
  return results;
}
