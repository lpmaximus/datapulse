import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { Button, Card, Field, SectionTitle, inputClass } from "@/components/ui";
import { ConfirmSubmit, MeasurementStatusChip, PaymentStateText } from "@/components/measurement-ui";
import { formatA1 } from "@/lib/documents";
import { formatDate } from "@/lib/format";
import { formatBRL, formatPercent, isActiveMeasurement } from "@/lib/measurements";
import { loadMeasurement } from "@/lib/server/measurement-service";
import {
  addMeasurementPayment,
  approveMeasurement,
  cancelMeasurement,
  deleteMeasurement,
  deleteMeasurementPayment,
  reopenMeasurement,
  reviseMeasurement,
  sendMeasurement,
} from "@/app/actions/measurements";

export const dynamic = "force-dynamic";

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export default async function MeasurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireRole(["ADMIN", "MANAGER"], `/measurements/${id}`);
  const m = await loadMeasurement(user.organizationId, id);
  if (!m) notFound();

  const hidden = <input type="hidden" name="measurementId" value={m.id} />;
  const today = new Date().toISOString().slice(0, 10);

  // Agrupa por projeto (OS), na ordem do BM; "Outros" no fim.
  const groups: { key: string; title: string; items: typeof m.items }[] = [];
  for (const it of m.items) {
    const key = it.kind === "OTHER" ? "__other" : it.projectId ?? "__none";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        title:
          it.kind === "OTHER"
            ? "Outros"
            : `${it.osNumber ? `OS ${it.osNumber} · ` : ""}${it.projectName ?? "Projeto removido"}`,
        items: [],
      };
      groups.push(g);
    }
    g.items.push(it);
  }
  groups.sort((a, b) => (a.key === "__other" ? 1 : b.key === "__other" ? -1 : 0));
  let seq = 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/measurements" className="text-xs text-ink-faint hover:text-ink-soft">
            ← Medições
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="font-mono">{m.code}</span>
            <MeasurementStatusChip status={m.status} />
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {m.client.name} · {m.periodLabel} · emitido em {formatDate(m.issuedAt)} · por {m.issuer.name}
            {m.issuerName ? " (emissor próprio deste BM)" : ""}
            {m.previous ? (
              <>
                {" "}
                · substitui{" "}
                <Link href={`/measurements/${m.previous.id}`} className="text-accent hover:underline">
                  {m.previous.code}
                </Link>
              </>
            ) : null}
            {m.next ? (
              <>
                {" "}
                · substituído por{" "}
                <Link href={`/measurements/${m.next.id}`} className="text-accent hover:underline">
                  {m.next.code}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/reports/measurement/${m.id}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">PDF do BM</Button>
          </a>
          {m.status === "DRAFT" ? (
            <>
              <Link href={`/measurements/${m.id}/edit`}>
                <Button variant="outline">Editar itens</Button>
              </Link>
              <form action={sendMeasurement}>
                {hidden}
                <ConfirmSubmit variant="primary" confirm="Marcar como enviado ao contratante? Os itens ficam travados.">
                  Marcar como enviado
                </ConfirmSubmit>
              </form>
            </>
          ) : null}
          {m.status === "SENT" ? (
            <form action={reopenMeasurement}>
              {hidden}
              <ConfirmSubmit>Voltar para rascunho</ConfirmSubmit>
            </form>
          ) : null}
          {(m.status === "SENT" || m.status === "APPROVED") && !m.payments.length && !m.next ? (
            <form action={reviseMeasurement}>
              {hidden}
              <ConfirmSubmit
                confirm={`Criar a revisão R${String(m.revision + 1).padStart(2, "0")}? Este BM passa a Substituído e os itens são copiados para um rascunho novo.`}
              >
                Nova revisão do BM
              </ConfirmSubmit>
            </form>
          ) : null}
          {isActiveMeasurement(m.status) && !m.payments.length ? (
            <form action={cancelMeasurement}>
              {hidden}
              <ConfirmSubmit variant="danger" confirm="Cancelar o BM? Os documentos voltam a ficar disponíveis para medição.">
                Cancelar
              </ConfirmSubmit>
            </form>
          ) : null}
          {m.status === "DRAFT" && m.revision === 0 ? (
            <form action={deleteMeasurement}>
              {hidden}
              <ConfirmSubmit variant="danger" confirm="Excluir este rascunho? Não tem volta.">
                Excluir
              </ConfirmSubmit>
            </form>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <Card>
        <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Medido anterior" value={m.previousTotal ? formatBRL(m.previousTotal) : "—"} />
          <Metric label="A1 eq medido" value={formatA1(m.totals.a1Measured)} />
          <Metric label="Valor do A1" value={m.totals.uniformA1Price != null ? formatBRL(m.totals.uniformA1Price) : "variável"} />
          <Metric label="Formatos" value={formatBRL(m.totals.formats)} />
          <Metric label="Outros" value={formatBRL(m.totals.others)} />
          <Metric label="Total do período" value={formatBRL(m.totals.total)} tone="text-accent" />
        </div>
      </Card>

      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Nº serviço</th>
                <th className="px-3 py-2">SE/OSG</th>
                <th className="px-3 py-2">Data exec.</th>
                <th className="px-3 py-2">Nº doc.</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Formato</th>
                <th className="px-3 py-2 text-right">Qtd.</th>
                <th className="px-3 py-2 text-right">A1 eq</th>
                <th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2 text-right">Unitário</th>
                <th className="px-3 py-2 text-right">Valor</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key} className="border-t border-line">
                <tr className="bg-canvas/60">
                  <td colSpan={12} className="px-3 py-1.5 text-xs font-semibold text-ink-soft">
                    {g.title}
                  </td>
                </tr>
                {g.items.map((it) => {
                  seq += 1;
                  return (
                    <tr key={it.id} className="align-top">
                      <td className="px-3 py-1.5 tabular-nums">{seq}</td>
                      <td className="px-3 py-1.5 text-xs">{it.serviceNumber ?? "—"}</td>
                      <td className="px-3 py-1.5 text-xs">{it.seOsg ?? "—"}</td>
                      <td className="px-3 py-1.5 text-xs">{formatDate(it.executionDate)}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {it.documentId ? (
                          <Link href={`/documents/${it.documentId}`} className="text-accent hover:underline">
                            {it.documentNumber ?? "s/ nº"}
                          </Link>
                        ) : (
                          it.documentNumber ?? "—"
                        )}
                        {it.revisionName ? <span className="text-ink-faint"> {it.revisionName}</span> : null}
                      </td>
                      <td className="px-3 py-1.5 text-xs">{it.description}</td>
                      <td className="px-3 py-1.5 text-xs">{it.kind === "FORMAT" ? it.sheetFormat ?? "—" : it.unit ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {it.kind === "FORMAT" ? it.sheetCount : formatA1(it.quantity)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {it.kind === "FORMAT" ? formatA1(it.quantity) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatPercent(it.percent)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(it.unitPrice)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(it.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
        {m.notes ? <p className="border-t border-line px-4 py-3 text-sm text-ink-soft">Obs.: {m.notes}</p> : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Aprovação</SectionTitle>
          <Card className="space-y-3 text-sm">
            {m.status === "SENT" ? (
              <form action={approveMeasurement} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                {hidden}
                <Field label="Valor aprovado" hint="Menor que o total = glosa.">
                  <input
                    name="approvedAmount"
                    defaultValue={m.totals.total.toFixed(2).replace(".", ",")}
                    inputMode="decimal"
                    className={inputClass}
                  />
                </Field>
                <Field label="Data da aprovação">
                  <input name="approvedAt" type="date" defaultValue={today} className={inputClass} />
                </Field>
                <ConfirmSubmit variant="primary">Aprovar</ConfirmSubmit>
              </form>
            ) : m.status === "APPROVED" ? (
              <div className="space-y-1">
                <p>
                  Aprovado em {formatDate(m.approvedAt)}: <b>{formatBRL(m.payment.expected)}</b>
                </p>
                {m.payment.glosa > 0 ? (
                  <p className="text-orange-700">Glosa: {formatBRL(m.payment.glosa)}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-ink-faint">
                {m.status === "DRAFT"
                  ? "Marque como enviado para registrar a aprovação do contratante."
                  : m.status === "CANCELLED"
                    ? `Cancelado em ${formatDate(m.cancelledAt)}.`
                    : "Substituído por uma revisão posterior."}
              </p>
            )}
            {m.sentAt ? <p className="text-xs text-ink-faint">Enviado em {formatDate(m.sentAt)}</p> : null}
          </Card>
        </div>

        <div>
          <SectionTitle hint={m.status === "APPROVED" ? `saldo ${formatBRL(m.payment.balance)}` : undefined}>
            Pagamentos
          </SectionTitle>
          <Card className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <PaymentStateText state={m.payment.state} />
              <span className="tabular-nums">
                Recebido <b>{formatBRL(m.payment.paid)}</b> de {formatBRL(m.payment.expected)}
              </span>
            </div>
            {m.payments.length ? (
              <ul className="divide-y divide-line">
                {m.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span>
                      {formatDate(p.paidAt)} · <b className="tabular-nums">{formatBRL(p.amount)}</b>
                      {p.note ? <span className="text-ink-faint"> · {p.note}</span> : null}
                    </span>
                    <form action={deleteMeasurementPayment}>
                      {hidden}
                      <input type="hidden" name="paymentId" value={p.id} />
                      <ConfirmSubmit variant="danger" confirm="Excluir este pagamento?">
                        Excluir
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
            {m.status === "APPROVED" && m.payment.balance > 0 ? (
              <form action={addMeasurementPayment} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
                {hidden}
                <Field label="Data">
                  <input name="paidAt" type="date" required defaultValue={today} className={inputClass} />
                </Field>
                <Field label="Valor">
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    defaultValue={m.payment.balance.toFixed(2).replace(".", ",")}
                    className={inputClass}
                  />
                </Field>
                <Field label="Referência">
                  <input name="note" placeholder="NF, comprovante..." className={inputClass} />
                </Field>
                <ConfirmSubmit variant="primary">Registrar</ConfirmSubmit>
              </form>
            ) : m.status !== "APPROVED" ? (
              <p className="text-xs text-ink-faint">O pagamento se registra depois da aprovação.</p>
            ) : null}
          </Card>
        </div>
      </section>
    </div>
  );
}
