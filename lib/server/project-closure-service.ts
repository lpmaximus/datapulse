import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/format";
import { measurementCode } from "@/lib/measurements";
import { loadMeasurableRevisions, valueToMeasure } from "@/lib/server/measurement-service";
import {
  closureChecklist,
  closureMetrics,
  type ClosureChecklist,
  type ClosureInput,
  type ClosureMetrics,
} from "@/lib/project-closure";

/**
 * Lê tudo o que o encerramento precisa conferir num projeto. A regra fica em
 * `lib/project-closure.ts`; aqui só a consulta, sempre presa ao tenant.
 */
export async function loadClosureInput(organizationId: string, projectId: string): Promise<ClosureInput> {
  const [tasks, documents, requests, impediments, topics, measurable, lines] = await Promise.all([
    prisma.milestone.findMany({
      where: { projectId, project: { organizationId } },
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        parentId: true,
        progress: true,
        startDate: true,
        plannedDate: true,
        forecastDate: true,
        actualDate: true,
      },
    }),
    prisma.document.findMany({
      where: { projectId, project: { organizationId } },
      orderBy: [{ number: "asc" }, { name: "asc" }],
      select: {
        id: true,
        number: true,
        name: true,
        revisions: { orderBy: { sequence: "asc" }, select: { name: true, status: true } },
      },
    }),
    prisma.request.findMany({
      where: { projectId, project: { organizationId } },
      select: { id: true, description: true, status: true },
    }),
    prisma.impediment.findMany({
      where: { resolvedAt: null, milestone: { projectId, project: { organizationId } } },
      select: { id: true, description: true, milestone: { select: { id: true, name: true } } },
    }),
    prisma.meetingTopic.findMany({
      where: { meeting: { projectId, project: { organizationId } } },
      select: {
        id: true,
        sourceTopicId: true,
        description: true,
        status: true,
        meeting: { select: { id: true, date: true } },
      },
    }),
    loadMeasurableRevisions(organizationId, { projectId }),
    prisma.measurementItem.findMany({
      where: { projectId, measurement: { organizationId } },
      select: {
        amount: true,
        measurement: { select: { id: true, number: true, revision: true, status: true } },
      },
    }),
  ]);

  return {
    projectId,
    tasks: tasks.map((t) => ({ ...t, kind: t.kind as string, status: t.status as string })) as ClosureInput["tasks"],
    documents: documents.map((d) => ({
      id: d.id,
      number: d.number,
      name: d.name,
      revisions: d.revisions.map((r) => ({ name: r.name, status: r.status as string })),
    })),
    requests: requests.map((r) => ({ id: r.id, title: r.description, status: r.status as string })),
    impediments: impediments.map((i) => ({
      id: i.id,
      description: i.description,
      taskId: i.milestone.id,
      taskName: i.milestone.name,
    })),
    topics: topics.map((t) => ({
      id: t.id,
      sourceTopicId: t.sourceTopicId,
      description: t.description,
      status: t.status,
      meetingId: t.meeting.id,
      meetingDate: t.meeting.date,
    })),
    toMeasure: measurable
      .filter((r) => r.measurable && r.remainingPercent > 0)
      .map((r) => ({
        documentId: r.documentId,
        documentNumber: r.documentNumber,
        documentName: r.documentName,
        revisionName: r.revisionName,
        remainingPercent: r.remainingPercent,
        value: valueToMeasure(r),
      })),
    measurementLines: lines.map((l) => ({
      measurementId: l.measurement.id,
      code: measurementCode(l.measurement.number, l.measurement.revision),
      status: l.measurement.status as string,
      amount: toNumber(l.amount) ?? 0,
    })),
  };
}

export interface ClosureContext {
  input: ClosureInput;
  checklist: ClosureChecklist;
  /** Indicadores com o encerramento hoje (prévia; o termo grava com a data informada). */
  preview: ClosureMetrics;
}

export async function loadClosureContext(
  organizationId: string,
  project: { id: string; startsAt: Date | null; endsAt: Date | null; cost: unknown },
  closedOn: Date,
): Promise<ClosureContext> {
  const input = await loadClosureInput(organizationId, project.id);
  return {
    input,
    checklist: closureChecklist(input),
    preview: closureMetrics(input, {
      startsAt: project.startsAt,
      endsAt: project.endsAt,
      closedOn,
      cost: toNumber(project.cost as never),
    }),
  };
}
