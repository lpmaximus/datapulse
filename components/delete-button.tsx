"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { MODAL_PARAMS } from "@/components/modal";

export interface DeleteResult {
  ok?: boolean;
  error?: string;
}

/**
 * Exclusão em dois passos: o primeiro clique só pede confirmação, ali mesmo;
 * o segundo exclui. Excluir não tem volta, então nunca é um clique só.
 *
 * Depois de excluir, `returnTo` leva para outra tela (usado nas telas
 * completas); sem ele, a URL perde os parâmetros do pop-up e a lista atrás
 * se atualiza — vale tanto para o pop-up quanto para o botão da linha.
 */
export function DeleteButton({
  action,
  idField,
  id,
  confirm,
  returnTo,
  label = "Excluir",
  compact = false,
}: {
  action: (formData: FormData) => Promise<DeleteResult>;
  idField: string;
  id: string;
  /** Pergunta de confirmação, com o que será perdido. */
  confirm: string;
  returnTo?: string;
  label?: string;
  /** Só o ícone — para a linha da tabela. */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set(idField, id);
      const result = await action(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (returnTo) {
        router.push(returnTo);
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      for (const key of MODAL_PARAMS) params.delete(key);
      router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
      router.refresh();
    });
  }

  if (!armed) {
    return (
      <button
        type="button"
        title="Excluir"
        aria-label={label}
        onClick={() => {
          setError(null);
          setArmed(true);
        }}
        className={clsx(
          "inline-flex items-center gap-1 rounded-md text-ink-faint hover:text-red-700",
          compact ? "p-1.5" : "px-2 py-1 text-sm",
        )}
      >
        <Trash2 size={compact ? 14 : 15} />
        {compact ? null : label}
      </button>
    );
  }

  const panel = (
    <span
      className={clsx(
        "flex flex-wrap items-center gap-2 text-xs",
        compact && "absolute right-0 top-full z-20 mt-1 w-64 whitespace-normal rounded-md border border-line bg-surface p-3 text-left shadow-lg",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-red-700">{error ?? confirm}</span>
      {error ? null : (
        <button
          type="button"
          disabled={pending}
          onClick={run}
          className="rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Excluindo…" : "Excluir"}
        </button>
      )}
      <button type="button" onClick={() => setArmed(false)} className="text-ink-soft hover:underline">
        {error ? "Fechar" : "Cancelar"}
      </button>
    </span>
  );

  // Na linha da tabela a confirmação abre num balão, sem alargar a coluna.
  if (compact) {
    return (
      <span className="relative inline-block">
        <span className="inline-flex p-1.5 text-red-700">
          <Trash2 size={14} />
        </span>
        {panel}
      </span>
    );
  }
  return panel;
}
