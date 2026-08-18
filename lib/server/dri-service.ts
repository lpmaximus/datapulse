import { prisma } from "@/lib/prisma";
import { toNumber, toJsonValue } from "@/lib/format";
import {
  computeMilestoneDRI,
  computeProjectDRI,
  type MilestoneInput,
} from "@/lib/dri";
import type { MilestoneForDRIRow } from "@/types/models";

/**
 * Orquestra o recálculo do DRI: lê os sinais, chama o motor puro (lib/dri.ts)
 * e persiste um snapshot por marco + um snapshot agregado do projeto.
 *
 * Histórico é preservado (nunca sobrescreve) porque a tendência é o que
 * revela a restrição se formando.
 */
export async function recalculateProjectDRI(projectId: string, now = new Date()) {
  const milestones: MilestoneForDRIRow[] = await prisma.milestone.findMany({
    where: { projectId },
    include: {
      humanSignals: {
        orderBy: { createdAt: "desc" },
        take: 200,
      },
      systemicSignals: {
        orderBy: { referenceDate: "desc" },
        take: 50,
      },
    },
  });

  if (milestones.length === 0) {
    return { projectId, milestones: 0, projectScore: 0 };
  }

  const results = milestones.map((m: MilestoneForDRIRow) => {
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
      systemicSignals: m.systemicSignals.map((s) => ({
        referenceDate: s.referenceDate,
        plannedDate: s.plannedDate,
        actualDate: s.actualDate,
        delayDays: s.delayDays,
        plannedCost: toNumber(s.plannedCost),
        actualCost: toNumber(s.actualCost),
        openIssues: s.openIssues,
        replanCount: s.replanCount,
      })),
    };
    return { milestone: m, dri: computeMilestoneDRI(input, now) };
  });

  const project = computeProjectDRI(
    results.map((r) => ({
      score: r.dri.score,
      economicImpact: toNumber(r.milestone.economicImpact),
    })),
  );

  await prisma.$transaction([
    prisma.dRIScore.createMany({
      data: results.map((r) => ({
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
