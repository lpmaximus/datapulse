"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitRevision,
  recordAnalysis,
  createRevision,
  rescheduleRevision,
  type RescheduleRevisionState,
  type TransitionState,
} from "@/app/actions/documents";
import { Button, Field, inputClass } from "@/components/ui";
import { EFFECT_LABEL, localDay, type AnalysisCodeLike } from "@/lib/documents";

/** Campo de data da ação: padrão hoje, sem datas futuras. */
function ActionDateField({ label, hint }: { label: string; hint: string }) {
  const today = localDay(new Date());
  return (
    <Field label={label} hint={hint}>
      <input
        type="date"
        name="occurredAt"
        defaultValue={today}
        max={today}
        required
        className={inputClass}
      />
    </Field>
  );
}
import { PackageSelect } from "@/components/package-select";
import type { PackageOption, UserOption } from "@/types/models";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Feedback({ state, okText }: { state: TransitionState; okText: string }) {
  if (state.error) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
        {okText}
      </p>
    );
  }
  return null;
}

/** Emissão da revisão para análise — ato do emissor. */
export function SubmitRevisionForm({
  revisionId,
  specialists,
  defaultDueAt,
  canEditDueAt,
  packages,
}: {
  revisionId: string;
  specialists: UserOption[];
  /** Presente quando a revisão está em produção: o pacote é escolhido no envio. */
  packages?: PackageOption[];
  /** Vencimento padrão (AAAA-MM-DD): entrada + 5 dias úteis. */
  defaultDueAt: string;
  /** Só o gerente altera o vencimento; para os demais o campo é informativo. */
  canEditDueAt: boolean;
}) {
  const [state, formAction] = useActionState<TransitionState, FormData>(
    submitRevision,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="revisionId" value={revisionId} />

      <ActionDateField
        label="Enviado em"
        hint="Data em que o documento foi de fato enviado para análise."
      />

      {packages ? (
        <Field
          label="Pacote de envio"
          hint="O documento estava em produção. Escolha a emissão em que ele segue para o cliente."
        >
          <PackageSelect packages={packages} className={inputClass} />
        </Field>
      ) : null}

      <Field label="Especialista designado" hint="Quem dará o parecer técnico.">
        <select name="specialistId" defaultValue="" className={inputClass}>
          <option value="">Não designar agora</option>
          {specialists.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.function ? ` — ${u.function.name}` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Prazo para a análise"
        hint={
          canEditDueAt
            ? "Padrão: data de envio + 5 dias úteis. Altere só em caso de exceção."
            : "Data de envio + 5 dias úteis. Só o gerente altera."
        }
      >
        <input
          type="date"
          name="dueAt"
          defaultValue={defaultDueAt}
          disabled={!canEditDueAt}
          className={inputClass}
        />
      </Field>

      <Field label="Observação">
        <textarea name="comment" rows={2} className={inputClass} />
      </Field>

      <Feedback state={state} okText="Revisão emitida para análise." />
      <Submit label="Emitir para análise" pendingLabel="Emitindo…" />
    </form>
  );
}

/** Registro do parecer — ato do especialista. */
export function AnalysisForm({
  revisionId,
  codes,
}: {
  revisionId: string;
  codes: AnalysisCodeLike[];
}) {
  const [state, formAction] = useActionState<TransitionState, FormData>(
    recordAnalysis,
    {},
  );

  if (codes.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Nenhum código de análise cadastrado. Configure em Cadastros.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="revisionId" value={revisionId} />

      <Field label="Parecer">
        <select name="analysisCodeId" required className={inputClass}>
          {codes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.tag} — {c.name} ({EFFECT_LABEL[c.effect]})
            </option>
          ))}
        </select>
      </Field>

      <ActionDateField
        label="Data do retorno"
        hint="Data em que o parecer foi dado (aprovação, comentário, reprovação)."
      />

      <Field label="Justificativa" hint="O que sustenta esta decisão?">
        <textarea name="comment" rows={3} className={inputClass} />
      </Field>

      <Feedback state={state} okText="Parecer registrado no histórico." />
      <Submit label="Registrar parecer" pendingLabel="Registrando…" />
    </form>
  );
}

/** Emissão de nova revisão do documento. */
export function NewRevisionForm({
  documentId,
  suggestedName,
  packages,
}: {
  documentId: string;
  suggestedName: string;
  packages: PackageOption[];
}) {
  const [state, formAction] = useActionState<TransitionState, FormData>(
    createRevision,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="documentId" value={documentId} />

      <Field label="Identificador da revisão">
        <input
          name="name"
          defaultValue={suggestedName}
          className={inputClass}
          placeholder="R01"
        />
      </Field>

      <Field
        label="Pacote de revisão"
        hint="Em branco: a revisão fica em produção e o pacote é escolhido no envio."
      >
        <PackageSelect packages={packages} className={inputClass} required={false} />
      </Field>

      <Field label="Prazo de produção" hint="Só para revisão em produção (sem pacote).">
        <input type="date" name="dueAt" className={inputClass} />
      </Field>

      <Field label="Emitida em">
        <input type="date" name="issuedAt" className={inputClass} />
      </Field>

      <Field label="Link do arquivo desta revisão">
        <input name="externalUrl" type="url" className={inputClass} />
      </Field>

      <Field label="O que mudou">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>

      <Feedback state={state} okText="Nova revisão criada." />
      <Submit label="Emitir nova revisão" pendingLabel="Criando…" />
    </form>
  );
}

/**
 * Reprograma o prazo da revisão vigente (só gerente). Grava no histórico
 * "era X, passou para Y" em vez de só sobrescrever.
 */
export function RevisionRescheduleForm({
  revisionId,
  currentDueAt,
}: {
  revisionId: string;
  /** Prazo atual em AAAA-MM-DD, para já abrir preenchido. */
  currentDueAt: string | null;
}) {
  const [state, action] = useActionState<RescheduleRevisionState, FormData>(rescheduleRevision, {});
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.at) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.at]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-accent hover:underline">
        Alterar prazo
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="revisionId" value={revisionId} />
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="date"
          name="dueAt"
          required
          defaultValue={currentDueAt ?? undefined}
          aria-label="Novo prazo"
          className={inputClass + " w-auto"}
        />
        <input name="reason" placeholder="Motivo (opcional)" className={inputClass + " min-w-0 flex-1"} />
      </div>
      <div className="flex items-center gap-3">
        <Submit label="Salvar" pendingLabel="Salvando…" />
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-faint hover:underline">
          Cancelar
        </button>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
