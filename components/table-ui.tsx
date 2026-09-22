"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
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

/* ------------------------------------------------------------------ */
/* Colunas redimensionáveis (arrastar a borda do cabeçalho, como no Excel) */
/* ------------------------------------------------------------------ */

const MIN_COL_WIDTH = 44;

interface ColumnWidthsCtx {
  get: (key: string) => number | undefined;
  set: (key: string, px: number) => void;
}

const ColumnWidthsContext = createContext<ColumnWidthsCtx | null>(null);

/**
 * Envolve um `<table>` e guarda a largura de cada coluna (por chave estável,
 * normalmente derivada do texto do cabeçalho) em `localStorage`, por
 * `id` da tabela — cada tabela do app lembra seus próprios ajustes.
 * `table-layout: fixed` é o que faz o navegador respeitar a largura definida
 * no `<th>` em vez de recalcular pelo conteúdo.
 */
export function ResizableTable({
  id,
  className,
  children,
}: {
  /** Identificador estável da tabela (não muda por projeto/linha — só por "tipo" de tabela). */
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const storageKey = `dp-colw:${id}`;
  const [widths, setWidths] = useState<Record<string, number>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Carrega os ajustes salvos só no cliente, depois da hidratação — evita
  // divergência entre o HTML do servidor e o do cliente.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setWidths(JSON.parse(raw));
    } catch {
      // localStorage indisponível (modo privado, quota) — segue com os padrões.
    }
  }, [storageKey]);

  const ctx = useMemo<ColumnWidthsCtx>(
    () => ({
      get: (key) => widths[key],
      set: (key, px) => {
        setWidths((prev) => {
          const next = { ...prev, [key]: px };
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            try {
              window.localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
              // idem — não é crítico persistir.
            }
          }, 200);
          return next;
        });
      },
    }),
    [widths, storageKey],
  );

  return (
    <ColumnWidthsContext.Provider value={ctx}>
      <table style={{ tableLayout: "fixed" }} className={className}>
        {children}
      </table>
    </ColumnWidthsContext.Provider>
  );
}

function parseDefaultWidth(className?: string): number | undefined {
  if (!className) return undefined;
  const px = className.match(/w-\[(\d+)px\]/);
  if (px) return Number(px[1]);
  const n = className.match(/(?:^|\s)w-(\d+)(?:\s|$)/);
  if (n) return Number(n[1]) * 4;
  return undefined;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

/** A alça arrastável na borda direita do cabeçalho. Só existe dentro de um `ResizableTable`. */
function ColumnResizeHandle({
  onCommit,
  getStartWidth,
}: {
  onCommit: (px: number) => void;
  getStartWidth: (cell: HTMLElement) => number;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar coluna"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const cell = e.currentTarget.parentElement as HTMLElement | null;
        if (!cell) return;
        const startX = e.clientX;
        const startWidth = getStartWidth(cell);
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);

        function widthAt(ev: PointerEvent) {
          return Math.max(MIN_COL_WIDTH, Math.round(startWidth + (ev.clientX - startX)));
        }
        function onMove(ev: PointerEvent) {
          cell!.style.width = `${widthAt(ev)}px`;
        }
        function onUp(ev: PointerEvent) {
          onCommit(widthAt(ev));
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
        }
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp, { once: true });
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none select-none hover:bg-accent/60 active:bg-accent"
    />
  );
}

/**
 * Célula de cabeçalho genérica e redimensionável — usada pelo `Th` abaixo e
 * por tabelas que não usam `Th`/`Td` (ex.: grades com `<th>` cru), passando
 * `as="th"` e a própria classe visual.
 */
export function ResizableCell({
  as: As = "th",
  resizeKey,
  defaultWidth,
  resizable = true,
  className,
  children,
}: {
  as?: "th" | "td";
  /** Chave estável da coluna dentro da tabela. Sem ela, a célula não fica redimensionável. */
  resizeKey?: string;
  defaultWidth?: number;
  resizable?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const ctx = useContext(ColumnWidthsContext);
  const width = resizeKey ? ctx?.get(resizeKey) ?? defaultWidth : defaultWidth;
  const canResize = resizable && !!ctx && !!resizeKey;

  return (
    <As
      style={width != null ? { width } : undefined}
      className={clsx("relative overflow-hidden", className)}
    >
      {children}
      {canResize ? (
        <ColumnResizeHandle
          getStartWidth={(cell) => cell.getBoundingClientRect().width}
          onCommit={(px) => ctx!.set(resizeKey!, px)}
        />
      ) : null}
    </As>
  );
}

export function Th({
  children,
  align = "left",
  className,
  resizeKey,
  resizable = true,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Chave estável para lembrar a largura ajustada. Por padrão, deriva do texto do cabeçalho. */
  resizeKey?: string;
  /** false para colunas utilitárias (checkbox, ações) que não fazem sentido redimensionar. */
  resizable?: boolean;
}) {
  const key = resizeKey ?? (typeof children === "string" ? slugify(children) : undefined);

  return (
    <ResizableCell
      as="th"
      resizeKey={key}
      defaultWidth={parseDefaultWidth(className)}
      resizable={resizable}
      className={clsx(
        "whitespace-nowrap border-b border-r border-line px-3 py-2 text-[13px] font-normal text-ink-soft last:border-r-0",
        align === "right" ? "text-right" : "text-center",
        className,
      )}
    >
      <span className="block truncate">{children}</span>
    </ResizableCell>
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
        "overflow-hidden text-ellipsis whitespace-nowrap border-r border-line px-3 py-2 text-sm text-ink last:border-r-0",
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
