import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageProjects } from "@/lib/authz";
import { isProjectWritable } from "@/lib/tasks";
import { ReadOnlyBanner } from "@/components/task-ui";
import { Card, SectionTitle, Chip } from "@/components/ui";
import { DocumentTimeline } from "@/components/document-timeline";
import { RevisionList } from "@/components/revision-list";
import {
  SubmitRevisionForm,
  AnalysisForm,
  NewRevisionForm,
} from "@/components/revision-actions";
import {
  applicableCodes,
  isActionAllowed,
  isRevisionOpen,
  requiresNewRevision,
  nextRevisionName,
  summarizeCycles,
  type AnalysisCodeLike,
  type DocumentStatus,
} from "@/lib/documents";
import { formatDate } from "@/lib/format";
import type {
  DocumentDetailRow,
  DocumentTransitionRow,
  UserOption,
} from "@/types/models";

export const dynamic = "force-dynamic";

const REVISION_SELECT = {
  id: true,
  name: true,
  sequence: true,
  status: true,
  round: true,
  inReviewSince: true,
  issuedAt: true,
  dueAt: true,
  analyzedAt: true,
  externalUrl: true,
  notes: true,
  specialist: { select: { id: true, name: true } },
  analysisCode: { select: { id: true, tag: true, name: true } },
  _count: { select: { transitions: true } },
} as const;

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/documents/${id}`);

  const doc: DocumentDetailRow | null = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      name: true,
      type: true,
      notes: true,
      createdAt: true,
      project: { select: { id: true, name: true, status: true, organizationId: true } },
      discipline: { select: { id: true, tag: true, name: true } },
      designFirm: { select: { id: true, name: true } },
      responsible: { select: { id: true, name: true } },
      revisions: { orderBy: { sequence: "desc" }, select: REVISION_SELECT },
    },
  });

  // Documento não tem organizationId próprio — herda via projeto. Sem essa
  // checagem, o id de um documento de outra organização (adivinhado ou visto
  // em outro contexto) abriria a página normalmente.
  if (!doc || doc.project.organizationId !== user.organizationId) notFound();

  // Rastreamento consolidado: todos os eventos de todas as revisões.
  const transitions: DocumentTransitionRow[] = await prisma.documentTransition.findMany({
    where: { revision: { documentId: id } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      fromStatus: true,
      toStatus: true,
      analysisCodeTag: true,
      round: true,
      actorName: true,
      assignedToName: true,
      comment: true,
      dueAt: true,
      daysInPreviousStage: true,
      createdAt: true,
      revision: { select: { id: true, name: true } },
    },
  });

  const [specialists, codes]: [UserOption[], AnalysisCodeLike[]] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ["ADMIN", "MANAGER", "SPECIALIST"] },
        organizationId: user.organizationId,
      },
      select: { id: true, name: true, email: true, role: true, function: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.analysisCode.findMany({
      where: { isActive: true, organizationId: user.organizationId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, tag: true, name: true, effect: true },
    }),
  ]);

  const cycles = summarizeCycles(transitions);
  const current = doc.revisions[0] ?? null;
  const approved = doc.revisions.find((r) => r.status === "APPROVED") ?? null;

  // Retrabalho = revisões que voltaram comentadas ou reprovadas. Como cada
  // trâmite é uma revisão nova, contar revisões devolvidas é o indicador
  // direto de quantas idas e vindas o documento exigiu.
  const rework = doc.revisions.filter((r) =>
    requiresNewRevision(r.status as DocumentStatus),
  ).length;

  const openRevision = current && isRevisionOpen(current.status as DocumentStatus);

  // Projeto pausado/encerrado: o trâmite fica como histórico, sem novas ações.
  const writable = isProjectWritable(doc.project.status);

  const canAnalyze =
    writable &&
    current != null &&
    current.status === "IN_REVIEW" &&
    (current.specialist?.id === user.id || canManageProjects(user));

  const canSubmit =
    writable && current != null && isActionAllowed(current.status, "SUBMITTED");

  return (
    <div className="space-y-8">
      <section>
        <Link
          href={`/projects/${doc.project.id}/documents`}
          className="text-xs text-ink-faint hover:text-ink-soft"
        >
          ← Documentos de {doc.project.name}
        </Link>

        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {doc.number ? <span className="text-ink-faint">{doc.number} · </span> : null}
          {doc.name}
        </h1>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
          {doc.discipline ? (
            <span>
              {doc.discipline.tag} — {doc.discipline.name}
            </span>
          ) : null}
          {doc.type ? <span>· {doc.type}</span> : null}
          {doc.designFirm ? <span>· empresa {doc.designFirm.name}</span> : null}
          {doc.responsible ? <span>· emissor {doc.responsible.name}</span> : null}
        </p>
      </section>

      <ReadOnlyBanner status={doc.project.status} />

      <section className="grid gap-4 sm:grid-cols-4">
        <Card>
          <Metric label="Revisões" value={String(doc.revisions.length)} />
        </Card>
        <Card>
          <Metric label="Devolvidas" value={String(rework)} />
        </Card>
        <Card>
          <Metric label="Dias em análise" value={String(cycles.totalDaysInReview)} />
        </Card>
        <Card>
          <Metric
            label="Aprovação final"
            value={approved?.analyzedAt ? formatDate(approved.analyzedAt) : "—"}
          />
        </Card>
      </section>

      {rework >= 2 ? (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-800">
          Este documento já voltou {rework} vezes para a empresa. Retrabalho
          repetido costuma anteceder o atraso formal da tarefa — vale investigar
          o que não está sendo resolvido de uma revisão para a outra.
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <div>
            <SectionTitle hint={`${doc.revisions.length} revisão(ões)`}>
              Revisões
            </SectionTitle>
            <Card>
              <RevisionList revisions={doc.revisions} />
            </Card>
          </div>

          <div>
            <SectionTitle hint={`${transitions.length} evento(s)`}>
              Rastreamento — da criação ao encerramento
            </SectionTitle>
            <Card>
              <DocumentTimeline transitions={transitions} />
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          {canAnalyze && current ? (
            <div>
              <SectionTitle hint={`revisão ${current.name}`}>
                Registrar parecer
              </SectionTitle>
              <Card>
                <AnalysisForm
                  revisionId={current.id}
                  codes={applicableCodes(current.status, codes)}
                />
              </Card>
            </div>
          ) : null}

          {canSubmit && current ? (
            <div>
              <SectionTitle hint={`revisão ${current.name}`}>
                Emitir para análise
              </SectionTitle>
              <Card>
                <SubmitRevisionForm
                  revisionId={current.id}
                  specialists={specialists}
                />
              </Card>
            </div>
          ) : null}

          {writable && canManageProjects(user) ? (
            <div>
              <SectionTitle
                hint={openRevision ? `${current?.name} ainda em curso` : undefined}
              >
                Nova revisão
              </SectionTitle>
              <Card>
                {openRevision ? (
                  <p className="text-sm text-ink-faint">
                    A revisão {current?.name} ainda não teve desfecho. Cada
                    trâmite é uma revisão nova — conclua a análise antes de
                    registrar a próxima.
                  </p>
                ) : (
                  <NewRevisionForm
                    documentId={doc.id}
                    suggestedName={nextRevisionName(current?.name ?? null)}
                  />
                )}
              </Card>
            </div>
          ) : null}

          <div>
            <SectionTitle>Dados</SectionTitle>
            <Card className="space-y-2 text-sm">
              <p className="flex justify-between gap-3">
                <span className="text-ink-faint">Criado em</span>
                <span>{formatDate(doc.createdAt)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-ink-faint">Revisão atual</span>
                <span>{current?.name ?? "—"}</span>
              </p>
              {doc.notes ? (
                <p className="border-t border-line pt-2 text-ink-soft">{doc.notes}</p>
              ) : null}
              <p className="border-t border-line pt-2 text-xs text-ink-faint">
                O DataPulse registra apenas a informação sobre o documento.{" "}
                <Chip>o arquivo permanece no sistema do cliente</Chip>
              </p>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
