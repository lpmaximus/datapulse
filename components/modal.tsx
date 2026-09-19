"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, X } from "lucide-react";

/** Parâmetros de URL que abrem um registro em pop-up. Fechar = removê-los. */
export const MODAL_PARAMS = ["doc", "task", "request"] as const;

/**
 * Pop-up de um registro. O estado vive na URL (`?doc=`, `?task=`, `?request=`):
 * a página do servidor renderiza o conteúdo do registro aqui dentro, e fechar é
 * só tirar o parâmetro. Assim os formulários do pop-up são os mesmos da tela
 * completa e a lista atrás se atualiza sozinha quando algo é salvo.
 */
export function Modal({
  title,
  fullHref,
  children,
}: {
  title: string;
  /** Link para a tela completa do registro. */
  fullHref?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of MODAL_PARAMS) params.delete(key);
    router.push(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/*
        A rolagem é do corpo do pop-up, não do fundo: o cartão tem altura
        máxima e o cabeçalho fica fora da área rolável. Com o fundo rolando,
        o `sticky` grudava no topo da tela (ignorando o respiro do `p-8`) e o
        conteúdo aparecia por cima/atrás do cabeçalho.
      */}
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-line bg-canvas shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
          <span className="text-sm font-medium uppercase tracking-wider text-ink-soft">{title}</span>
          <div className="flex items-center gap-3">
            {fullHref ? (
              <Link href={fullHref} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                Abrir tela completa <ExternalLink size={12} />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={close}
              aria-label="Fechar"
              className="rounded-md p-1 text-ink-soft hover:bg-canvas hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
