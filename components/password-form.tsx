"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changeOwnPassword, type AuthFormState } from "@/app/actions/auth";
import { Button, Field } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Alterar senha"}
    </Button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    changeOwnPassword,
    {},
  );

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <Field label="Senha atual">
        <PasswordInput name="currentPassword" autoComplete="current-password" />
      </Field>
      <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
        <PasswordInput name="newPassword" autoComplete="new-password" />
      </Field>
      <Field label="Confirmar nova senha">
        <PasswordInput name="confirmPassword" autoComplete="new-password" />
      </Field>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Senha alterada. As sessões nos demais dispositivos foram encerradas.
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
