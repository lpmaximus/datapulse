"use client";

import { useTransition } from "react";
import { setUserDisciplines } from "@/app/actions/users";
import { Button } from "@/components/ui";

/**
 * Disciplinas do usuário: um menu recolhido com caixas de seleção e um botão
 * para salvar o conjunto inteiro. Fica dentro da célula da tabela.
 */
export function DisciplinesEditor({
  userId,
  selected,
  disciplines,
}: {
  userId: string;
  selected: string[];
  disciplines: { id: string; tag: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const chosen = disciplines.filter((d) => selected.includes(d.id));

  if (disciplines.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none text-sm text-ink-soft hover:text-ink">
        {chosen.length === 0 ? (
          <span className="text-ink-faint">Definir…</span>
        ) : (
          chosen.map((d) => d.tag).join(", ")
        )}
      </summary>
      <form
        action={(fd) => startTransition(() => setUserDisciplines(fd))}
        className="absolute left-0 top-full z-20 mt-1 w-56 space-y-2 rounded-md border border-line bg-surface p-3 shadow-lg"
      >
        <input type="hidden" name="userId" value={userId} />
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {disciplines.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="disciplineId"
                value={d.id}
                defaultChecked={selected.includes(d.id)}
              />
              <span className="font-mono text-xs text-ink-soft">{d.tag}</span>
              <span className="truncate">{d.name}</span>
            </label>
          ))}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </form>
    </details>
  );
}
