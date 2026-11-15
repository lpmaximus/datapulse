"use client";

import { useFormStatus } from "react-dom";
import { updateRevisionDates } from "@/app/actions/documents";
import { inputClass } from "@/components/ui";

/** Uma revisão na correção da data de envio. */
export interface IssueDateRow {
  id: string;
  name: string;
  issuedAt: string | null;
  /** Nulo enquanto a revisão não recebeu parecer: não há retorno a corrigir. */
  analyzedAt: string | null;
}

export interface IssueDateLog {
  id: string;
  /** "ISSUE" (envio) ou "ANALYSIS" (retorno). */
  field: string;
  fromDate: string | null;
  toDate: string;
  reason: string | null;
  changedByName: string | null;
  createdAt: string;
}

const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(iso)) : "sem data";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-50"
    >
      {pending ? "..." : "Salvar"}
    </button>
  );
}

/**
 * Correção das datas do trâmite, revisão a revisão: o envio ao contratante
 * (data de execução do Boletim de Medição) e o retorno da análise. O
 * documento costuma ser cadastrado depois de tudo já ter acontecido, e essas
 * duas datas alimentam prazo, dias em análise e cobrança.
 */
export function IssueDateForm({
  revisions,
  logs,
  disabled,
}: {
  revisions: IssueDateRow[];
  logs: IssueDateLog[];
  disabled?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {revisions.map((r) => (
          <li key={r.id}>
            <form action={updateRevisionDates} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="revisionId" value={r.id} />
              <span className="min-w-12 rounded border border-line bg-canvas px-2 py-1 text-center font-mono text-xs font-semibold">
                {r.name}
              </span>
              <label className="text-xs text-ink-faint">
                <span className="block">Enviada em</span>
                <input
                  type="date"
                  name="issuedAt"
                  max={today}
                  defaultValue={r.issuedAt ? r.issuedAt.slice(0, 10) : ""}
                  disabled={disabled}
                  className={inputClass + " w-36 py-1 text-sm"}
                />
              </label>
              {r.analyzedAt ? (
                <label className="text-xs text-ink-faint">
                  <span className="block">Retorno em</span>
                  <input
                    type="date"
                    name="analyzedAt"
                    max={today}
                    defaultValue={r.analyzedAt.slice(0, 10)}
                    disabled={disabled}
                    className={inputClass + " w-36 py-1 text-sm"}
                  />
                </label>
              ) : null}
              <input
                name="reason"
                placeholder="Motivo (opcional)"
                disabled={disabled}
                className={inputClass + " w-40 py-1 text-sm"}
              />
              {disabled ? null : <Save />}
            </form>
          </li>
        ))}
      </ul>

      {logs.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="mb-1.5 text-xs uppercase tracking-wider text-ink-faint">Correções</p>
          <ul className="space-y-1 text-xs text-ink-soft">
            {logs.map((l) => (
              <li key={l.id}>
                {l.field === "ANALYSIS" ? "retorno" : "envio"}: {fmt(l.fromDate)} → <b>{fmt(l.toDate)}</b>
                {l.changedByName ? ` · ${l.changedByName}` : ""} · {fmt(l.createdAt)}
                {l.reason ? ` · ${l.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
