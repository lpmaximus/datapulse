import { prisma } from "@/lib/prisma";
import { projectVisibility } from "@/lib/visibility";
import { isPackageType } from "@/lib/tasks";
import type {
  ReportMeetingInput,
  ReportPackageInput,
  ReportProjectInput,
  ReportRevision,
} from "@/lib/reports";

/**
 * Leitura dos dados dos relatórios. Somente leitura: nenhuma função aqui grava.
 *
 * Toda consulta passa por `projectVisibility(user)`, a mesma regra das telas:
 * fora do que o usuário enxerga, o projeto "não existe" e o relatório dá 404.
 */

type Viewer = { id: string; role: string; organizationId: string };

const REVISION_SELECT = {
  id: true,
  name: true,
  sequence: true,
  status: true,
  issuedAt: true,
  dueAt: true,
  analyzedAt: true,
  inReviewSince: true,
  milestone: { select: { id: true, name: true } },
  specialist: { select: { name: true } },
  analysisCode: { select: { tag: true, name: true } },
  document: {
    select: {
      id: true,
      number: true,
      name: true,
      discipline: { select: { tag: true } },
    },
  },
} as const;

type RevisionRow = {
  id: string;
  name: string;
  sequence: number;
  status: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  analyzedAt: Date | null;
  inReviewSince: Date | null;
  milestone: { id: string; name: string } | null;
  specialist: { name: string } | null;
  analysisCode: { tag: string; name: string } | null;
  document: {
    id: string;
    number: string | null;
    name: string;
    discipline: { tag: string } | null;
  };
};

function toReportRevision(r: RevisionRow): ReportRevision {
  return {
    id: r.id,
    documentId: r.document.id,
    documentNumber: r.document.number,
    documentName: r.document.name,
    disciplineTag: r.document.discipline?.tag ?? null,
    name: r.name,
    sequence: r.sequence,
    status: r.status,
    packageId: r.milestone?.id ?? null,
    packageName: r.milestone?.name ?? null,
    specialistName: r.specialist?.name ?? null,
    analysisTag: r.analysisCode?.tag ?? null,
    analysisName: r.analysisCode?.name ?? null,
    issuedAt: r.issuedAt,
    dueAt: r.dueAt,
    analyzedAt: r.analyzedAt,
    inReviewSince: r.inReviewSince,
  };
}

/**
 * Projetos visíveis ao usuário, já no formato de entrada dos relatórios.
 * `projectId` restringe a um projeto (relatório de projeto); sem ele, a carteira.
 */
export async function loadReportProjects(
  user: Viewer,
  projectId?: string,
): Promise<ReportProjectInput[]> {
  const projects = await prisma.project.findMany({
    where: { ...projectVisibility(user), ...(projectId ? { id: projectId } : {}) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      osNumber: true,
      status: true,
      currency: true,
      clientRef: { select: { name: true } },
      sector: { select: { name: true } },
      designFirm: { select: { name: true } },
      manager: { select: { name: true } },
      driScores: {
        where: { milestoneId: null },
        orderBy: { calculatedAt: "desc" },
        take: 30,
        select: { score: true, calculatedAt: true },
      },
      milestones: {
        select: {
          id: true,
          name: true,
          kind: true,
          type: true,
          criticality: true,
          status: true,
          progress: true,
          parentId: true,
          startDate: true,
          plannedDate: true,
          forecastDate: true,
          actualDate: true,
          assignee: { select: { name: true } },
          driScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
          impediments: {
            where: { resolvedAt: null },
            select: {
              id: true,
              description: true,
              waitingOn: true,
              createdAt: true,
              owner: { select: { name: true } },
            },
          },
        },
      },
      requests: {
        select: {
          id: true,
          type: true,
          description: true,
          waitingOn: true,
          status: true,
          dueAt: true,
          createdAt: true,
          owner: { select: { name: true } },
          milestone: { select: { name: true } },
        },
      },
      documents: {
        select: {
          revisions: { select: REVISION_SELECT },
        },
      },
    },
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    osNumber: p.osNumber,
    status: p.status,
    currency: p.currency,
    clientName: p.clientRef?.name ?? null,
    sectorName: p.sector?.name ?? null,
    designFirmName: p.designFirm?.name ?? null,
    managerName: p.manager?.name ?? null,
    driScores: p.driScores,
    tasks: p.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      type: m.type,
      criticality: m.criticality,
      status: m.status,
      progress: m.progress,
      parentId: m.parentId,
      assigneeName: m.assignee?.name ?? null,
      startDate: m.startDate,
      plannedDate: m.plannedDate,
      forecastDate: m.forecastDate,
      actualDate: m.actualDate,
      dri: m.driScores[0]?.score ?? null,
    })),
    impediments: p.milestones.flatMap((m) =>
      m.impediments.map((i) => ({
        id: i.id,
        taskId: m.id,
        taskName: m.name,
        description: i.description,
        ownerName: i.owner?.name ?? null,
        waitingOn: i.waitingOn,
        createdAt: i.createdAt,
      })),
    ),
    requests: p.requests.map((r) => ({
      id: r.id,
      taskName: r.milestone?.name ?? null,
      type: r.type,
      description: r.description,
      ownerName: r.owner?.name ?? null,
      waitingOn: r.waitingOn,
      status: r.status,
      dueAt: r.dueAt,
      createdAt: r.createdAt,
    })),
    revisions: p.documents.flatMap((d) => d.revisions.map(toReportRevision)),
  }));
}

/**
 * Um pacote de revisão com revisões, trâmite, impedimentos, solicitações e
 * histórico de prazo. Devolve null se não existir, não for pacote ou o
 * usuário não enxergar o projeto.
 */
export async function loadReportPackage(
  user: Viewer,
  taskId: string,
): Promise<ReportPackageInput | null> {
  const m = await prisma.milestone.findFirst({
    where: { id: taskId, project: projectVisibility(user) },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      progress: true,
      plannedDate: true,
      forecastDate: true,
      actualDate: true,
      assignee: { select: { name: true } },
      parent: { select: { name: true } },
      project: {
        select: {
          name: true,
          osNumber: true,
          clientRef: { select: { name: true } },
          designFirm: { select: { name: true } },
        },
      },
      documentRevisions: {
        select: {
          ...REVISION_SELECT,
          transitions: {
            select: {
              id: true,
              action: true,
              actorName: true,
              assignedToName: true,
              analysisCodeTag: true,
              comment: true,
              daysInPreviousStage: true,
              createdAt: true,
            },
          },
        },
      },
      impediments: {
        where: { resolvedAt: null },
        select: {
          id: true,
          description: true,
          waitingOn: true,
          createdAt: true,
          owner: { select: { name: true } },
        },
      },
      requests: {
        where: { status: "PENDING" },
        select: {
          id: true,
          type: true,
          description: true,
          waitingOn: true,
          status: true,
          dueAt: true,
          createdAt: true,
          owner: { select: { name: true } },
        },
      },
      deadlineChanges: {
        select: { fromDate: true, toDate: true, reason: true, createdAt: true },
      },
    },
  });

  if (!m || !isPackageType(m.type)) return null;

  return {
    projectName: m.project.name,
    projectOsNumber: m.project.osNumber,
    clientName: m.project.clientRef?.name ?? null,
    designFirmName: m.project.designFirm?.name ?? null,
    id: m.id,
    name: m.name,
    parentName: m.parent?.name ?? null,
    status: m.status,
    progress: m.progress,
    assigneeName: m.assignee?.name ?? null,
    plannedDate: m.plannedDate,
    forecastDate: m.forecastDate,
    actualDate: m.actualDate,
    revisions: m.documentRevisions.map(toReportRevision),
    transitions: m.documentRevisions.flatMap((r) =>
      r.transitions.map((t) => ({
        id: t.id,
        revisionName: r.name,
        documentNumber: r.document.number,
        documentName: r.document.name,
        action: t.action,
        actorName: t.actorName,
        assignedToName: t.assignedToName,
        analysisTag: t.analysisCodeTag,
        comment: t.comment,
        daysInPreviousStage: t.daysInPreviousStage,
        createdAt: t.createdAt,
      })),
    ),
    impediments: m.impediments.map((i) => ({
      id: i.id,
      taskId: m.id,
      taskName: m.name,
      description: i.description,
      ownerName: i.owner?.name ?? null,
      waitingOn: i.waitingOn,
      createdAt: i.createdAt,
    })),
    requests: m.requests.map((r) => ({
      id: r.id,
      taskName: m.name,
      type: r.type,
      description: r.description,
      ownerName: r.owner?.name ?? null,
      waitingOn: r.waitingOn,
      status: r.status,
      dueAt: r.dueAt,
      createdAt: r.createdAt,
    })),
    deadlineChanges: m.deadlineChanges,
  };
}

/** Leitura do relatório de uma reunião — ata + pendências vinculadas. */
export async function loadReportMeeting(
  user: Viewer,
  meetingId: string,
): Promise<ReportMeetingInput | null> {
  const m = await prisma.meeting.findFirst({
    where: { id: meetingId, project: projectVisibility(user) },
    select: {
      id: true,
      date: true,
      title: true,
      location: true,
      startTime: true,
      preparedBy: true,
      number: true,
      subject: true,
      diverseSubjects: true,
      summary: true,
      project: {
        select: {
          name: true,
          osNumber: true,
          clientRef: { select: { name: true, meetingFormCode: true } },
          designFirm: { select: { name: true } },
        },
      },
      milestone: { select: { name: true } },
      participants: {
        orderBy: { order: "asc" },
        select: { name: true, company: true, email: true, mode: true },
      },
      topics: {
        orderBy: { order: "asc" },
        select: {
          category: true,
          title: true,
          date: true,
          description: true,
          responsible: true,
          dueDate: true,
          status: true,
        },
      },
      requests: {
        select: {
          id: true,
          type: true,
          description: true,
          waitingOn: true,
          status: true,
          dueAt: true,
          createdAt: true,
          owner: { select: { name: true } },
          milestone: { select: { name: true } },
        },
      },
    },
  });
  if (!m) return null;

  return {
    id: m.id,
    projectName: m.project.name,
    projectOsNumber: m.project.osNumber,
    clientName: m.project.clientRef?.name ?? null,
    meetingFormCode: m.project.clientRef?.meetingFormCode ?? null,
    designFirmName: m.project.designFirm?.name ?? null,
    parentName: m.milestone?.name ?? null,
    date: m.date,
    title: m.title,
    location: m.location,
    startTime: m.startTime,
    preparedBy: m.preparedBy,
    number: m.number,
    subject: m.subject,
    diverseSubjects: m.diverseSubjects,
    summary: m.summary,
    participants: m.participants,
    topics: m.topics,
    requests: m.requests.map((r) => ({
      id: r.id,
      taskName: r.milestone?.name ?? null,
      type: r.type,
      description: r.description,
      ownerName: r.owner?.name ?? null,
      waitingOn: r.waitingOn,
      status: r.status,
      dueAt: r.dueAt,
      createdAt: r.createdAt,
    })),
  };
}
