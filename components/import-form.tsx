"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { importSystemicSignals, type ImportState } from "@/app/actions/import";
import { Button, Field, inputClass } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Importando…" : "Importar"}
    </Button>
  );
}

const FIELD_LABEL: Record<string, string> = {
  milestoneName: "Marco",
  plannedDate: "Data planejada",
  actualDate: "Data real",
  delayDays: "Atraso (dias)",
  plannedCost: "Custo previsto",
  actualCost: "Custo realizado",
  openIssues: "Issues abertas",
  replanCount: "Replanejamentos",
};

export function ImportForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState<ImportState, FormData>(
    importSystemicSignals,
    {},
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="projectId" value={projectId} />
        <Field
          label="Planilha de cronograma / custo"
          hint="CSV ou XLSX, até 8 MB. Marcos novos são criados automaticamente."
        >
          <input
            type="file"
            name="file"
            accept=".csv,.txt,.xlsx,.xls"
            required
            className={inputClass}
          />
        </Field>
        <SubmitButton />
      </form>

      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.ok ? (
        <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <p>
            {state.imported} linha(s) importada(s)
            {state.createdMilestones
              ? `, ${state.createdMilestones} marco(s) criado(s)`
              : ""}
            . DRI recalculado.
          </p>
          {state.warnings && state.warnings.length > 0 ? (
            <details className="text-xs text-yellow-700">
              <summary className="cursor-pointer">
                {state.warnings.length} linha(s) ignorada(s)
              </summary>
              <ul className="mt-2 space-y-1">
                {state.warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {state.detectedColumns ? (
        <div className="rounded-lg border border-line p-4 text-xs">
          <p className="mb-2 font-medium text-ink">Colunas reconhecidas</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {Object.entries(state.detectedColumns).map(([field, col]) => (
              <li key={field} className="flex justify-between gap-3">
                <span className="text-ink-faint">{FIELD_LABEL[field] ?? field}</span>
                <span className={col ? "text-ink" : "text-ink-faint italic"}>
                  {col ?? "não encontrada"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
