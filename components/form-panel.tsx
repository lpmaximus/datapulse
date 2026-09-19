"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Painel recolhido para o formulário completo de cadastro.
 *
 * A lista é a tela inicial; quem prefere o formulário inteiro abre este
 * painel. Um link `#<id>` em qualquer lugar da página também o abre.
 */
export function FormPanel({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash === `#${id}`) setOpen(true);
    const onHash = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    // Clicar em um link para a âncora que já está na URL não dispara hashchange.
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest(`a[href="#${id}"]`)) setOpen(true);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, [id]);

  return (
    <div id={id} className="scroll-mt-20 space-y-3">
      <Button type="button" variant={open ? "outline" : "primary"} onClick={() => setOpen((v) => !v)}>
        {open ? <X size={15} /> : <Plus size={15} />}
        {open ? "Fechar formulário" : label}
      </Button>
      {open ? (
        <div className="rounded-lg border border-line bg-surface p-5">{children}</div>
      ) : null}
    </div>
  );
}
