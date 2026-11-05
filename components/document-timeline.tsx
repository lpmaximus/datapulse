import clsx from "clsx";
import {
  ACTION_LABEL,
  revisionStatusLabel,
  type DocumentAction,
  type DocumentStatus,
} from "@/lib/documents";
import { formatDateTime } from "@/lib/format";
import type { DocumentTransitionRow } from "@/types/models";

const DOT: Record<DocumentAction, string> = {
  CREATED: "bg-ink-faint",
  SUBMITTED: "bg-sky-500",
  COMMENTED: "bg-orange-500",
  REJECTED: "bg-red-500",
  APPROVED_WITH_COMMENTS: "bg-lime-600",
  APPROVED: "bg-green-600",
  REVISED: "bg-sky-400",
  SUPERSEDED: "bg-ink-faint",
  CANCELLED: "bg-ink-faint",
  DELEGATION_REQUESTED: "bg-violet-400",
  DELEGATION_ACCEPTED: "bg-violet-600",
  DELEGATION_DECLINED: "bg-violet-300",
  DELEGATION_CANCELLED: "bg-ink-faint",
};

/**
 * Rastreamento consolidado do documento: da criação ao encerramento,
 * atravessando todas as revisões em ordem cronológica.
 */
export function DocumentTimeline({
  transitions,
}: {
  transitions: DocumentTransitionRow[];
}) {
  if (transitions.length === 0) {
    return <p className="text-sm text-ink-faint">Sem eventos registrados.</p>;
  }

  // Revisões que nasceram em produção (sem pacote). Ainda sem pacote, ou com o
  // prazo de produção gravado no evento de criação — o envio troca o prazo da
  // revisão, mas o do evento fica.
  const bornInProduction = new Set(
    transitions
      .filter(
        (t) =>
          (t.action === "CREATED" || t.action === "REVISED") &&
          (!t.revision.milestoneId || t.dueAt != null),
      )
      .map((t) => t.revision.id),
  );
  const label = (status: DocumentStatus, revisionId: string) =>
    revisionStatusLabel(status, bornInProduction.has(revisionId));

  return (
    <ol className="relative space-y-0 border-l border-line pl-6">
      {transitions.map((t, i) => (
        <li key={t.id} className="relative pb-6 last:pb-0">
          <span
            className={clsx(
              "absolute -left-[1.845rem] top-1 h-3 w-3 rounded-full ring-4 ring-surface",
              DOT[t.action] ?? "bg-ink-faint",
            )}
          />

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-ink">
              {ACTION_LABEL[t.action] ?? t.action}
            </span>
            {t.analysisCodeTag ? (
              <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                {t.analysisCodeTag}
              </span>
            ) : null}
            <span className="text-xs text-ink-faint">rev. {t.revision.name}</span>
            {t.round > 0 ? (
              <span className="text-xs text-ink-faint">ciclo {t.round}</span>
            ) : null}
            <span className="ml-auto text-xs text-ink-faint">
              {formatDateTime(t.createdAt)}
            </span>
          </div>

          <p className="mt-1 text-xs text-ink-soft">
            {t.fromStatus && t.fromStatus !== t.toStatus
              ? `${label(t.fromStatus, t.revision.id)} → ${label(t.toStatus, t.revision.id)}`
              : label(t.toStatus, t.revision.id)}
            {t.actorName ? ` · por ${t.actorName}` : ""}
            {t.assignedToName ? ` · para ${t.assignedToName}` : ""}
            {t.daysInPreviousStage != null && i > 0
              ? ` · ${t.daysInPreviousStage} dia(s) na etapa anterior`
              : ""}
          </p>

          {t.comment ? (
            <p className="mt-2 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink-soft">
              {t.comment}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
