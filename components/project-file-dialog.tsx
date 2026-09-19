"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import { ProjectFileUpload } from "@/components/project-file-upload";

/**
 * Botão "Enviar arquivo" que abre o cadastro num pop-up, no padrão das
 * listas: a lista é a tela e o cadastro é uma ação em cima dela.
 */
export function ProjectFileDialog({
  projectId,
  kindSuggestions,
}: {
  projectId: string;
  kindSuggestions: string[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Enviar arquivo
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enviar arquivo"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-canvas shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
              <span className="text-sm font-medium uppercase tracking-wider text-ink-soft">
                Enviar arquivo
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="rounded-md p-1 text-ink-soft hover:bg-canvas hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              <ProjectFileUpload
                projectId={projectId}
                kindSuggestions={kindSuggestions}
                onDone={() => setOpen(false)}
                onCancel={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
