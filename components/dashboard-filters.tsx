"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Search, X } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

/**
 * Filtros do Painel. Tudo vai para a URL (?setor=&resp=&prio=&q=), então o
 * filtro é compartilhável por link e o Server Component refaz a consulta.
 */
export function DashboardFilters({
  sectors,
  people,
}: {
  sectors: Option[];
  people: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(next.size ? `${pathname}?${next}` : pathname));
  }

  const active = ["setor", "resp", "prio", "q"].some((k) => params.get(k));
  const selectClass =
    "rounded-md border border-line bg-surface py-1.5 pl-2.5 pr-7 text-sm text-ink hover:border-line-strong focus:border-accent focus:outline-none";

  return (
    <div className={clsx("flex flex-wrap items-center gap-2", pending && "opacity-70")}>
      <select
        aria-label="Carteira"
        value={params.get("setor") ?? ""}
        onChange={(e) => set("setor", e.currentTarget.value)}
        className={selectClass}
      >
        <option value="">Todas as carteiras</option>
        {sectors.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Responsável"
        value={params.get("resp") ?? ""}
        onChange={(e) => set("resp", e.currentTarget.value)}
        className={selectClass}
      >
        <option value="">Todos os responsáveis</option>
        {people.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Prioridade"
        value={params.get("prio") ?? ""}
        onChange={(e) => set("prio", e.currentTarget.value)}
        className={selectClass}
      >
        <option value="">Todas as prioridades</option>
        <option value="CRITICAL">Crítica</option>
        <option value="HIGH">Alta ou mais</option>
        <option value="MEDIUM">Média ou mais</option>
      </select>

      <label className="relative flex items-center">
        <Search size={15} className="pointer-events-none absolute left-2.5 text-ink-soft" />
        <input
          value={q}
          aria-label="Buscar tarefa ou projeto"
          placeholder="Buscar tarefa ou projeto…"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setQ(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => set("q", v.trim()), 300);
          }}
          className="w-56 rounded-md border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </label>

      {active ? (
        <button
          type="button"
          onClick={() => startTransition(() => router.replace(pathname))}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-canvas hover:text-ink"
        >
          <X size={14} /> Limpar
        </button>
      ) : null}
    </div>
  );
}
