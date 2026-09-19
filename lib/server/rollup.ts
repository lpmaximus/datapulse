import { prisma } from "@/lib/prisma";
import { rollupMilestone, buildDeadlineChange } from "@/lib/tasks";

/** Cliente Prisma aceito pelos serviços — o do app ou o de um script. */
export type Db = typeof prisma;

/**
 * Recalcula status/avanço/prazos do Marco a partir das Tarefas filhas —
 * chamado sempre que uma filha é criada/editada/movida, ou o próprio Marco
 * teve uma filha adicionada/removida. Grava histórico quando o prazo previsto
 * do Marco mudar por causa disso.
 */
export async function recomputeRollup(milestoneId: string, db: Db = prisma) {
  const children = await db.milestone.findMany({
    where: { parentId: milestoneId },
    select: {
      kind: true,
      status: true,
      progress: true,
      startDate: true,
      plannedDate: true,
      forecastDate: true,
      actualDate: true,
    },
  });
  if (children.length === 0) return;

  const current = await db.milestone.findUnique({
    where: { id: milestoneId },
    select: { forecastDate: true },
  });
  const result = rollupMilestone(children);
  const change = current ? buildDeadlineChange(current.forecastDate, result.forecastDate) : null;

  await db.milestone.update({
    where: { id: milestoneId },
    data: {
      status: result.status,
      progress: result.progress,
      forecastDate: result.forecastDate,
      actualDate: result.actualDate,
    },
  });

  if (change) {
    await db.deadlineChange.create({
      data: {
        milestoneId,
        fromDate: change.fromDate,
        toDate: change.toDate,
        reason: "Recalculado a partir das tarefas filhas.",
      },
    });
  }
}
