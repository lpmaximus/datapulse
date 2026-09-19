"use client";

import clsx from "clsx";
import { Plus } from "lucide-react";

/**
 * Peças da linha de entrada "estilo planilha": cada campo vive numa célula da
 * própria tabela, alinhado à coluna que vai preencher. O <form> fica escondido
 * na primeira célula e os campos apontam para ele pelo atributo `form`, o que
 * permite Enter em qualquer célula gravar a linha (um <form> não pode envolver
 * <td>s).
 */
export const cellInput =
  "block w-full min-w-0 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent";

export function EntryCell({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={clsx("border-r border-line p-0 last:border-r-0", className)}>{children}</td>;
}

/** Célula vazia — coluna que não se preenche na entrada (status, avanço…). */
export function EntryBlank() {
  return (
    <EntryCell>
      <span className="block px-3 py-2 text-center text-sm text-ink-faint">—</span>
    </EntryCell>
  );
}

export function EntryAddButton({
  formId,
  pending,
  label = "Adicionar",
}: {
  formId: string;
  pending: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      form={formId}
      disabled={pending}
      title="Adicionar (Enter)"
      className="flex w-full items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft/50 disabled:opacity-50"
    >
      <Plus size={14} />
      {pending ? "…" : label}
    </button>
  );
}

/** Linha de mensagem sob a entrada: erro ou confirmação. */
export function EntryFeedback({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <tr>
      <td colSpan={99} className="px-4 py-1.5 text-sm">
        {error ? <span className="text-red-700">{error}</span> : <span className="text-green-700">{ok}</span>}
      </td>
    </tr>
  );
}

/** Marca a linha de entrada: fundo levemente tingido e ícone no lugar do checkbox. */
export const entryRowClass = "border-b border-dashed border-line-strong bg-accent-soft/20";
