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
  isRegistrationEvent,
  isRevisionOpen,
  nextRevisionName,
  nextRound,
  parseSheetFormat,
  resolveActionDate,
  statusAfter,
  submissionFloor,
  type AnalysisEffect,
  type DocumentAction,
  type DocumentStatus,
} from "@/lib/documents";
import { canSeeProject } from "@/lib/server/project-access";
import { reviewDueDate } from "@/lib/business-days";

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

  // Pacote é a emissão para o cliente. Documento ainda em produção nasce sem
  // pacote, com o prazo de produção; o pacote é escolhido no envio.
  const packageId = str(formData, "packageId") || null;
  if (packageId) {
    const packageError = await assertPackageUsable(packageId, projectId, user.organizationId);
    if (packageError) return { error: packageError };
  }

  const revisionName = str(formData, "revisionName") || "R00";

  // Vencimento padrão: entrada (envio da projetista) + 5 dias úteis. O prazo
  // digitado é a exceção do gerente. Sem data de envio, o prazo nasce quando a
  // revisão for emitida para análise.
  // Sem pacote, o prazo digitado é o de produção (não se calcula nada).
  const issuedAt = optDate(formData, "issuedAt");
  const typedDueAt = optDate(formData, "dueAt");
  const dueAt = packageId
    ? typedDueAt ?? (issuedAt ? reviewDueDate(issuedAt) : null)
    : typedDueAt;

  await prisma.document.create({
    data: {
      projectId,
      name,
      number: number || null,
      type: str(formData, "type") || null,
      sheetFormat: parseSheetFormat(str(formData, "sheetFormat")),
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
          issuedAt,
          dueAt,
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
              // Em produção: guarda o prazo de produção no histórico, porque
              // o prazo da revisão será trocado pelo de análise no envio.
              dueAt: packageId ? null : dueAt,
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
      issuedAt: true,
      dueAt: true,
      milestoneId: true,
      sequence: true,
      document: {
        select: {
          id: true,
          projectId: true,
          responsibleId: true,
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
  // Especialista enxerga o projeto todo, mas só emite documento que é dele.
  if (!canManageProjects(user) && revision.document.responsibleId !== user.id) {
    return { error: "Só o gerente ou o responsável pelo documento podem emiti-lo." };
  }

  const fromStatus = revision.status as DocumentStatus;
  if (!isActionAllowed(fromStatus, "SUBMITTED")) {
    return { error: "Esta revisão não pode ser emitida para análise agora." };
  }

  // Revisão em produção (sem pacote) entra num pacote no envio: o pacote é a
  // emissão para o cliente. Quem já está num pacote mantém o seu.
  let packageId = revision.milestoneId;
  const enteringPackage = !packageId;
  if (enteringPackage) {
    packageId = str(formData, "packageId") || null;
    if (!packageId) return { error: "Escolha o pacote em que o documento será enviado." };
    const packageError = await assertPackageUsable(
      packageId,
      revision.document.projectId,
      user.organizationId,
    );
    if (packageError) return { error: packageError };
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

  // Data do envio informada no formulário (padrão: agora). Pode ser passada:
  // documento já feito e enviado antes de ser cadastrado no DataPulse entra
  // com a data real. O piso é só o que de fato aconteceu — o desfecho da
  // revisão anterior e eventos de trâmite desta —, nunca a data do cadastro.
  const [events, predecessor] = await Promise.all([
    prisma.documentTransition.findMany({
      where: { revisionId: revision.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, createdAt: true },
    }),
    revision.sequence > 0
      ? prisma.documentRevision.findFirst({
          where: { documentId: revision.document.id, sequence: { lt: revision.sequence } },
          orderBy: { sequence: "desc" },
          select: { analyzedAt: true },
        })
      : Promise.resolve(null),
  ]);
  const floor = submissionFloor(
    events.map((e) => ({ action: e.action as DocumentAction, createdAt: e.createdAt })),
    predecessor?.analyzedAt,
  );
  const when = resolveActionDate(
    str(formData, "occurredAt"),
    new Date(),
    floor,
    predecessor?.analyzedAt && floor?.getTime() === predecessor.analyzedAt.getTime()
      ? "o parecer da revisão anterior"
      : "o último evento do trâmite",
  );
  if ("error" in when) return { error: when.error };
  const now = when.at;

  // Cadastro retroativo: o evento de cadastro (criado / nova revisão) foi
  // gravado depois do envio informado. Ele passa para logo antes do envio,
  // para o rastreamento seguir a ordem real e a contagem de dias não inverter.
  const backdated = events
    .filter((e) => isRegistrationEvent(e.action as DocumentAction) && e.createdAt.getTime() >= now.getTime())
    .map((e) => e.id);
  const registrationAt = new Date(now.getTime() - 1000);
  const lastEvent = events.at(-1);
  const lastEventAt =
    lastEvent && backdated.includes(lastEvent.id) ? registrationAt : lastEvent?.createdAt;
  // "Emitido em" posterior ao envio informado também era data de cadastro.
  const issuedAt =
    revision.issuedAt && revision.issuedAt.getTime() > now.getTime() ? now : revision.issuedAt;
  const round = nextRound(revision.round, "SUBMITTED");
  // Vencimento: o gerente pode fixar uma exceção; senão vale o prazo que a
  // revisão já tem (entrada + 5 dias úteis desde o cadastro) ou, em revisão
  // sem prazo (legado), entrada + 5 dias úteis calculado agora. O emissor que
  // não é gerente não altera o prazo: o formulário chega desabilitado e o
  // servidor ignora o campo de qualquer forma.
  const managerDueAt = canManageProjects(user) ? optDate(formData, "dueAt") : null;
  // Saindo da produção, o prazo que a revisão tinha era o de produção (fica
  // registrado no evento de criação); o de análise conta da data de envio.
  const dueAt =
    managerDueAt ??
    (enteringPackage || issuedAt !== revision.issuedAt
      ? reviewDueDate(now)
      : revision.dueAt ?? reviewDueDate(issuedAt ?? now));

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
        daysInPreviousStage: daysBetween(now, lastEventAt ?? revision.updatedAt),
        createdAt: now,
      },
    }),
    ...(backdated.length
      ? [
          prisma.documentTransition.updateMany({
            where: { id: { in: backdated } },
            data: { createdAt: registrationAt },
          }),
        ]
      : []),
    prisma.documentRevision.update({
      where: { id: revision.id },
      data: {
        status: "IN_REVIEW",
        round,
        inReviewSince: now,
        specialistId,
        dueAt,
        issuedAt: issuedAt ?? (enteringPackage ? now : null),
        ...(enteringPackage ? { milestoneId: packageId } : {}),
        analysisCodeId: null,
        analyzedAt: null,
      },
    }),
  ]);

  await recomputePackages([packageId]);
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
            responsibleId: true,
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
  // Sem designado, vale o responsável pelo documento; nunca "qualquer especialista".
  if (!canManageProjects(user)) {
    const allowed = revision.specialistId
      ? revision.specialistId === user.id
      : revision.document.responsibleId === user.id;
    if (!allowed) {
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

  // Data do retorno informada no formulário (padrão: agora). Não pode ser
  // anterior ao envio para análise nem futura.
  const when = resolveActionDate(str(formData, "occurredAt"), new Date(), revision.inReviewSince, "o envio para análise");
  if ("error" in when) return { error: when.error };
  const at = when.at;
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
        daysInPreviousStage: daysBetween(at, revision.inReviewSince),
        createdAt: at,
      },
    }),
    prisma.documentRevision.update({
      where: { id: revision.id },
      data: {
        status: toStatus,
        analysisCodeId: code.id,
        analyzedAt: at,
        inReviewSince: null,
      },
    }),
    // Parecer dado com delegação ainda pendente: o pedido perde o sentido.
    prisma.analysisDelegation.updateMany({
      where: { revisionId: revision.id, status: "PENDING" },
      data: {
        status: "CANCELLED",
        respondedAt: now,
        responseNote: "Revisão analisada antes da resposta.",
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

  // A nova revisão é enviada num pacote (normalmente um pacote novo, como no
  // ACC: cada emissão é uma tarefa). Sem pacote, ela fica em produção e o
  // pacote é escolhido no envio para análise.
  const packageId = str(formData, "packageId") || null;
  if (packageId) {
    const packageError = await assertPackageUsable(
      packageId,
      document.projectId,
      user.organizationId,
    );
    if (packageError) return { error: packageError };
  }

  const name = str(formData, "name") || nextRevisionName(last?.name ?? null);

  const duplicate = await prisma.documentRevision.findFirst({
    where: { documentId, name },
    select: { id: true },
  });
  if (duplicate) return { error: `Já existe a revisão "${name}" neste documento.` };

  const now = new Date();
  // Em produção a revisão ainda não foi emitida: a data nasce no envio.
  const issuedAt = optDate(formData, "issuedAt") ?? (packageId ? now : null);
  // Com pacote: novo ciclo, novo prazo de análise (entrada + 5 dias úteis).
  // Em produção: o prazo digitado é o de produção.
  const productionDueAt = packageId ? null : optDate(formData, "dueAt");

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
        issuedAt,
        dueAt: packageId && issuedAt ? reviewDueDate(issuedAt) : productionDueAt,
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
            dueAt: productionDueAt,
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

/**
 * Designa (ou troca) o projetista responsável por elaborar e emitir o
 * documento — típico de documento em produção, cadastrado por quem gerencia e
 * repassado a quem vai desenhar. O gerente designa qualquer pessoa da
 * organização (inclusive Terceirizado/Projetista sem login); o projetista
 * designado pode repassar o documento a outra pessoa.
 */
export async function assignDocumentIssuer(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const user = await requireWriter();

  const documentId = str(formData, "documentId");
  if (!documentId) return { error: "Documento não identificado." };
  const responsibleId = str(formData, "responsibleId") || null;

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      responsibleId: true,
      projectId: true,
      project: { select: { status: true, organizationId: true } },
    },
  });
  if (
    !doc ||
    doc.project.organizationId !== user.organizationId ||
    !(await canSeeProject(user, doc.projectId))
  ) {
    return { error: "Documento não encontrado." };
  }
  if (!isProjectWritable(doc.project.status)) return { error: READONLY_MESSAGE };
  if (!canManageProjects(user) && doc.responsibleId !== user.id) {
    return { error: "Só o gerente ou o projetista atual podem repassar o documento." };
  }
  // Quem não gerencia só repassa a alguém; não deixa o documento sem dono.
  if (!responsibleId && !canManageProjects(user)) {
    return { error: "Escolha para quem repassar o documento." };
  }
  if (responsibleId === doc.responsibleId) return { ok: true };

  if (responsibleId) {
    const target = await prisma.user.findFirst({
      where: { id: responsibleId, organizationId: user.organizationId, isActive: true },
      select: { id: true },
    });
    if (!target) return { error: "Pessoa inválida." };
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { responsibleId },
  });

  revalidatePath(`/documents/${documentId}`);
  revalidatePath(`/projects/${doc.projectId}/documents`);
  revalidatePath("/documents");
  revalidatePath("/my-work");
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
      sheetFormat: parseSheetFormat(str(formData, "sheetFormat")),
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

export interface RescheduleRevisionState {
  error?: string;
  ok?: boolean;
  /** Muda a cada sucesso — gatilho para o formulário fechar. */
  at?: number;
}

/**
 * Reprograma o prazo da revisão vigente (de produção ou de análise). Só gerente.
 *
 * Grava "era X, passou para Y" no histórico (DeadlineChange), no mesmo padrão
 * da reprogramação de solicitação. Também acerta o prazo do evento que abriu
 * a etapa atual (envio para análise ou cadastro em produção), para a tabela
 * de passagens mostrar o prazo vigente; o original fica no histórico.
 */
export async function rescheduleRevision(
  _prev: RescheduleRevisionState,
  formData: FormData,
): Promise<RescheduleRevisionState> {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const revisionId = str(formData, "revisionId");
  if (!revisionId) return { error: "Revisão não identificada." };

  const revision = await prisma.documentRevision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      status: true,
      dueAt: true,
      milestoneId: true,
      document: {
        select: {
          id: true,
          projectId: true,
          project: { select: { status: true, organizationId: true } },
          revisions: { orderBy: { sequence: "desc" }, take: 1, select: { id: true } },
        },
      },
    },
  });
  if (!revision || revision.document.project.organizationId !== user.organizationId) {
    return { error: "Revisão não encontrada." };
  }
  if (!isProjectWritable(revision.document.project.status)) return { error: READONLY_MESSAGE };
  if (revision.document.revisions[0]?.id !== revision.id) {
    return { error: "Só a revisão vigente pode ter o prazo alterado." };
  }
  if (revision.status !== "DRAFT" && revision.status !== "IN_REVIEW") {
    return { error: "O prazo só pode ser alterado em produção ou em análise." };
  }

  const nextDueAt = optDate(formData, "dueAt");
  if (!nextDueAt) return { error: "Informe o novo prazo." };
  if (revision.dueAt && revision.dueAt.getTime() === nextDueAt.getTime()) {
    return { error: "O novo prazo é igual ao atual." };
  }

  // Evento que abriu a etapa atual: o envio, em análise; o cadastro, em produção.
  // Revisão já num pacote mas ainda não enviada não guarda prazo no cadastro.
  const touchesStageEvent = revision.status === "IN_REVIEW" || !revision.milestoneId;
  const stageEvent = !touchesStageEvent ? null : await prisma.documentTransition.findFirst({
    where: {
      revisionId: revision.id,
      action: { in: revision.status === "IN_REVIEW" ? ["SUBMITTED"] : ["CREATED", "REVISED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.documentRevision.update({ where: { id: revision.id }, data: { dueAt: nextDueAt } }),
    prisma.deadlineChange.create({
      data: {
        revisionId: revision.id,
        fromDate: revision.dueAt,
        toDate: nextDueAt,
        reason: str(formData, "reason") || null,
        changedById: user.id,
      },
    }),
    ...(stageEvent
      ? [prisma.documentTransition.update({ where: { id: stageEvent.id }, data: { dueAt: nextDueAt } })]
      : []),
  ]);

  if (revision.milestoneId) await recomputePackages([revision.milestoneId]);
  await recalculateProjectDRI(revision.document.projectId);

  revalidatePath(`/documents/${revision.document.id}`);
  revalidatePath(`/projects/${revision.document.projectId}/documents`);
  revalidatePath("/documents");
  revalidatePackages(revision.document.projectId);

  return { ok: true, at: Date.now() };
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
