"use client";

import { useRouter } from "next/navigation";
import clsx from "clsx";

/**
 * Linha de tabela que abre o registro ao clicar em qualquer ponto dela.
 *
 * Links, botões e campos dentro da linha continuam funcionando sozinhos —
 * o clique só navega quando não caiu num elemento interativo.
 */
export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label,summary")) return;
        router.push(href);
      }}
      className={clsx("cursor-pointer", className)}
    >
      {children}
    </tr>
  );
}
