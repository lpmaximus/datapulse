import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { Button, Empty, Field, inputClass } from "@/components/ui";
import { ConfirmSubmit } from "@/components/measurement-ui";
import { STATUS_LABEL, formatA1, type DocumentStatus } from "@/lib/documents";
import { formatBRL, formatPercent } from "@/lib/measurements";
import {
  loadMeasurableClients,
  loadMeasurableRevisions,
  valueToMeasure,
  type MeasurableRevision,
} from "@/lib/server/measurement-service";
import { setRevisionBillable } from "@/app/actions/measurements";

export const dynamic = "force-dynamic";

type Stage = "na" | "open" | "partial" | "measured" | "paid";

const STAGE_LABEL: Record<Stage, string> = {
  na: "Não medível",
  open: "A medir",
  partial: "Medido parcial",
  measured: "Medido",
  paid: "Pago",
};

const STAGE_CLASS: Record<Stage, string> = {
  na: "text-ink-faint",
  open: "text-orange-700",
  partial: "text-yellow-700",
  measured: "text-purple-700",
  paid: "text-green-700",
};

function stageOf(r: MeasurableRevision): Stage {
  if (!r.billable) return "na";
  if (r.measuredPercent <= 0) return "open";
  if (r.remainingPercent > 0) return "partial";
  return r.measurements.length && r.measurements.every((m) => m.paid) ? "paid" : "measured";
}

/**
 * Feito × medido × pago, documento a documento. Também é onde se marca uma
 * revisão posterior como cobrável (mudança de escopo acordada).
 */
export default async function MeasurementDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; stage?: string; error?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"], "/measurements/documents");
  const { client, stage, error } = await searchParams;
  const clients = await loadMeasurableClients(user.organizationId);
  const clientId = clients.some((c) => c.id === client) ? client : undefined;
  const all = await loadMeasurableRevisions(user.organizationId, { clientId });

  const withStage = all.map((r) => ({ r, stage: stageOf(r) }));
  const counts = withStage.reduce<Record<string, number>>((acc, x) => {
    acc[x.stage] = (acc[x.stage] ?? 0) + 1;
    return acc;
  }, {});
  const rows = stage ? withStage.filter((x) => x.stage === stage) : withStage;
  const qs = new URLSearchParams();
  if (clientId) qs.set("client", clientId);
  if (stage) qs.set("stage", stage);
  const returnTo = `/measurements/documents${qs.size ? `?${qs}` : ""}`;

  return (
    <div className="space-y-6">
      <section>
        <Link href={`/measurements${clientId ? `?client=${clientId}` : ""}`} className="text-xs text-ink-faint hover:text-ink-soft">
          ← Medições
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Situação por documento</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Cada revisão: se é medível, quanto já foi medido, em qual BM e se foi paga. A primeira revisão é sempre
          medível; as seguintes, só com mudança de escopo acordada com o contratante.
        </p>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <form className="flex flex-wrap items-end gap-3">
        <Field label="Cliente">
          <select name="client" defaultValue={clientId ?? ""} className={inputClass + " min-w-56"}>
            <option value="">Todos</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Situação">
          <select name="stage" defaultValue={stage ?? ""} className={inputClass + " min-w-44"}>
            <option value="">Todas ({all.length})</option>
            {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]} ({counts[s] ?? 0})
              </option>
            ))}
          </select>
        </Field>
        <Button variant="outline" type="submit">
          Filtrar
        </Button>
      </form>

      {rows.length === 0 ? (
        <Empty>Nenhuma revisão nesta seleção.</Empty>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-3 py-2">Projeto</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Rev.</th>
                <th className="px-3 py-2 text-right">A1 eq</th>
                <th className="px-3 py-2">Medição</th>
                <th className="px-3 py-2 text-right">Medido</th>
                <th className="px-3 py-2">BMs</th>
                <th className="px-3 py-2 text-right">A medir</th>
                <th className="px-3 py-2">Cobrável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ r, stage: st }) => (
                <tr key={r.revisionId} className="align-top">
                  <td className="px-3 py-1.5 text-xs">
                    {r.osNumber ? <span className="block text-ink-faint">OS {r.osNumber}</span> : null}
                    {r.projectName}
                  </td>
                  <td className="px-3 py-1.5">
                    <Link href={`/documents/${r.documentId}`} className="font-mono text-xs text-accent hover:underline">
                      {r.documentNumber ?? "s/ nº"}
                    </Link>
                    <span className="block text-xs text-ink-soft">{r.documentName}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {r.revisionName}
                    <span className="block font-sans text-[11px] text-ink-faint">
                      {STATUS_LABEL[r.revisionStatus as DocumentStatus] ?? r.revisionStatus}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.a1Eq != null ? formatA1(r.a1Eq) : "—"}</td>
                  <td className={`px-3 py-1.5 text-xs font-medium ${STAGE_CLASS[st]}`}>{STAGE_LABEL[st]}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                    {r.measuredPercent > 0 ? formatPercent(r.measuredPercent) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {r.measurements.map((m) => (
                      <Link key={m.id} href={`/measurements/${m.id}`} className="block text-accent hover:underline">
                        {m.code} ({formatPercent(m.percent)}){m.paid ? " · pago" : ""}
                      </Link>
                    ))}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                    {r.billable && r.remainingPercent > 0
                      ? r.a1Price != null
                        ? formatBRL(valueToMeasure(r))
                        : "sem valor A1"
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {r.isFirstRevision ? (
                      <span className="text-ink-faint">1ª revisão</span>
                    ) : r.revisionStatus === "CANCELLED" ? (
                      <span className="text-ink-faint">cancelada</span>
                    ) : r.billable ? (
                      <form action={setRevisionBillable} className="flex items-center gap-2">
                        <input type="hidden" name="revisionId" value={r.revisionId} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <input type="hidden" name="billable" value="0" />
                        <span className="text-green-700" title={r.billableNote ?? undefined}>
                          escopo acordado{r.billableNote ? `: ${r.billableNote}` : ""}
                        </span>
                        {r.measuredPercent <= 0 ? (
                          <ConfirmSubmit confirm="Desmarcar esta revisão como cobrável?">Desmarcar</ConfirmSubmit>
                        ) : null}
                      </form>
                    ) : (
                      <form action={setRevisionBillable} className="flex items-center gap-2">
                        <input type="hidden" name="revisionId" value={r.revisionId} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <input type="hidden" name="billable" value="1" />
                        <input
                          name="billableNote"
                          required
                          placeholder="Acordo (e-mail, data)"
                          className={inputClass + " w-44 py-1 text-xs"}
                        />
                        <ConfirmSubmit>Cobrar</ConfirmSubmit>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
