import Link from "next/link";
import clsx from "clsx";
import { Diamond, Lock } from "lucide-react";
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
  SCHEDULE_COLOR,
  SCHEDULE_LABEL,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  type Priority,
  type ProjectStatus,
  type ScheduleHealth,
  type TaskStatus,
} from "@/lib/tasks";
import { REQUEST_STATUS_COLOR, REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/requests";
import type { DeadlineChangeRow } from "@/types/models";

/** Célula de status em cor sólida. `fill` ocupa a célula da tabela inteira. */
export function TaskStatusCell({ status, fill = false }: { status: TaskStatus; fill?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center text-xs font-medium text-white",
        fill ? "h-full min-h-9 w-full px-2" : "min-w-[104px] rounded-sm px-2 py-1",
        TASK_STATUS_COLOR[status] ?? "bg-st-gray",
      )}
    >
      {TASK_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PriorityCell({ value, fill = false }: { value: Priority; fill?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center text-xs font-medium text-white",
        fill ? "h-full min-h-9 w-full px-2" : "min-w-[76px] rounded-sm px-2 py-1",
        PRIORITY_COLOR[value] ?? "bg-pr-medium",
      )}
    >
      {value === "CRITICAL" ? "⚠ " : ""}
      {PRIORITY_LABEL[value] ?? value}
    </span>
  );
}

export function ScheduleChip({ health }: { health: ScheduleHealth }) {
  return (
    <span
      className={clsx(
        "inline-flex min-w-[96px] items-center justify-center rounded-sm px-2 py-1 text-xs font-medium",
        health === "WATCH" ? "text-ink" : "text-white",
        SCHEDULE_COLOR[health],
      )}
    >
      {SCHEDULE_LABEL[health]}
    </span>
  );
}

export function ProgressBar({ value, className }: { value: number | null; className?: string }) {
  if (value == null) return <span className="text-ink-faint">—</span>;
  return (
    <span className={clsx("flex min-w-[110px] items-center gap-2", className)}>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
        <span
          className={clsx("block h-full rounded-full", value >= 100 ? "bg-st-done" : "bg-accent")}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
      <span className="w-9 text-right text-xs tabular-nums text-ink-soft">{value}%</span>
    </span>
  );
}

const AVATAR_TONES = ["bg-st-purple", "bg-accent", "bg-st-done", "bg-pr-high", "bg-st-working", "bg-st-dark"];

export function Avatar({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  if (!name) {
    return (
      <span
        title="Sem responsável"
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-[11px] text-ink-faint"
      >
        ?
      </span>
    );
  }
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  // Cor estável por pessoa: a mesma pessoa tem a mesma cor em todas as telas.
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      title={name}
      style={{ width: size, height: size }}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
        AVATAR_TONES[h % AVATAR_TONES.length],
      )}
    >
      {letters}
    </span>
  );
}

export function KindMark({ kind }: { kind: string }) {
  if (kind !== "MILESTONE") return null;
  return (
    <Diamond
      size={13}
      className="shrink-0 fill-st-purple text-st-purple"
      aria-label="Marco"
    />
  );
}

/** Aviso de projeto pausado/encerrado, no topo das telas do projeto. */
export function ReadOnlyBanner({
  status,
  projectId,
  canReactivate,
}: {
  status: ProjectStatus;
  projectId?: string;
  canReactivate?: boolean;
}) {
  if (status === "ACTIVE") return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-canvas px-4 py-3 text-sm text-ink-soft">
      <Lock size={16} className="shrink-0 text-ink" />
      <span>
        <strong className="text-ink">Projeto {PROJECT_STATUS_LABEL[status].toLowerCase()}</strong> —
        somente leitura. Tarefas, documentos e avaliações ficam visíveis como
        histórico, mas não aceitam alterações e saem do Painel e das demandas.
      </span>
      {canReactivate && status === "PAUSED" && projectId ? (
        <Link href="/projects" className="ml-auto text-accent hover:underline">
          Reativar em Projetos
        </Link>
      ) : null}
    </div>
  );
}

/** Barra horizontal empilhada — substitui gráfico de pizza (comparar fatias é mais fácil). */
export function StackedBar({
  segments,
  height = 12,
}: {
  segments: { key: string; label: string; value: number; className: string }[];
  height?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <span className="block w-full rounded-full bg-line" style={{ height }} />;
  return (
    <span className="flex w-full overflow-hidden rounded-full" style={{ height }}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span
            key={s.key}
            title={`${s.label}: ${s.value}`}
            className={clsx("h-full", s.className)}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
    </span>
  );
}


export function RequestStatusCell({ status }: { status: RequestStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex min-w-[92px] items-center justify-center rounded-sm px-2 py-1 text-xs font-medium text-white",
        REQUEST_STATUS_COLOR[status] ?? "bg-st-gray",
      )}
    >
      {REQUEST_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function fmtDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

/**
 * Histórico de reprogramação — "era dia X, passou pro dia Y" — para tarefa,
 * marco (rollup) ou solicitação. Mais recente primeiro.
 */
export function DeadlineHistoryList({ changes }: { changes: DeadlineChangeRow[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-ink-faint">Nenhuma reprogramação registrada.</p>;
  }
  const sorted = [...changes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return (
    <ul className="space-y-1.5 text-sm">
      {sorted.map((c) => (
        <li key={c.id} className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-ink-faint tabular-nums">{fmtDate(c.createdAt)}</span>
          <span className="text-ink-soft">
            {c.fromDate ? (
              <>
                <span className="line-through">{fmtDate(c.fromDate)}</span> → <strong className="text-ink">{fmtDate(c.toDate)}</strong>
              </>
            ) : (
              <>declarado para <strong className="text-ink">{fmtDate(c.toDate)}</strong></>
            )}
          </span>
          {c.reason ? <span className="text-xs text-ink-faint">({c.reason})</span> : null}
        </li>
      ))}
    </ul>
  );
}
