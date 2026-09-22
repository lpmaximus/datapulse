"use client";

import { useActionState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  updateUserRole,
  updateUserCompany,
  resetUserPassword,
  type UserFormState,
} from "@/app/actions/users";
import { Button } from "@/components/ui";
import { MODAL_PARAMS } from "@/components/modal";
import type { RoleValue, EmpresaRow } from "@/types/models";

const DEFAULT_ROLE_LABEL: Record<RoleValue, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  SPECIALIST: "Especialista",
  EXECUTIVE: "Executivo",
};

export function RoleSelect({
  userId,
  role,
  disabled,
  labels,
}: {
  userId: string;
  role: RoleValue;
  disabled?: boolean;
  /** Rótulos vindos do cadastro de Papéis (Settings > Cadastros), com fallback fixo. */
  labels?: Partial<Record<RoleValue, string>>;
}) {
  const [pending, startTransition] = useTransition();
  const roleLabel = { ...DEFAULT_ROLE_LABEL, ...labels };

  return (
    <form
      onChange={(e) => {
        const form = e.currentTarget;
        startTransition(() => updateUserRole(new FormData(form)));
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={role}
        disabled={disabled || pending}
        className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-50"
      >
        <option value="ADMIN">{roleLabel.ADMIN}</option>
        <option value="MANAGER">{roleLabel.MANAGER}</option>
        <option value="SPECIALIST">{roleLabel.SPECIALIST}</option>
        <option value="EXECUTIVE">{roleLabel.EXECUTIVE}</option>
      </select>
    </form>
  );
}

export function CompanySelect({
  userId,
  companyId,
  companies,
  disabled,
}: {
  userId: string;
  companyId: string | null;
  companies: EmpresaRow[];
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      onChange={(e) => {
        const form = e.currentTarget;
        startTransition(() => updateUserCompany(new FormData(form)));
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <select
        name="companyId"
        defaultValue={companyId ?? ""}
        disabled={disabled || pending}
        className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-50"
      >
        <option value="">Sem empresa</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </form>
  );
}

/** Abre o pop-up de edição (`?user=<id>`) — nome, e-mail e função. */
export function EditUserButton({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Button
      type="button"
      variant="ghost"
      className="px-2 py-1 text-xs"
      onClick={() => {
        const params = new URLSearchParams(searchParams.toString());
        for (const key of MODAL_PARAMS) params.delete(key);
        params.set("user", userId);
        router.push(`${pathname}?${params}`, { scroll: false });
      }}
    >
      Editar
    </Button>
  );
}

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [state, formAction] = useActionState<UserFormState, FormData>(
    resetUserPassword,
    {},
  );

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
          Resetar senha
        </Button>
      </form>
      {state.temporaryPassword ? (
        <p className="mt-1 select-all rounded border border-green-300 bg-green-50 px-2 py-1 font-mono text-xs text-ink">
          {state.temporaryPassword}
        </p>
      ) : null}
      {state.error ? (
        <p className="mt-1 text-xs text-red-700">{state.error}</p>
      ) : null}
    </div>
  );
}
