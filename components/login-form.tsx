"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type AuthFormState } from "@/app/actions/auth";
import { Button, Field, inputClass } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="E-mail">
        <input
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          className={inputClass}
          placeholder="voce@empresa.com"
        />
      </Field>

      <Field label="Senha">
        <PasswordInput name="password" autoComplete="current-password" />
      </Field>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
