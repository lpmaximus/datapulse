"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestDelegation,
  respondDelegation,
  withdrawDelegation,
} from "@/app/actions/delegations";
import type { TransitionState } from "@/app/actions/documents";
import { Button, Field, inputClass } from "@/components/ui";
import type { UserOption } from "@/types/models";

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

function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  name,
  value,
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "outline" | "ghost";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} name={name} value={value} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Quem está com a análise escolhe o colega que vai recebê-la. */
export function RequestDelegationForm({
  revisionId,
  candidates,
}: {
  revisionId: string;
  candidates: UserOption[];
}) {
  const [state, formAction] = useActionState<TransitionState, FormData>(requestDelegation, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="revisionId" value={revisionId} />

      <Field
        label="Delegar a análise a"
        hint="A análise só muda de mãos quando a pessoa aceitar. O prazo não muda."
      >
        <select name="toUserId" defaultValue="" required className={inputClass}>
          <option value="" disabled>
            Escolha o especialista
          </option>
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.function ? ` — ${u.function.name}` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Recado">
        <textarea name="comment" rows={2} className={inputClass} />
      </Field>

      <Feedback state={state} okText="Pedido enviado. Aguardando a resposta." />
      <SubmitButton label="Pedir delegação" pendingLabel="Enviando…" />
    </form>
  );
}

/** O destinatário aceita ou recusa (a recusa exige motivo). */
export function RespondDelegationForm({ delegationId }: { delegationId: string }) {
  const [state, formAction] = useActionState<TransitionState, FormData>(respondDelegation, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="delegationId" value={delegationId} />

      <Field label="Comentário" hint="Obrigatório para recusar.">
        <textarea name="comment" rows={2} className={inputClass} />
      </Field>

      <Feedback state={state} okText="Resposta registrada." />
      <div className="flex flex-wrap gap-2">
        <SubmitButton label="Aceitar" pendingLabel="Enviando…" name="decision" value="accept" />
        <SubmitButton
          label="Recusar"
          pendingLabel="Enviando…"
          variant="outline"
          name="decision"
          value="decline"
        />
      </div>
    </form>
  );
}

/** Quem pediu retira o pedido enquanto está pendente. */
export function WithdrawDelegationForm({ delegationId }: { delegationId: string }) {
  const [state, formAction] = useActionState<TransitionState, FormData>(withdrawDelegation, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="delegationId" value={delegationId} />
      <Feedback state={state} okText="Pedido retirado." />
      <SubmitButton label="Retirar pedido" pendingLabel="Retirando…" variant="outline" />
    </form>
  );
}
