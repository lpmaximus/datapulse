"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { closeProject, reopenProject, type ClosureFormState } from "@/app/actions/projects";
import { Button, Field, inputClass } from "@/components/ui";
import { CLOSURE_TYPE_HINT, CLOSURE_TYPE_LABEL, closureNeedsReason, type ClosureType } from "@/lib/project-closure";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

function ErrorLine({ state }: { state: ClosureFormState }) {
  return state.error ? <p className="text-sm text-red-700">{state.error}</p> : null;
}

/**
 * Termo de encerramento. A justificativa aparece como obrigatória quando há
 * pendências ou quando o projeto foi interrompido — a mesma regra é
 * conferida de novo no servidor.
 */
export function CloseProjectForm({
  projectId,
  pendingCount,
  today,
}: {
  projectId: string;
  pendingCount: number;
  /** AAAA-MM-DD (fuso de Brasília), padrão da data de encerramento. */
  today: string;
}) {
  const [state, action] = useActionState<ClosureFormState, FormData>(closeProject, {});
  const [type, setType] = useState<ClosureType>("COMPLETED");
  const needsReason = closureNeedsReason(type, pendingCount);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Como o projeto terminou</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["COMPLETED", "INTERRUPTED"] as ClosureType[]).map((t) => (
            <label
              key={t}
              className={
                "flex cursor-pointer gap-2 rounded-md border px-3 py-2 text-sm " +
                (type === t ? "border-accent bg-canvas" : "border-line")
              }
            >
              <input
                type="radio"
                name="closureType"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-ink">{CLOSURE_TYPE_LABEL[t]}</span>
                <span className="block text-xs text-ink-faint">{CLOSURE_TYPE_HINT[t]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data do encerramento" hint="Quando o projeto terminou de fato.">
          <input type="date" name="closedOn" defaultValue={today} max={today} required className={inputClass} />
        </Field>
        <Field label="Evidência do aceite" hint="E-mail, ata ou BM em que o contratante aceitou.">
          <input
            name="acceptanceRef"
            placeholder="Ex.: e-mail da IDG de 18/11/2026"
            maxLength={4000}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Resumo final" hint="O que foi entregue e em que condições.">
        <textarea name="summary" rows={3} maxLength={4000} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lições aprendidas: o que funcionou" hint="Para repetir nos próximos projetos.">
          <textarea name="lessonsKeep" rows={4} maxLength={4000} className={inputClass} />
        </Field>
        <Field label="Lições aprendidas: o que melhorar" hint="Para não repetir.">
          <textarea name="lessonsImprove" rows={4} maxLength={4000} className={inputClass} />
        </Field>
      </div>

      <Field
        label={needsReason ? "Justificativa (obrigatória)" : "Justificativa (opcional)"}
        hint={
          type === "INTERRUPTED"
            ? "Por que o projeto foi interrompido."
            : pendingCount > 0
              ? `Há ${pendingCount} pendência(s) aberta(s): explique por que encerrar assim.`
              : "Observação sobre o encerramento, se houver."
        }
      >
        <textarea name="reason" rows={2} maxLength={4000} required={needsReason} className={inputClass} />
      </Field>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Submit label="Encerrar projeto" busy="Encerrando…" />
        <span className="text-xs text-ink-faint">
          O projeto fica somente leitura. Dá para reabrir depois, com justificativa.
        </span>
      </div>
      <ErrorLine state={state} />
    </form>
  );
}

export function ReopenProjectForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<ClosureFormState, FormData>(reopenProject, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Motivo da reabertura" hint="Ex.: nova revisão pedida pelo contratante.">
        <textarea name="reason" rows={2} maxLength={4000} required className={inputClass} />
      </Field>
      <div className="flex items-center gap-3">
        <Submit label="Reabrir projeto" busy="Reabrindo…" />
        <span className="text-xs text-ink-faint">Volta a Ativo. O termo de encerramento fica no histórico.</span>
      </div>
      <ErrorLine state={state} />
    </form>
  );
}
