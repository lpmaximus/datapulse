"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { createPackageAction, type PackageFormState } from "@/app/actions/packages";
import { Button, Field, inputClass } from "@/components/ui";
import { addBusinessDays, REVIEW_BUSINESS_DAYS } from "@/lib/business-days";
import { formatDate } from "@/lib/format";
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

  // Campo pedido ao usuário: a data inicial (emissão do pacote). O prazo
  // (vencimento) é calculado a partir dela — mesma regra do prazo padrão de
  // análise de documento (entrada + 5 dias úteis) — em vez de pedir pra
  // pessoa calcular isso de cabeça.
  const [initialDate, setInitialDate] = useState("");
  const deadline =
    initialDate.length === 10
      ? addBusinessDays(new Date(`${initialDate}T00:00:00.000Z`), REVIEW_BUSINESS_DAYS)
      : null;
  const deadlineIso = deadline ? deadline.toISOString().slice(0, 10) : "";

  useEffect(() => {
    if (!state.at) return;
    const form = formRef.current;
    if (!form) return;
    // Mantém o marco: quem cria pacotes costuma criar vários no mesmo marco.
    const marco = (form.elements.namedItem("marcoId") as HTMLSelectElement | null)?.value;
    form.reset();
    const field = form.elements.namedItem("marcoId") as HTMLSelectElement | null;
    if (field && marco) field.value = marco;
    setInitialDate("");
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
            <Field label="Data inicial" hint="Prazo = data inicial + 5 dias úteis.">
              <input
                type="date"
                value={initialDate}
                onChange={(e) => setInitialDate(e.currentTarget.value)}
                className={inputClass}
              />
              <input type="hidden" name="plannedDate" value={deadlineIso} />
            </Field>
            <div className="text-sm text-ink-soft sm:col-span-3">
              Prazo:{" "}
              <span className={deadline ? "font-medium text-ink" : "text-ink-faint"}>
                {deadline ? formatDate(deadline) : "— (preencha a data inicial)"}
              </span>
              {deadline ? (
                <span className="text-ink-faint"> · {REVIEW_BUSINESS_DAYS} dias úteis após a data inicial</span>
              ) : null}
            </div>

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
