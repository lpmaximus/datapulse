"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  createTimeEntry,
  updateActualHours,
  type HoursFormState,
} from "@/app/actions/hours";
import { Button, inputClass } from "@/components/ui";
import { TIME_CATEGORIES, TIME_CATEGORY_LABEL } from "@/lib/timesheet";

export interface LinkOptions {
  projects: { id: string; name: string }[];
  tasks: { id: string; name: string; project: string }[];
  documents: { id: string; label: string; project: string }[];
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Novo lançamento previsto num dia. A data já vem fixa do cartão do dia. */
export function TimeEntryForm({ date, options }: { date: string; options: LinkOptions }) {
  const [state, formAction] = useActionState<HoursFormState, FormData>(createTimeEntry, {});
  const ref = useRef<HTMLFormElement>(null);

  // Limpa o formulário depois de lançar, para o próximo lançamento do dia.
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <input type="hidden" name="date" value={date} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_90px_minmax(0,1.6fr)]">
        <select name="category" defaultValue="" required aria-label="Tipo de atividade" className={inputClass}>
          <option value="" disabled>
            Tipo de atividade
          </option>
          {TIME_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TIME_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <input
          name="hours"
          inputMode="decimal"
          placeholder="Horas"
          aria-label="Horas previstas"
          required
          className={inputClass}
        />
        <select name="link" defaultValue="" aria-label="Vínculo" className={inputClass}>
          <option value="">Sem vínculo</option>
          {options.tasks.length > 0 ? (
            <optgroup label="Minhas tarefas">
              {options.tasks.map((t) => (
                <option key={t.id} value={`m:${t.id}`}>
                  {t.name} — {t.project}
                </option>
              ))}
            </optgroup>
          ) : null}
          {options.documents.length > 0 ? (
            <optgroup label="Documentos sob minha análise">
              {options.documents.map((d) => (
                <option key={d.id} value={`d:${d.id}`}>
                  {d.label} — {d.project}
                </option>
              ))}
            </optgroup>
          ) : null}
          {options.projects.length > 0 ? (
            <optgroup label="Projetos">
              {options.projects.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      <div className="flex gap-2">
        <input name="note" maxLength={300} placeholder="Observação (opcional)" className={inputClass} />
        <Submit label="Lançar" pendingLabel="Lançando…" />
      </div>
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** Ajuste do realizado de um lançamento. Vazio = volta a valer o previsto. */
export function ActualHoursForm({
  entryId,
  actualHours,
}: {
  entryId: string;
  actualHours: number | null;
}) {
  const [state, formAction] = useActionState<HoursFormState, FormData>(updateActualHours, {});

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="entryId" value={entryId} />
      <input
        name="actualHours"
        inputMode="decimal"
        defaultValue={actualHours != null ? String(actualHours).replace(".", ",") : ""}
        placeholder="realizado"
        aria-label="Horas realizadas"
        className={inputClass + " w-24"}
      />
      <Button type="submit" variant="outline">
        Ajustar
      </Button>
      {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
    </form>
  );
}
