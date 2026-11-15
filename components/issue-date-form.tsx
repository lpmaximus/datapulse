"use client";

import { useFormStatus } from "react-dom";
import { updateRevisionIssuedAt } from "@/app/actions/documents";
import { inputClass } from "@/components/ui";

/** Uma revisão na correção da data de envio. */
export interface IssueDateRow {
  id: string;
  name: string;
  issuedAt: string | null;
  /** Depois do parecer a data não pode ir — serve de teto no servidor. */
  analyzedAt: string | null;
}

export interface IssueDateLog {
  id: string;
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
 * Correção da data de envio ao contratante, revisão a revisão. É a data que o
 * Boletim de Medição usa como data de execução — por isso ela precisa ser
 * acertável depois, quando o documento é cadastrado já entregue.
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
            <form action={updateRevisionIssuedAt} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="revisionId" value={r.id} />
              <span className="min-w-12 rounded border border-line bg-canvas px-2 py-1 text-center font-mono text-xs font-semibold">
                {r.name}
              </span>
              <input
                type="date"
                name="issuedAt"
                max={today}
                defaultValue={r.issuedAt ? r.issuedAt.slice(0, 10) : ""}
                disabled={disabled}
                className={inputClass + " w-40 py-1 text-sm"}
              />
              <input
                name="reason"
                placeholder="Motivo (opcional)"
                disabled={disabled}
                className={inputClass + " w-44 py-1 text-sm"}
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
                {fmt(l.fromDate)} → <b>{fmt(l.toDate)}</b>
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
