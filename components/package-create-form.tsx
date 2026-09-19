"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { createPackageAction, type PackageFormState } from "@/app/actions/packages";
import { Button, Field, inputClass } from "@/components/ui";
import type { MarcoOption } from "@/types/models";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Criando…" : "Criar pacote"}
    </Button>
  );
}

/**
 * Cria um pacote de revisão: a emissão (Tarefa) que traz vários documentos
 * juntos, como no ACC. O Marco é obrigatório — o pacote é o elo entre o
 * cronograma (Marco → Tarefa) e os documentos.
 */
export function PackageCreateForm({
  projectId,
  marcos,
}: {
  projectId: string;
  marcos: MarcoOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<PackageFormState, FormData>(createPackageAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.at) return;
    const form = formRef.current;
    if (!form) return;
    // Mantém o marco: quem cria pacotes costuma criar vários no mesmo marco.
    const marco = (form.elements.namedItem("marcoId") as HTMLSelectElement | null)?.value;
    form.reset();
    const field = form.elements.namedItem("marcoId") as HTMLSelectElement | null;
    if (field && marco) field.value = marco;
    (form.elements.namedItem("name") as HTMLInputElement | null)?.focus();
  }, [state.at]);

  return (
    <div className="border-b border-line bg-canvas/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Pacotes de revisão</p>
          <p className="text-xs text-ink-faint">
            Cada emissão é uma tarefa dentro de um marco. Crie o pacote e depois
            escolha-o ao cadastrar os documentos.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "outline" : "primary"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={15} /> : <Plus size={15} />}
          {open ? "Fechar" : "Novo pacote"}
        </Button>
      </div>

      {open ? (
        marcos.length === 0 ? (
          <p className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">
            Este projeto ainda não tem marco. Crie um marco no cronograma do
            projeto — todo pacote de revisão precisa estar dentro de um.
          </p>
        ) : (
          <form
            ref={formRef}
            action={action}
            className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <Field label="Marco">
              <select name="marcoId" required defaultValue="" className={inputClass}>
                <option value="">Selecione o marco</option>
                {marcos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nome do pacote" hint="Ex.: Emissão R01 — Elétrica.">
              <input name="name" required className={inputClass} placeholder="Emissão R01 — Elétrica" />
            </Field>
            <Field label="Prazo">
              <input type="date" name="plannedDate" className={inputClass} />
            </Field>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
              <Submit />
              {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
              {state.created ? (
                <p className="text-sm text-green-700">Pacote criado: {state.created}.</p>
              ) : null}
            </div>
          </form>
        )
      ) : null}
    </div>
  );
}
