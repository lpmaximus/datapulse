"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitRevision,
  recordAnalysis,
  createRevision,
  type TransitionState,
} from "@/app/actions/documents";
import { Button, Field, inputClass } from "@/components/ui";
import { EFFECT_LABEL, type AnalysisCodeLike } from "@/lib/documents";
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
}: {
  revisionId: string;
  specialists: UserOption[];
}) {
  const [state, formAction] = useActionState<TransitionState, FormData>(
    submitRevision,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="revisionId" value={revisionId} />

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

      <Field label="Prazo para a análise">
        <input type="date" name="dueAt" className={inputClass} />
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
        hint="Cada emissão é uma tarefa dentro de um marco. Em geral, um pacote novo."
      >
        <PackageSelect packages={packages} className={inputClass} />
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
