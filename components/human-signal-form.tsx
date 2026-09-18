"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitHumanSignal, type SignalFormState } from "@/app/actions/signals";
import { Button, Field, inputClass } from "@/components/ui";

const CONFIDENCE_LABEL: Record<number, string> = {
  1: "Nenhuma confiança",
  2: "Pouca",
  3: "Média",
  4: "Boa",
  5: "Confiança total",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enviando…" : "Enviar avaliação"}
    </Button>
  );
}

/**
 * Camada 2 — formulário de sinal humano.
 * Deliberadamente curto: fricção alta aqui mata a coleta, que é o principal
 * critério de go/no-go do piloto.
 */
export function HumanSignalForm({ milestoneId }: { milestoneId: string }) {
  const [state, formAction] = useActionState<SignalFormState, FormData>(
    submitHumanSignal,
    {},
  );
  const [probability, setProbability] = useState(30);
  const [confidence, setConfidence] = useState(3);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="milestoneId" value={milestoneId} />

      <Field
        label={`Probabilidade de esta tarefa falhar ou atrasar: ${probability}%`}
        hint="Sua leitura técnica, não a oficial do cronograma."
      >
        <input
          type="range"
          name="failureProbability"
          min={0}
          max={100}
          step={5}
          value={probability}
          onChange={(e) => setProbability(Number(e.target.value))}
          className="w-full accent-cyan-700"
        />
      </Field>

      <Field
        label={`Confiança no plano atual: ${confidence} — ${CONFIDENCE_LABEL[confidence]}`}
        hint="O plano vigente ainda descreve a realidade?"
      >
        <input
          type="range"
          name="planConfidence"
          min={1}
          max={5}
          step={1}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="w-full accent-cyan-700"
        />
      </Field>

      <Field label="Gargalo percebido" hint="O que trava, na prática?">
        <textarea
          name="perceivedBottleneck"
          rows={3}
          className={inputClass}
          placeholder="Ex.: aprovação do cliente parada há 3 semanas na revisão elétrica"
        />
      </Field>

      <Field label="Seu papel no projeto">
        <input
          name="respondentRole"
          className={inputClass}
          placeholder="Engenharia, Planejamento, Suprimentos…"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="blockedDecision"
          className="h-4 w-4 accent-cyan-700"
        />
        Existe decisão travada aguardando terceiros
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton />
        {state.ok ? (
          <span className="text-sm text-green-400">
            Registrado. O DRI foi recalculado.
          </span>
        ) : null}
        {state.error ? (
          <span className="text-sm text-red-400">{state.error}</span>
        ) : null}
      </div>

      <p className="text-xs text-ink-faint">
        Sua resposta é armazenada de forma pseudonimizada e exibida apenas de
        forma agregada.
      </p>
    </form>
  );
}
