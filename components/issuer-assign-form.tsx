"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assignDocumentIssuer, type TransitionState } from "@/app/actions/documents";
import { Button, Field, inputClass } from "@/components/ui";

export interface IssuerOption {
  id: string;
  name: string;
  role: string;
  function: { name: string } | null;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

/**
 * Designa ou repassa o projetista que elabora e emite o documento. O gerente
 * escolhe qualquer pessoa (inclusive Terceirizado/Projetista sem login); o
 * projetista atual pode repassar.
 */
export function IssuerAssignForm({
  documentId,
  currentId,
  candidates,
  canClear,
}: {
  documentId: string;
  currentId: string | null;
  candidates: IssuerOption[];
  /** Só quem gerencia pode deixar o documento sem projetista. */
  canClear: boolean;
}) {
  const [state, formAction] = useActionState<TransitionState, FormData>(assignDocumentIssuer, {});
  const internal = candidates.filter((u) => u.role !== "EXTERNAL");
  const external = candidates.filter((u) => u.role === "EXTERNAL");

  const option = (u: IssuerOption) => (
    <option key={u.id} value={u.id}>
      {u.name}
      {u.function ? ` — ${u.function.name}` : ""}
    </option>
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="documentId" value={documentId} />

      <Field
        label={currentId ? "Repassar para" : "Designar para"}
        hint="Quem vai elaborar e emitir o documento. O prazo não muda."
      >
        <select
          name="responsibleId"
          defaultValue={currentId ?? ""}
          required={!canClear}
          className={inputClass}
        >
          <option value="" disabled={!canClear}>
            {canClear ? "Sem projetista designado" : "Escolha a pessoa"}
          </option>
          {internal.length > 0 ? <optgroup label="Equipe">{internal.map(option)}</optgroup> : null}
          {external.length > 0 ? (
            <optgroup label="Terceirizados / projetistas">{external.map(option)}</optgroup>
          ) : null}
        </select>
      </Field>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : state.ok ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Projetista atualizado.
        </p>
      ) : null}

      <Submit label={currentId ? "Repassar" : "Designar"} />
    </form>
  );
}
