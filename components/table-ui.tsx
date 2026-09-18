"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, RefreshCw, Search } from "lucide-react";

/**
 * Barra de ações do quadro, no padrão do monday.com: ação principal,
 * busca que expande ao focar e atualizar. A busca escreve `?<searchParam>=` na URL (debounced) para o
 * Server Component da página refazer a query filtrada — sem duplicar os
 * dados no cliente.
 */
export function Toolbar({
  placeholder = "Pesquisar",
  searchParam = "q",
  leftSlot,
  rightSlot,
}: {
  placeholder?: string;
  searchParam?: string;
  /** Ação principal à esquerda (ex.: botão "Criar"), como no monday. */
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [value, setValue] = useState(searchParams.get(searchParam) ?? "");

  useEffect(() => {
    setValue(searchParams.get(searchParam) ?? "");
    // Só ao trocar de página — não queremos sobrescrever o que o usuário digita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function push(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(searchParam, next);
    else params.delete(searchParam);
    startTransition(() => {
      router.replace(params.size ? `${pathname}?${params}` : pathname);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-1 py-3">
      {leftSlot ? <div className="mr-2 flex items-center">{leftSlot}</div> : null}

      <label className="group relative flex items-center">
        <Search
          size={15}
          className="pointer-events-none absolute left-2.5 text-ink-soft group-focus-within:text-accent"
        />
        <input
          value={value}
          placeholder={placeholder}
          aria-label="Pesquisar"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setValue(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => push(v), 300);
          }}
          className={clsx(
            "rounded-md border py-1.5 pl-8 pr-3 text-sm text-ink transition-[width,border-color] placeholder:text-ink-soft focus:outline-none",
            value
              ? "w-72 border-accent bg-surface"
              : "w-32 border-transparent bg-transparent hover:bg-canvas focus:w-72 focus:border-accent focus:bg-surface",
          )}
        />
      </label>

      <button
        type="button"
        aria-label="Atualizar"
        onClick={() => router.refresh()}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-canvas hover:text-ink"
      >
        <RefreshCw size={14} className={clsx(pending && "animate-spin text-accent")} />
        Atualizar
      </button>

      {rightSlot ? <div className="ml-auto flex items-center gap-2">{rightSlot}</div> : null}
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={clsx(
        "whitespace-nowrap border-b border-r border-line px-3 py-2 text-[13px] font-normal text-ink-soft last:border-r-0",
        align === "right" ? "text-right" : "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={clsx(
        "whitespace-nowrap border-r border-line px-3 py-2 text-sm text-ink last:border-r-0",
        align === "right" ? "text-right tabular-nums" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function RowCheckbox() {
  // Decorativo no MVP: seleção em massa fica para quando houver ação em lote
  // (ex.: pausar vários projetos). A caixa já existe para não redesenhar a
  // tabela quando essa ação chegar.
  return (
    <input
      type="checkbox"
      onClick={(e) => e.stopPropagation()}
      className="h-3.5 w-3.5 rounded border-line-strong text-accent accent-blue-600"
    />
  );
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-500",
  PAUSED: "bg-ink-faint",
  CLOSED: "bg-ink",
  ERROR: "bg-red-500",
  NEW: "bg-accent",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  CLOSED: "Encerrado",
  ERROR: "Sem sinais",
  NEW: "Novo",
};

export function StatusDot({ status }: { status: keyof typeof STATUS_LABEL }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
      <span className={clsx("h-1.5 w-1.5 rounded-full", STATUS_STYLE[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Toggle ativar/pausar que se autossubmete via Server Action — replica o
 * comportamento do "Ativar/des" da tabela de referência sem exigir um
 * cliente de estado global.
 */
export function StatusToggle({
  action,
  id,
  fieldName,
  checked,
  disabled,
  extraFields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  fieldName: string;
  checked: boolean;
  disabled?: boolean;
  /** Campos ocultos extras (ex.: discriminador de tabela). */
  extraFields?: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={action}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const form = e.currentTarget;
        startTransition(() => {
          action(new FormData(form));
        });
      }}
    >
      <input type="hidden" name={fieldName} value={id} />
      {extraFields
        ? Object.entries(extraFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      <input
        type="checkbox"
        name="active"
        defaultChecked={checked}
        disabled={disabled || pending}
        className="dp-toggle"
      />
    </form>
  );
}

/** Linhas escondidas por padrão, com contador — igual ao grupo de "rascunhos". */
export function CollapsibleGroup({
  label,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer border-b border-line hover:bg-canvas"
      >
        <td colSpan={99} className="px-3 py-2.5 text-sm font-medium text-st-purple">
          <span className="inline-flex items-center gap-1.5">
            <ChevronDown
              size={16}
              className={clsx("transition-transform", !open && "-rotate-90")}
            />
            Você tem {count} {label}
          </span>
        </td>
      </tr>
      {open ? children : null}
    </>
  );
}

/** Ações que só aparecem no hover da linha (padrão "Ver relatório / Editar / Duplicar"). */
export function RowActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 hidden items-center gap-3 text-xs text-accent group-hover:flex">
      {children}
    </div>
  );
}
