"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DAY = 86_400_000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Navegação da janela da Linha do tempo (Gantt). Tudo vai pra URL
 * (?<param>=AAAA-MM-DD), então é compartilhável por link e o Server Component
 * (a página) recalcula a janela — o `GanttChart` em si continua sem estado.
 *
 * Sem o parâmetro, a janela é a de hoje (comportamento padrão do
 * `GanttChart`, `anchor` não informado). Setar o parâmetro desloca a janela;
 * "Hoje" remove o parâmetro e volta ao padrão.
 */
export function GanttDateNav({
  param = "ganttFrom",
  weeks = 13,
}: {
  /** Nome do parâmetro de busca — muda se a página tiver mais de uma linha do tempo. */
  param?: string;
  /** Quantas semanas ◀/▶ avançam — mesmo tamanho da janela, por padrão. */
  weeks?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const current = params.get(param);
  const parsed = current ? new Date(`${current}T00:00:00.000Z`) : null;
  const anchor = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

  function go(value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    router.push(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  function shift(deltaWeeks: number) {
    go(isoDate(new Date(anchor.getTime() + deltaWeeks * 7 * DAY)));
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => shift(-weeks)}
        title="Período anterior"
        className="rounded-md p-1 text-ink-soft hover:bg-canvas hover:text-ink"
      >
        <ChevronLeft size={16} />
      </button>
      <input
        type="date"
        value={current ?? isoDate(new Date())}
        onChange={(e) => go(e.currentTarget.value || null)}
        aria-label="Data de referência da linha do tempo"
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
      />
      {current ? (
        <button
          type="button"
          onClick={() => go(null)}
          className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-canvas hover:text-ink"
        >
          Hoje
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => shift(weeks)}
        title="Próximo período"
        className="rounded-md p-1 text-ink-soft hover:bg-canvas hover:text-ink"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
