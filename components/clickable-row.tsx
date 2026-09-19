"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { MODAL_PARAMS } from "@/components/modal";

/**
 * Linha de tabela que abre o registro ao clicar em qualquer ponto dela.
 *
 * Com `openParam`/`openId` abre o pop-up na própria página (`?task=<id>`);
 * com `href` navega para a tela completa. Links, botões e campos dentro da
 * linha continuam funcionando sozinhos — o clique só abre quando não caiu
 * num elemento interativo.
 */
export function ClickableRow({
  href,
  openParam,
  openId,
  className,
  children,
}: {
  href?: string;
  openParam?: (typeof MODAL_PARAMS)[number];
  openId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function open() {
    if (openParam && openId) {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of MODAL_PARAMS) params.delete(key);
      params.set(openParam, openId);
      router.push(`${pathname}?${params}`, { scroll: false });
    } else if (href) {
      router.push(href);
    }
  }

  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label,summary")) return;
        open();
      }}
      className={clsx("cursor-pointer", className)}
    >
      {children}
    </tr>
  );
}
