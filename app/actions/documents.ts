"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireWriter, canManageProjects } from "@/lib/authz";
import { isProjectWritable, READONLY_MESSAGE } from "@/lib/tasks";
import { assertPackageUsable, recomputePackages } from "@/lib/server/package-service";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import {
  actionForEffect,
  daysBetween,
  isActionAllowed,
  isRevisionOpen,
  nextRevisionName,
  nextRound,
  statusAfter,
  type AnalysisEffect,
  type DocumentAction,
  type DocumentStatus,
} from "@/lib/documents";
import { canSeeProject } from "@/lib/server/project-access";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optDate(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pacote mudou de estado: quadro do projeto, painel e "minhas demandas" também. */
function revalidatePackages(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  revalidatePath("/my-work");
}

export interface DocumentFormState {
  error?: string;
  /** Rótulo do último documento cadastrado, para confirmar sem sair da tela. */
  created?: string;
  /** Muda a cada sucesso — é o gatilho para o formulário se limpar. */
  at?: number;
}

/**
 * Cria o documento já com a revisão inicial e o primeiro evento do histórico.
 *
 * O documento nunca existe "sem revisão": todo documento nasce com uma, para
 * o rastreamento começar na origem e não haver estado intermediário inválido.
 *
 * Devolve estado em vez de redirecionar: a lista documental é digitada em
 * série, então a tela precisa confirmar o cadastro e ficar pronta para o
 * próximo documento — não navegar para outro lugar a cada linha.
 */
export async function createDocument(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const user = await requireRole(["ADMIN", "MANAGER"]);

  const projectId = str(formData, "projectId");
  const name = str(formData, "name");
  const number = str(formData, "number");

  if (!projectId) return { error: "Selecione o projeto." };
  if (!name) return { error: "Informe ao menos o nome do documento." };

  // Documento/revisão não têm organizationId próprio — herdam o escopo do
  // projeto. Por isso o projeto precisa ser confirmado como da organização
  // de quem está criando antes de qualquer outra checagem.
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: { id: true, status: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!isProjectWritable(project.status)) return { error: READONLY_MESSAGE };

  const disciplineId = str(formData, "disciplineId") || null;
  const designFirmId = str(formData, "designFirmId") || null;
  const responsibleId = str(formData, "responsibleId") || null;

  // Disciplina, empresa e responsável são cadastros da organização — evita
  // vincular o documento a um registro de outro tenant via id trocado.
  const [discipline, designFirm, responsible] = await Promise.all([
    disciplineId
      ? prisma.discipline.findFirst({
          where: { id: disciplineId, organizationId: user.organizationId },
          select: { id: true },
        })
      : Promise.resolve(null),
    designFirmId
      ? prisma.empresa.findFirst({
          where: { id: designFirmId, organizationId: user.organizationId },
          select: { id: true },
        })
      : Promise.resolve(null),
    responsibleId
      ? prisma.user.findFirst({
          where: { id: responsibleId, organizationId: user.organizationId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (disciplineId && !discipline) return { error: "Disciplina inválida." };
  if (designFirmId && !designFirm) return { error: "Empresa inválida." };
  if (responsibleId && !responsible) return { error: "Responsável inválido." };

  // Cadastrar o mesmo documento duas vezes quebraria o rastreamento: dois
  // registros para a mesma coisa, cada um com metade do histórico.
  //
  // O que identifica é o par número + nome, não o número sozinho: o mesmo
  // código costuma existir em mais de um arquivo (.dwg, .pdf, .ifc) e cada um
  // tem seu próprio trâmite — é assim no controle que os clientes já mantêm.
  const clash = await prisma.document.findFirst({
    where: { projectId, name, ...(number ? { number } : {}) },
    select: { id: true },
  });
  if (clash) {
    return { error: `Já existe um documento "${name}" neste projeto.` };
  }

  // Toda revisão nasce dentro de um pacote (Tarefa), que por sua vez fica
  // dentro de um Marco. Sem pacote o documento não entra no fluxo do projeto.
  const packageId = str(formData, "packageId");
  const packageError = await assertPackageUsable(packageId, projectId, user.organizationId);
  if (packageError) return { error: packageError };

  const revisionName = str(formData, "revisionName") || "R00";

  await prisma.document.create({
    data: {
      projectId,
      name,
      number: number || null,
      type: str(formData, "type") || null,
      disciplineId,
      designFirmId,
      responsibleId,
      notes: str(formData, "notes") || null,
      revisions: {
        create: {
          name: revisionName,
          milestoneId: packageId,
          sequence: 0,
          status: "DRAFT",
          round: 0,
          issuedAt: optDate(formData, "issuedAt"),
          dueAt: optDate(formData, "dueAt"),
          externalUrl: str(formData, "externalUrl") || null,
          transitions: {
            create: {
              action: "CREATED",
              fromStatus: null,
              toStatus: "DRAFT",
              round: 0,
              actorId: user.id,
              actorName: user.name,
              comment: str(formData, "notes") || null,
            },
          },
        },
      },
    },
  });

  await recomputePackages([packageId]);

  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath("/documents");
  revalidatePackages(projectId);

  return { created: number ? `${number} — ${name}` : name, at: Date.now() };
}

export interface TransitionState {
  error?: string;
  ok?: boolean;
}

/**
 * Emite a revisão para análise.
 *
 * Separado do registro de parecer porque são atos de papéis diferentes: quem
 * emite é o projetista/emissor; quem dá parecer é o especialista.
 */
export async function submitRevision(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const user = await requireWriter();

  const revisionId = str(formData, "revisionId");
  if (!revisionId) return { error: "Revisão não identificada." };

  const revision = await prisma.documentRevision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      status: true,
      round: true,
      updatedAt: true,
      inReviewSince: true,
      milestoneId: true,
      document: {
        select: {
          id: true,
          projectId: true,
          project: { select: { status: true, organizationId: true } },
        },
      },
    },
  });
  if (!revision) return { error: "Revisão não encontrada." };
  if (
    revision.document.project.organizationId !== user.organizationId ||
    !(await canSeeProject(user, revision.document.projectId))
  ) {
    return { error: "Revisão não encontrada." };
  }
  if (!isProjectWritable(revision.document.project.status)) return { error: READONLY_MESSAGE };

  const fromStatus = revision.status as DocumentStatus;
  if (!isActionAllowed(fromStatus, "SUBMITTED")) {
    return { error: "Esta revisão não pode ser emitida para análise agora." };
  }

  const specialistId = str(formData, "specialistId") || null;
  let specialistName: string | null = null;
  if (specialistId) {
    const s = await prisma.user.findFirst({
      where: { id: specialistId, organizationId: user.organizationId },
      select: { name: true },
    });
    if (!s) return { error: "Especialista inválido." };
    specialistName = s.name;
  }

  const now = new Date();
  const round = nextRound(revision.round, "SUBMITTED");
  const dueAt = optDate(formData, "dueAt");

  await prisma.$transaction([
    prisma.documentTransition.create({
      data: {
        revisionId: revision.id,
        action: "SUBMITTED",
        fromStatus,
        toStatus: "IN_REVIEW",
        round,
        actorId: user.id,
        actorName: user.name,
        assignedToId: specialistId,
        assignedToName: specialistName,
        comment: str(formData, "comment") || null,
        dueAt,
        daysInPreviousStage: daysBetween(now, revision.updatedAt),
      },
    }),
    prisma.documentRevision.update({
      where: { id: revision.id },
      data: {
        status: "IN_REVIEW",
        round,
        inReviewSince: now,
        specialistId,
        dueAt,
        analysisCodeId: null,
        analyzedAt: null,
      },
    }),
  ]);

  await recomputePackages([revision.milestoneId]);
  await recalculateProjectDRI(revision.document.projectId);

  revalidatePath(`/documents/${revision.document.id}`);
  revalidatePath(`/projects/${revision.document.projectId}/documents`);
  revalidatePath("/documents");
  revalidatePackages(revision.document.projectId);

  return { ok: true };
}

/**
 * Registra o parecer do especialista.
 *
 * O que a ação faz é determinado pelo EFEITO do código escolhido, não pelo
 * código em si — é o que permite ao cliente cadastrar códigos próprios sem
 * alterar o código-fonte.
 */
export async function recordAnalysis(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const user = await requireWriter();

  const revisionId = str(formData, "revisionId");
  const analysisCodeId = str(formData, "analysisCodeId");
  if (!revisionId || !analysisCodeId) return { error: "Dados incompletos." };

  const [revision, code] = await Promise.all([
    prisma.documentRevision.findUnique({
      where: { id: revisionId },
      select: {
        id: true,
        status: true,
        round: true,
        inReviewSince: true,
        specialistId: true,
        milestoneId: true,
        document: {
          select: {
            id: true,
            projectId: true,
            project: { select: { status: true, organizationId: true } },
          },
        },
      },
    }),
    prisma.analysisCode.findFirst({
      where: { id: analysisCodeId, organizationId: user.organizationId },
      select: { id: true, tag: true, name: true, effect: true, isActive: true },
    }),
  ]);

  if (!revision) return { error: "Revisão não encontrada." };
  if (
    revision.document.project.organizationId !== user.organizationId ||
    !(await canSeeProject(user, revision.document.projectId))
  ) {
    return { error: "Revisão não encontrada." };
  }
  if (!isProjectWritable(revision.document.project.status)) return { error: READONLY_MESSAGE };
  if (!code || !code.isActive) return { error: "Código de análise inválido." };

  // Só o especialista designado ou quem gerencia o projeto pode dar parecer.
  if (revision.specialistId && revision.specialistId !== user.id) {
    if (!canManageProjects(user)) {
      return { error: "Você não é o especialista designado para esta revisão." };
    }
  }

  const fromStatus = revision.status as DocumentStatus;
  const action: DocumentAction = actionForEffect(code.effect as AnalysisEffect);

  if (!isActionAllowed(fromStatus, action)) {
    return {
      error: `O parecer "${code.tag}" não se aplica a uma revisão em "${fromStatus}". Recarregue a tela.`,
    };
  }

  const now = new Date();
  const toStatus = statusAfter(action);

  await prisma.$transaction([
    prisma.documentTransition.create({
      data: {
        revisionId: revision.id,
        action,
        fromStatus,
        toStatus,
        round: revision.round,
        analysisCodeId: code.id,
        analysisCodeTag: code.tag,
        actorId: user.id,
        actorName: user.name,
        comment: str(formData, "comment") || null,
        daysInPreviousStage: daysBetween(now, revision.inReviewSince),
      },
    }),
    prisma.documentRevision.update({
      where: { id: revision.id },
      data: {
        status: toStatus,
        analysisCodeId: code.id,
        analyzedAt: now,
        inReviewSince: null,
      },
    }),
  ]);

  await recomputePackages([revision.milestoneId]);
  await recalculateProjectDRI(revision.document.projectId);

  revalidatePath(`/documents/${revision.document.id}`);
  revalidatePath(`/projects/${revision.document.projectId}/documents`);
  revalidatePath("/documents");
  revalidatePackages(revision.document.projectId);

  return { ok: true };
}

/**
 * Emite uma nova revisão do documento.
 *
 * A revisão anterior é marcada como substituída — nunca apagada. O histórico
 * completo do documento é a leitura das revisões em sequência.
 */
export async function createRevision(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const user = await requireRole(["ADMIN", "MANAGER"]);

  const documentId = str(formData, "documentId");
  if (!documentId) return { error: "Documento não identificado." };

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      projectId: true,
      project: { select: { status: true, organizationId: true } },
      revisions: {
        orderBy: { sequence: "desc" },
        take: 1,
        select: { id: true, name: true, sequence: true, status: true, milestoneId: true },
      },
    },
  });
  if (!document) return { error: "Documento não encontrado." };
  if (document.project.organizationId !== user.organizationId) {
    return { error: "Documento não encontrado." };
  }
  if (!isProjectWritable(document.project.status)) return { error: READONLY_MESSAGE };

  const last = document.revisions[0];

  // Só existe uma revisão em curso por vez: a projetista não envia o pacote
  // seguinte enquanto o anterior não teve desfecho.
  if (last && isRevisionOpen(last.status as DocumentStatus)) {
    return {
      error:
        last.status === "IN_REVIEW"
          ? `A revisão ${last.name} ainda está em análise. Conclua o parecer antes de emitir a próxima.`
          : `A revisão ${last.name} ainda não foi enviada para análise.`,
    };
  }

  // A nova revisão é emitida num pacote (normalmente um pacote novo, como no
  // ACC: cada emissão é uma tarefa). Marco pai e pacote são obrigatórios.
  const packageId = str(formData, "packageId");
  const packageError = await assertPackageUsable(
    packageId,
    document.projectId,
    user.organizationId,
  );
  if (packageError) return { error: packageError };

  const name = str(formData, "name") || nextRevisionName(last?.name ?? null);

  const duplicate = await prisma.documentRevision.findFirst({
    where: { documentId, name },
    select: { id: true },
  });
  if (duplicate) return { error: `Já existe a revisão "${name}" neste documento.` };

  const now = new Date();

  // Só uma revisão APROVADA é marcada como substituída ao ser sucedida.
  // Comentada ou reprovada mantém seu desfecho: sobrescrever com SUPERSEDED
  // apagaria justamente o motivo pelo qual houve outra revisão.
  const supersedePrevious = last?.status === "APPROVED";

  await prisma.$transaction([
    ...(last && supersedePrevious
      ? [
          prisma.documentRevision.update({
            where: { id: last.id },
            data: { status: "SUPERSEDED" },
          }),
          prisma.documentTransition.create({
            data: {
              revisionId: last.id,
              action: "SUPERSEDED",
              fromStatus: last.status,
              toStatus: "SUPERSEDED",
              round: 0,
              actorId: user.id,
              actorName: user.name,
              comment: `Substituída pela revisão ${name}.`,
            },
          }),
        ]
      : []),
    prisma.documentRevision.create({
      data: {
        documentId,
        name,
        milestoneId: packageId,
        sequence: (last?.sequence ?? -1) + 1,
        status: "DRAFT",
        round: 0,
        issuedAt: optDate(formData, "issuedAt") ?? now,
        externalUrl: str(formData, "externalUrl") || null,
        notes: str(formData, "notes") || null,
        transitions: {
          create: {
            action: "REVISED",
            fromStatus: null,
            toStatus: "DRAFT",
            round: 0,
            actorId: user.id,
            actorName: user.name,
            comment: str(formData, "notes") || null,
          },
        },
      },
    }),
  ]);

  // Emitir a sucessora fecha o trabalho da revisão anterior no pacote dela
  // (comentada/reprovada deixa de estar "com o emissor"), e abre trabalho no novo.
  await recomputePackages([last?.milestoneId, packageId]);
  await recalculateProjectDRI(document.projectId);

  revalidatePath(`/documents/${documentId}`);
  revalidatePath(`/projects/${document.projectId}/documents`);
  revalidatePackages(document.projectId);

  return { ok: true };
}

/** Edita apenas os metadados do documento. Não toca status nem histórico. */
export async function updateDocumentMetadata(formData: FormData): Promise<void> {
  const user = await requireRole(["ADMIN", "MANAGER"]);

  const documentId = str(formData, "documentId");
  if (!documentId) return;

  const current = await prisma.document.findUnique({
    where: { id: documentId },
    select: { project: { select: { status: true, organizationId: true } } },
  });
  if (!current || current.project.organizationId !== user.organizationId) return;
  if (!isProjectWritable(current.project.status)) return;

  const disciplineId = str(formData, "disciplineId") || null;
  const designFirmId = str(formData, "designFirmId") || null;
  const responsibleId = str(formData, "responsibleId") || null;

  const [discipline, designFirm, responsible] = await Promise.all([
    disciplineId
      ? prisma.discipline.findFirst({
          where: { id: disciplineId, organizationId: user.organizationId },
          select: { id: true },
        })
      : Promise.resolve(null),
    designFirmId
      ? prisma.empresa.findFirst({
          where: { id: designFirmId, organizationId: user.organizationId },
          select: { id: true },
        })
      : Promise.resolve(null),
    responsibleId
      ? prisma.user.findFirst({
          where: { id: responsibleId, organizationId: user.organizationId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (disciplineId && !discipline) return;
  if (designFirmId && !designFirm) return;
  if (responsibleId && !responsible) return;

  const doc = await prisma.document.update({
    where: { id: documentId },
    data: {
      name: str(formData, "name") || undefined,
      number: str(formData, "number") || null,
      type: str(formData, "type") || null,
      disciplineId,
      designFirmId,
      responsibleId,
      notes: str(formData, "notes") || null,
    },
    select: { projectId: true },
  });

  revalidatePath(`/documents/${documentId}`);
  revalidatePath(`/projects/${doc.projectId}/documents`);
}

export interface DeleteResult {
  ok?: boolean;
  error?: string;
}

/**
 * Exclui o documento inteiro: revisões, passagens e histórico vão junto, e os
 * vínculos com solicitações se desfazem (as solicitações ficam). É a única
 * forma de remover um documento cadastrado por engano.
 */
export async function deleteDocument(formData: FormData): Promise<DeleteResult> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const documentId = str(formData, "documentId");
  if (!documentId) return { error: "Documento não identificado." };

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      projectId: true,
      project: { select: { status: true, organizationId: true } },
      revisions: { select: { milestoneId: true } },
    },
  });
  if (!doc || doc.project.organizationId !== user.organizationId) {
    return { error: "Documento não encontrado." };
  }
  if (!isProjectWritable(doc.project.status)) return { error: READONLY_MESSAGE };

  await prisma.document.delete({ where: { id: documentId } });
  await recomputePackages(doc.revisions.map((r) => r.milestoneId));
  revalidatePackages(doc.projectId);

  revalidatePath(`/projects/${doc.projectId}/documents`);
  revalidatePath("/documents");
  revalidatePath("/my-work");
  return { ok: true };
}
