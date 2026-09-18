"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import {
  fetchAccProjects,
  linkProjectToAcc,
  type AccProjectOption,
} from "@/app/actions/acc";

/**
 * Seletor de vínculo entre um projeto do DataPulse e um projeto do ACC.
 *
 * A lista de projetos do ACC é buscada sob demanda (não no render da página)
 * porque a chamada depende de token válido e pode falhar por reautorização —
 * carregar no servidor derrubaria a página inteira por causa da integração.
 */
export function AccProjectLinker({
  connectionId,
  projects,
}: {
  connectionId: string;
  projects: { id: string; name: string; clientRef: { name: string } | null }[];
}) {
  const [accProjects, setAccProjects] = useState<AccProjectOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    fetchAccProjects(connectionId)
      .then((r) => {
        if (!active) return;
        setAccProjects(r.projects);
        setError(r.error);
      })
      .catch(() => active && setError("Falha ao consultar o ACC."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [connectionId]);

  if (loading) {
    return <p className="text-sm text-ink-faint">Consultando projetos no ACC…</p>;
  }

  if (error) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (accProjects.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Nenhum projeto visível neste hub. Confirme se o app do APS foi
        provisionado na conta ACC.
      </p>
    );
  }

  return (
    <form
      action={(formData) => startTransition(() => linkProjectToAcc(formData))}
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <input type="hidden" name="connectionId" value={connectionId} />

      <Field label="Projeto no DataPulse">
        <select name="projectId" required className={inputClass}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.clientRef ? ` — ${p.clientRef.name}` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Projeto no ACC">
        <select
          name="accProjectId"
          required
          className={inputClass}
          onChange={(e) => {
            const form = e.currentTarget.form;
            const nameInput = form?.elements.namedItem("accProjectName");
            if (nameInput instanceof HTMLInputElement) {
              nameInput.value =
                e.currentTarget.options[e.currentTarget.selectedIndex]?.text ?? "";
            }
          }}
        >
          {accProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <input type="hidden" name="accProjectName" defaultValue={accProjects[0]?.name ?? ""} />

      <Button type="submit" disabled={pending}>
        {pending ? "Vinculando…" : "Vincular"}
      </Button>
    </form>
  );
}
