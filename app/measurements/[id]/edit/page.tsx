import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { MeasurementForm } from "@/components/measurement-form";
import { STATUS_LABEL, type DocumentStatus } from "@/lib/documents";
import { loadMeasurableRevisions, loadMeasurement, toFormRow } from "@/lib/server/measurement-service";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const br = (n: number) => String(n).replace(".", ",");

export default async function EditMeasurementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["ADMIN", "MANAGER"], `/measurements/${id}/edit`);
  const m = await loadMeasurement(user.organizationId, id);
  if (!m) notFound();
  if (m.status !== "DRAFT") redirect(`/measurements/${id}`);

  const revisions = await loadMeasurableRevisions(user.organizationId, {
    clientId: m.client.id,
    excludeMeasurementId: m.id,
  });
  const rows = revisions.map((r) => toFormRow(r, (s) => STATUS_LABEL[s as DocumentStatus] ?? s));
  const initialSelection: Record<string, { percent: string; price: string }> = {};
  for (const it of m.items) {
    if (it.kind === "FORMAT" && it.revisionId) {
      initialSelection[it.revisionId] = { percent: br(it.percent), price: br(it.unitPrice) };
    }
  }
  const initialOthers = m.items
    .filter((it) => it.kind === "OTHER")
    .map((it) => ({ description: it.description, qty: br(it.quantity), unit: it.unit ?? "", price: br(it.unitPrice) }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/measurements/${m.id}`} className="text-xs text-ink-faint hover:text-ink-soft">
          ← {m.code}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Editar {m.code}</h1>
      </div>
      <MeasurementForm
        clientId={m.client.id}
        clientName={m.client.name}
        rows={rows}
        initialSelection={initialSelection}
        initialOthers={initialOthers}
        submitLabel="Salvar rascunho"
        defaults={{
          measurementId: m.id,
          number: m.number,
          periodLabel: m.periodLabel,
          periodStart: iso(m.periodStart),
          periodEnd: iso(m.periodEnd),
          issuedAt: iso(m.issuedAt),
          notes: m.notes ?? "",
        }}
      />
    </div>
  );
}
