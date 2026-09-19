"use client";

import clsx from "clsx";
import { Plus, X } from "lucide-react";

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

/**
 * Última linha da tabela: o botão que cria uma linha nova. Só ele aparece até
 * o usuário querer cadastrar — nada de formulário ocupando a tela.
 */
export function AddRowTrigger({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <tr className="border-b border-line">
      <td colSpan={99} className="p-0">
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink-soft hover:bg-canvas hover:text-accent"
        >
          <Plus size={14} />
          {label}
        </button>
      </td>
    </tr>
  );
}

export function EntryCancel({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Cancelar (Esc)"
      aria-label="Cancelar"
      className="flex w-full items-center justify-center px-2 py-2 text-ink-faint hover:text-red-700"
    >
      <X size={15} />
    </button>
  );
}

/** Esc dentro da linha de entrada cancela o cadastro. */
export function onEntryKeyDown(cancel: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Escape") cancel();
  };
}
