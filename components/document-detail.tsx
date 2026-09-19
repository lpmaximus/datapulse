import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageProjects } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { DeleteButton } from "@/components/delete-button";
import { deleteDocument } from "@/app/actions/documents";
import { isProjectWritable } from "@/lib/tasks";
import { ReadOnlyBanner } from "@/components/task-ui";
import { Card, SectionTitle, Chip, Button, Field, inputClass } from "@/components/ui";
import { DocumentPassages } from "@/components/document-passages";
import { updateDocumentMetadata } from "@/app/actions/documents";
import { DocumentTimeline } from "@/components/document-timeline";
import { RevisionList } from "@/components/revision-list";
import {
  SubmitRevisionForm,
  AnalysisForm,
  NewRevisionForm,
} from "@/components/revision-actions";
import {
  applicableCodes,
  buildPassages,
  isActionAllowed,
  isRevisionOpen,
  requiresNewRevision,
  nextRevisionName,
  summarizeCycles,
  type AnalysisCodeLike,
  type DocumentStatus,
} from "@/lib/documents";
import { formatDate } from "@/lib/format";
import { loadPackageOptions } from "@/lib/server/package-options";
import type {
  DocumentDetailRow,
  DocumentTransitionRow,
  UserOption,
} from "@/types/models";

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
  milestone: { select: { id: true, name: true, parent: { select: { name: true } } } },
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

/**
 * Conteúdo do registro de documento — tela completa (`variant="page"`) ou
 * pop-up da lista (`variant="modal"`).
 */
export async function DocumentDetail({
  id,
  user,
  variant = "page",
}: {
  id: string;
  user: SessionUser;
  variant?: "page" | "modal";
}) {
  const modal = variant === "modal";

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
      disciplineId: true,
      designFirmId: true,
      responsibleId: true,
      revisions: { orderBy: { sequence: "desc" }, select: REVISION_SELECT },
    },
  });

  // Documento não tem organizationId próprio — herda via projeto. Sem essa
  // checagem, o id de um documento de outra organização (adivinhado ou visto
  // em outro contexto) abriria a página normalmente.
  if (!doc || doc.project.organizationId !== user.organizationId) return modal ? <Missing /> : notFound();

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

  const packages = await loadPackageOptions(user.organizationId, doc.project.id);

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

  // Cadastros para o formulário de edição dos dados — só para quem pode editar.
  const canEditData = canManageProjects(user) && isProjectWritable(doc.project.status);
  const [disciplines, firms, allUsers] = canEditData
    ? await Promise.all([
        prisma.discipline.findMany({
          where: { isActive: true, organizationId: user.organizationId },
          orderBy: { tag: "asc" },
          select: { id: true, tag: true, name: true },
        }),
        prisma.empresa.findMany({
          where: { isActive: true, organizationId: user.organizationId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.user.findMany({
          where: { isActive: true, organizationId: user.organizationId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], [], []];

  const now = new Date();
  const passages = buildPassages(transitions, now);
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
        {!modal ? (
          <Link
            href={`/projects/${doc.project.id}/documents`}
            className="text-xs text-ink-faint hover:text-ink-soft"
          >
            ← Documentos de {doc.project.name}
          </Link>
        ) : (
          <p className="text-xs text-ink-faint">{doc.project.name}</p>
        )}

        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {doc.number ? <span className="text-ink-faint">{doc.number} · </span> : null}
            {doc.name}
          </h1>
          {canEditData ? (
            <DeleteButton
              action={deleteDocument}
              idField="documentId"
              id={doc.id}
              confirm={`Excluir este documento? ${doc.revisions.length} revisão(ões), as passagens e todo o histórico são apagados.`}
              returnTo={modal ? undefined : `/projects/${doc.project.id}/documents`}
            />
          ) : null}
        </div>

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

      <section className="grid gap-4 sm:grid-cols-5">
        <Card>
          <Metric label="Passagens" value={String(passages.length)} />
        </Card>
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

      <section>
        <SectionTitle hint="Cada ida para análise e a volta, da primeira à aprovação">
          Passagens pelo sistema
        </SectionTitle>
        <Card>
          <DocumentPassages
            passages={passages}
            currentStatus={(current?.status as DocumentStatus | undefined) ?? null}
            now={now}
          />
        </Card>
      </section>

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
                    packages={packages}
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
              {canEditData ? (
                <details className="border-t border-line pt-2">
                  <summary className="cursor-pointer text-sm text-accent hover:underline">
                    Editar dados do documento
                  </summary>
                  <form action={updateDocumentMetadata} className="mt-3 space-y-3">
                    <input type="hidden" name="documentId" value={doc.id} />
                    <Field label="Nº do documento">
                      <input name="number" defaultValue={doc.number ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Nome">
                      <input name="name" defaultValue={doc.name} required className={inputClass} />
                    </Field>
                    <Field label="Tipo">
                      <input name="type" defaultValue={doc.type ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Disciplina">
                      <select name="disciplineId" defaultValue={doc.disciplineId ?? ""} className={inputClass}>
                        <option value="">Não definir</option>
                        {disciplines.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.tag} — {d.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Empresa">
                      <select name="designFirmId" defaultValue={doc.designFirmId ?? ""} className={inputClass}>
                        <option value="">Não definir</option>
                        {firms.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Emissor responsável">
                      <select name="responsibleId" defaultValue={doc.responsibleId ?? ""} className={inputClass}>
                        <option value="">Não definir</option>
                        {allUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Observações">
                      <textarea name="notes" rows={3} defaultValue={doc.notes ?? ""} className={inputClass} />
                    </Field>
                    <Button type="submit">Salvar dados</Button>
                  </form>
                </details>
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

function Missing() {
  return <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-faint">Registro não encontrado.</p>;
}
