"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { updateRevisionProgress, type TransitionState } from "@/app/actions/documents";
import { Button, Field, inputClass } from "@/components/ui";
import {
  MAX_MANUAL_PROGRESS,
  PROGRESS_STALE_DAYS,
  isProgressStale,
  progressAgeLabel,
} from "@/lib/documents";
import { formatDate } from "@/lib/format";

/**
 * Barra de avanço da produção com a data da última atualização. O número
 * sozinho não basta: "90%" parado há três semanas diz outra coisa que "90%"
 * de ontem — por isso a idade vem sempre junto e fica laranja quando velha.
 */
export function ProductionProgressBar({
  progress,
  updatedAt,
  now,
}: {
  progress: number;
  updatedAt: Date | string | null;
  now: Date | string;
}) {
  const ref = new Date(now);
  const stale = progress < 100 && isProgressStale(updatedAt, ref);
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xl font-semibold tabular-nums">{pct}%</span>
        <span
          title={
            stale
              ? `Sem atualização há mais de ${PROGRESS_STALE_DAYS} dias — o número pode não refletir o trabalho atual.`
              : undefined
          }
          className={clsx(
            "text-xs",
            stale
              ? "rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 font-medium text-orange-700"
              : "text-ink-faint",
          )}
        >
          {progressAgeLabel(updatedAt, ref)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Avanço da produção"
        className="h-2.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-st-production transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Atualizar avanço"}
    </Button>
  );
}

/** Formulário do projetista (ou do gerente): avanço de 0 a 99% e observação. */
export function ProductionProgressForm({
  revisionId,
  current,
}: {
  revisionId: string;
  current: number;
}) {
  const [state, formAction] = useActionState<TransitionState, FormData>(updateRevisionProgress, {});
  const [value, setValue] = useState(current);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="revisionId" value={revisionId} />
      <Field
        label="Avanço da elaboração"
        hint={`Até ${MAX_MANUAL_PROGRESS}%. O 100% é registrado quando o documento é enviado ao pacote.`}
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={MAX_MANUAL_PROGRESS}
            step={1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            aria-label="Avanço em %"
            className="min-w-0 flex-1 accent-[var(--color-st-production)]"
          />
          <input
            type="number"
            name="progress"
            min={0}
            max={MAX_MANUAL_PROGRESS}
            step={1}
            value={value}
            onChange={(e) => setValue(Math.max(0, Math.min(MAX_MANUAL_PROGRESS, Number(e.target.value) || 0)))}
            aria-label="Avanço em %"
            className={inputClass + " w-20! shrink-0 text-center tabular-nums"}
          />
          <span className="text-sm text-ink-faint" aria-hidden>
            %
          </span>
        </div>
      </Field>
      <Field label="Observação" hint={value < current ? "Obrigatória quando o avanço diminui." : "Opcional."}>
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          required={value < current}
          placeholder="Ex.: plantas concluídas, faltam cortes e lista de material"
          className={inputClass}
        />
      </Field>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : state.ok ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Avanço atualizado.
        </p>
      ) : null}

      <Submit />
    </form>
  );
}

export interface ProgressLogRow {
  id: string;
  fromProgress: number;
  toProgress: number;
  note: string | null;
  actorName: string | null;
  createdAt: Date;
}

/** Histórico das atualizações, mais recente primeiro. */
export function ProductionProgressHistory({ logs }: { logs: ProgressLogRow[] }) {
  if (logs.length === 0) return null;
  return (
    <ul className="space-y-2">
      {logs.map((l) => (
        <li key={l.id} className="text-sm">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="tabular-nums text-ink">
              {l.fromProgress}% → <span className="font-medium">{l.toProgress}%</span>
            </span>
            <span className="text-xs text-ink-faint">
              {formatDate(l.createdAt)}
              {l.actorName ? ` · ${l.actorName}` : ""}
            </span>
          </p>
          {l.note ? <p className="text-xs text-ink-soft">{l.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
