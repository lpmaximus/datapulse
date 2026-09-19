import type { PackageOption } from "@/types/models";

/**
 * Seleção do pacote de revisão (Tarefa) em que o documento é emitido.
 * Agrupa por Marco (e por projeto, na visão geral) — sem estado, serve tanto
 * a formulários de cliente quanto de servidor. `form` liga o campo a um
 * formulário externo (linha de entrada da tabela).
 */
export function PackageSelect({
  packages,
  showProject = false,
  className,
  form,
  defaultValue = "",
  ariaLabel = "Pacote de revisão",
}: {
  packages: PackageOption[];
  showProject?: boolean;
  className?: string;
  form?: string;
  defaultValue?: string;
  ariaLabel?: string;
}) {
  const groups = new Map<string, { label: string; items: PackageOption[] }>();
  for (const p of packages) {
    const key = `${p.projectId}|${p.marcoId}`;
    const label = showProject ? `${p.projectName} › ${p.marcoName}` : p.marcoName;
    const g = groups.get(key) ?? { label, items: [] };
    g.items.push(p);
    groups.set(key, g);
  }

  return (
    <select
      form={form}
      name="packageId"
      required
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={className}
    >
      <option value="">{packages.length === 0 ? "Sem pacote — crie um" : "Pacote…"}</option>
      {[...groups.entries()].map(([key, g]) => (
        <optgroup key={key} label={g.label}>
          {g.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
