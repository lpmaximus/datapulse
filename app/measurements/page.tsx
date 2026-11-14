import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, Field, inputClass } from "@/components/ui";
import { MeasurementStatusChip, PaymentStateText } from "@/components/measurement-ui";
import { formatDate } from "@/lib/format";
import { formatA1 } from "@/lib/documents";
import { formatBRL, portfolioSummary } from "@/lib/measurements";
import {
  loadMeasurableClients,
  loadMeasurableRevisions,
  loadMeasurementList,
  valueToMeasure,
} from "@/lib/server/measurement-service";
import { updateIssuer } from "@/app/actions/measurements";

export const dynamic = "force-dynamic";

export default async function MeasurementsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"], "/measurements");
  const { client } = await searchParams;
  const clients = await loadMeasurableClients(user.organizationId);
  const clientId = clients.some((c) => c.id === client) ? client : undefined;

  const [list, revisions, org] = await Promise.all([
    loadMeasurementList(user.organizationId, { clientId }),
    loadMeasurableRevisions(user.organizationId, { clientId }),
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, legalName: true, taxId: true },
    }),
  ]);

  const toMeasure = revisions.reduce((a, r) => a + valueToMeasure(r), 0);
  const noPrice = new Set(revisions.filter((r) => r.billable && r.remainingPercent > 0 && r.a1Price == null).map((r) => r.projectName));
  const summary = portfolioSummary(
    toMeasure,
    list.map((m) => ({
      status: m.status,
      total: m.totals.total,
      approvedAmount: m.approvedAmount,
      payments: [m.payment.paid],
    })),
  );

  const kpis = [
    { label: "Feito, a medir", value: summary.toMeasure, hint: "saldo das revisões medíveis" },
    { label: "Medido, aguardando aprovação", value: summary.measuredPending, hint: "BMs em rascunho ou enviados" },
    { label: "Aprovado", value: summary.approved, hint: "já descontada a glosa" },
    { label: "Recebido", value: summary.received, hint: "pagamentos registrados" },
    { label: "A receber", value: summary.receivable, hint: "aprovado − recebido", tone: "text-orange-700" },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Medições</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Boletins de medição: o que foi feito, medido e pago pelo contratante, em A1 equivalente.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/measurements/documents${clientId ? `?client=${clientId}` : ""}`}>
            <Button variant="outline">Situação por documento</Button>
          </Link>
          <Link href={`/measurements/new${clientId ? `?client=${clientId}` : ""}`}>
            <Button>Novo BM</Button>
          </Link>
        </div>
      </section>

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
        <Button variant="outline" type="submit">
          Filtrar
        </Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <p className="text-xs uppercase tracking-wider text-ink-faint">{k.label}</p>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${k.tone ?? ""}`}>{formatBRL(k.value)}</p>
            <p className="mt-1 text-xs text-ink-faint">{k.hint}</p>
          </Card>
        ))}
      </div>
      {noPrice.size ? (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          Sem valor do A1 cadastrado (fora do &quot;a medir&quot;): {[...noPrice].join(", ")}. Defina em Editar projeto.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        {list.length === 0 ? (
          <div className="p-4">
            <Empty>Nenhum boletim de medição ainda.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-ink-faint">
                <tr>
                  <th className="px-4 py-2">BM</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2">Emissão</th>
                  <th className="px-4 py-2 text-right">A1 eq</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Pagamento</th>
                  <th className="px-4 py-2 text-right">Recebido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((m) => (
                  <tr key={m.id} className="hover:bg-canvas">
                    <td className="px-4 py-2">
                      <Link href={`/measurements/${m.id}`} className="font-mono text-xs font-semibold text-accent hover:underline">
                        {m.code}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{m.clientName}</td>
                    <td className="px-4 py-2 text-ink-soft">{m.periodLabel}</td>
                    <td className="px-4 py-2">{formatDate(m.issuedAt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatA1(m.totals.a1Measured)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBRL(m.totals.total)}</td>
                    <td className="px-4 py-2">
                      <MeasurementStatusChip status={m.status} />
                    </td>
                    <td className="px-4 py-2">
                      {m.status === "SUPERSEDED" || m.status === "CANCELLED" ? (
                        <span className="text-xs text-ink-faint">—</span>
                      ) : (
                        <PaymentStateText state={m.payment.state} />
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.payment.paid ? formatBRL(m.payment.paid) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {user.role === "ADMIN" ? (
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Emissor do BM: {org?.legalName || org?.name}
            {org?.taxId ? ` · ${org.taxId}` : " · CPF/CNPJ não informado"}
          </summary>
          <form action={updateIssuer} className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <Field label="Razão social">
              <input name="legalName" defaultValue={org?.legalName ?? ""} placeholder={org?.name} className={inputClass} />
            </Field>
            <Field label="CPF/CNPJ">
              <input name="taxId" defaultValue={org?.taxId ?? ""} className={inputClass} />
            </Field>
            <Button type="submit">Salvar</Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
