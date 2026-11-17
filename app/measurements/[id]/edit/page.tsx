import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { MeasurementForm, type FormatLine } from "@/components/measurement-form";
import { STATUS_LABEL, type DocumentStatus } from "@/lib/documents";
import {
  loadAssigneeSuggestions,
  loadMeasurableRevisions,
  loadMeasurement,
  toFormRow,
} from "@/lib/server/measurement-service";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const br = (n: number) => String(n).replace(".", ",");

export default async function EditMeasurementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["ADMIN", "MANAGER"], `/measurements/${id}/edit`);
  const m = await loadMeasurement(user.organizationId, id);
  if (!m) notFound();
  if (m.status !== "DRAFT") redirect(`/measurements/${id}`);

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true, legalName: true, taxId: true },
  });
  const revisions = await loadMeasurableRevisions(user.organizationId, {
    clientId: m.client.id,
    excludeMeasurementId: m.id,
  });
  const rows = revisions.map((r) => toFormRow(r, (s) => STATUS_LABEL[s as DocumentStatus] ?? s));
  // Data do sistema por revisão: preenche a linha quando o BM foi montado
  // antes de a data de envio existir.
  const knownDate = new Map(revisions.map((r) => [r.revisionId, r.issuedAt]));
  const initialLines: FormatLine[] = m.items
    .filter((it) => it.kind === "FORMAT" && it.revisionId)
    .map((it) => ({
      key: it.id,
      revisionId: it.revisionId!,
      sheets: String(it.sheetCount),
      percent: br(it.percent),
      price: br(it.unitPrice),
      date: iso(it.executionDate ?? knownDate.get(it.revisionId!) ?? null),
      assignee: it.assigneeName ?? "",
    }));
  const assignees = await loadAssigneeSuggestions(user.organizationId);
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
        orgIssuer={{ name: org?.legalName || org?.name || "", taxId: org?.taxId ?? null }}
        rows={rows}
        assignees={assignees}
        initialLines={initialLines}
        initialOthers={initialOthers}
        submitLabel="Salvar rascunho"
        defaults={{
          measurementId: m.id,
          issuerName: m.issuerName ?? "",
          issuerTaxId: m.issuerTaxId ?? "",
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
