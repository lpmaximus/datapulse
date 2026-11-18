import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageProjects } from "@/lib/authz";
import { projectVisibility } from "@/lib/visibility";
import { Card, SectionTitle } from "@/components/ui";
import { CloseProjectForm, ReopenProjectForm } from "@/components/project-closure-forms";
import { loadClosureContext } from "@/lib/server/project-closure-service";
import {
  CLOSURE_TYPE_LABEL,
  canCloseProject,
  statusChangeLabel,
  type ClosureCheckItem,
  type ClosureMetrics,
  type ClosureType,
} from "@/lib/project-closure";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/tasks";
import { localDay } from "@/lib/documents";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectClosurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}/close`);

  const project = await prisma.project.findFirst({
    where: { id, ...projectVisibility(user) },
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      cost: true,
      currency: true,
      statusChanges: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!project) notFound();

  const manage = canManageProjects(user);
  const status = project.status as ProjectStatus;
  const closing = canCloseProject(status);
  const lastClosure = project.statusChanges.find((c) => c.toStatus === "CLOSED") ?? null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/projects/${project.id}`} className="text-xs text-ink-faint hover:text-ink-soft">
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {closing ? "Encerrar projeto" : "Termo de encerramento"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Status atual: <strong className="text-ink">{PROJECT_STATUS_LABEL[status]}</strong>
        </p>
      </div>

      {closing ? (
        <ClosingView project={project} organizationId={user.organizationId} manage={manage} />
      ) : lastClosure ? (
        <ClosureRecord change={lastClosure} currency={project.currency} />
      ) : (
        <Card>
          <p className="text-sm text-ink-soft">
            Projeto encerrado antes do termo de encerramento existir: não há registro de aceite nem de lições
            aprendidas.
          </p>
        </Card>
      )}

      {status === "CLOSED" && manage ? (
        <Card>
          <SectionTitle>Reabrir</SectionTitle>
          <ReopenProjectForm projectId={project.id} />
        </Card>
      ) : null}

      {project.statusChanges.length ? (
        <Card>
          <SectionTitle>Histórico de status</SectionTitle>
          <ul className="space-y-2 text-sm">
            {project.statusChanges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular-nums text-ink-faint">{formatDateTime(c.createdAt)}</span>
                <strong className="text-ink">{statusChangeLabel(c.fromStatus, c.toStatus)}</strong>
                <span className="text-ink-soft">por {c.user?.name ?? "—"}</span>
                {c.reason ? <span className="w-full text-xs text-ink-faint sm:w-auto">— {c.reason}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

async function ClosingView({
  project,
  organizationId,
  manage,
}: {
  project: { id: string; startsAt: Date | null; endsAt: Date | null; cost: unknown; currency: string };
  organizationId: string;
  manage: boolean;
}) {
  const now = new Date();
  const ctx = await loadClosureContext(organizationId, project, now);
  const { checklist, preview } = ctx;

  return (
    <>
      <Card>
        <p className="text-sm text-ink-soft">
          Encerramento no padrão do PMBOK (Encerrar o Projeto ou Fase): conferir as pendências, fechar os números,
          registrar o aceite do contratante e as lições aprendidas. Nada abaixo impede o encerramento, mas cada
          pendência aberta fica registrada no termo e exige justificativa.
        </p>
      </Card>

      <Card>
        <SectionTitle hint={checklist.pendingCount ? `${checklist.pendingCount} pendência(s)` : "tudo resolvido"}>
          1. Pendências
        </SectionTitle>
        <ul className="divide-y divide-line">
          {checklist.items.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle hint="prévia, com encerramento hoje">2. Números finais</SectionTitle>
        <MetricsGrid m={preview} currency={project.currency} />
      </Card>

      <Card>
        <SectionTitle>3. Termo de encerramento</SectionTitle>
        {manage ? (
          <CloseProjectForm projectId={project.id} pendingCount={checklist.pendingCount} today={localDay(now)} />
        ) : (
          <p className="text-sm text-ink-soft">Só administrador ou gerente encerra o projeto.</p>
        )}
      </Card>
    </>
  );
}

function ChecklistRow({ item }: { item: ClosureCheckItem }) {
  const ok = item.count === 0;
  return (
    <li className="flex gap-3 py-3">
      {ok ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-st-done" />
      ) : (
        <CircleAlert size={18} className="mt-0.5 shrink-0 text-st-working" />
      )}
      <div className="min-w-0 flex-1">
        <p className={clsx("text-sm font-medium", ok ? "text-ink-soft" : "text-ink")}>
          {item.label}
          {ok ? null : <span className="ml-2 tabular-nums text-ink-soft">({item.count})</span>}
        </p>
        <p className="text-xs text-ink-faint">{item.hint}</p>
        {item.details.length ? (
          <ul className="mt-1.5 space-y-0.5 text-sm">
            {item.details.map((d, i) => (
              <li key={i} className="truncate">
                {d.href ? (
                  <Link href={d.href} className="text-accent hover:underline">
                    {d.label}
                  </Link>
                ) : (
                  d.label
                )}
              </li>
            ))}
            {item.count > item.details.length ? (
              <li className="text-xs text-ink-faint">e mais {item.count - item.details.length}</li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function MetricsGrid({ m, currency }: { m: ClosureMetrics; currency: string }) {
  const variance =
    m.scheduleVarianceDays == null
      ? "sem término previsto"
      : m.scheduleVarianceDays === 0
        ? "no prazo"
        : m.scheduleVarianceDays > 0
          ? `${m.scheduleVarianceDays} dia(s) depois do previsto`
          : `${-m.scheduleVarianceDays} dia(s) antes do previsto`;
  const rows: [string, string][] = [
    ["Previsto", `${formatDate(m.plannedStart)} a ${formatDate(m.plannedEnd)}`],
    ["Encerramento", `${formatDate(m.closedOn)} · ${variance}`],
    ["Tarefas concluídas", `${m.tasksDone} de ${m.tasksTotal}`],
    [
      "Documentos",
      `${m.documentsApproved} aprovado(s), ${m.documentsCancelled} cancelado(s), ${m.documentsPending} pendente(s) — de ${m.documentsTotal}`,
    ],
    ["Revisões emitidas", `${m.revisionsIssued} (${m.reworkRevisions} com retrabalho)`],
    ["Aprovados de primeira", m.firstPassApprovalPct == null ? "—" : `${m.firstPassApprovalPct}%`],
    ["Custo contratado", formatCurrency(m.contractedCost, currency)],
    ["Medido e aprovado", formatCurrency(m.measuredApproved, currency)],
    ["Em BM não aprovado", formatCurrency(m.measuredPending, currency)],
    ["Saldo a medir", formatCurrency(m.valueToMeasure, currency)],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5">
          <dt className="text-ink-soft">{k}</dt>
          <dd className="text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClosureRecord({
  change,
  currency,
}: {
  change: {
    closureType: string | null;
    closedOn: Date | null;
    acceptanceRef: string | null;
    summary: string | null;
    lessonsKeep: string | null;
    lessonsImprove: string | null;
    reason: string | null;
    openItems: unknown;
    metrics: unknown;
    createdAt: Date;
    user: { name: string } | null;
  };
  currency: string;
}) {
  const open = Array.isArray(change.openItems)
    ? (change.openItems as { key: string; label: string; count: number; details: string[] }[])
    : [];
  const metrics = change.metrics && typeof change.metrics === "object" ? (change.metrics as ClosureMetrics) : null;
  const text = (label: string, value: string | null) => (
    <div>
      <p className="text-xs uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-ink">{value || "—"}</p>
    </div>
  );

  return (
    <>
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          {text(
            "Resultado",
            change.closureType ? CLOSURE_TYPE_LABEL[change.closureType as ClosureType] : null,
          )}
          {text("Data do encerramento", formatDate(change.closedOn))}
          {text("Registrado", `${formatDateTime(change.createdAt)} por ${change.user?.name ?? "—"}`)}
        </div>
        <div className="mt-5 space-y-4">
          {text("Evidência do aceite", change.acceptanceRef)}
          {text("Resumo final", change.summary)}
          <div className="grid gap-4 sm:grid-cols-2">
            {text("O que funcionou", change.lessonsKeep)}
            {text("O que melhorar", change.lessonsImprove)}
          </div>
          {change.reason ? text("Justificativa", change.reason) : null}
        </div>
      </Card>

      <Card>
        <SectionTitle hint={open.length ? undefined : "nenhuma"}>Pendências no encerramento</SectionTitle>
        {open.length ? (
          <ul className="space-y-3 text-sm">
            {open.map((o) => (
              <li key={o.key}>
                <p className="font-medium text-ink">
                  {o.label} <span className="text-ink-soft">({o.count})</span>
                </p>
                <ul className="mt-1 list-disc pl-5 text-ink-soft">
                  {o.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">O projeto foi encerrado sem pendências abertas.</p>
        )}
      </Card>

      {metrics ? (
        <Card>
          <SectionTitle hint="fotografia no encerramento">Números finais</SectionTitle>
          <MetricsGrid m={metrics} currency={currency} />
        </Card>
      ) : null}
    </>
  );
}
