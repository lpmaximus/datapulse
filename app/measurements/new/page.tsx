import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { Button, Card, Empty, Field, inputClass } from "@/components/ui";
import { MeasurementForm } from "@/components/measurement-form";
import { STATUS_LABEL, type DocumentStatus } from "@/lib/documents";
import { suggestMeasurementNumber } from "@/lib/measurements";
import { loadMeasurableClients, loadMeasurableRevisions, toFormRow } from "@/lib/server/measurement-service";

export const dynamic = "force-dynamic";

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export default async function NewMeasurementPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"], "/measurements/new");
  const { client } = await searchParams;
  const clients = await loadMeasurableClients(user.organizationId);
  const selected = clients.find((c) => c.id === client);

  const header = (
    <div>
      <Link href="/measurements" className="text-xs text-ink-faint hover:text-ink-soft">
        ← Medições
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Novo boletim de medição</h1>
    </div>
  );

  if (!selected) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          {clients.length === 0 ? (
            <Empty>Cadastre o cliente no projeto antes de medir (Editar projeto → Cliente).</Empty>
          ) : (
            <form className="flex flex-wrap items-end gap-3">
              <Field label="Cliente a medir" hint="Um BM pode juntar documentos de várias OS do mesmo cliente.">
                <select name="client" required className={inputClass + " min-w-64"} defaultValue="">
                  <option value="" disabled>
                    Escolha...
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit">Continuar</Button>
            </form>
          )}
        </Card>
      </div>
    );
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const count = await prisma.measurement.count({
    where: { organizationId: user.organizationId, clientId: selected.id, revision: 0 },
  });
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true, legalName: true, taxId: true },
  });
  const revisions = await loadMeasurableRevisions(user.organizationId, { clientId: selected.id });
  const rows = revisions.map((r) => toFormRow(r, (s) => STATUS_LABEL[s as DocumentStatus] ?? s));

  return (
    <div className="space-y-6">
      {header}
      <MeasurementForm
        clientId={selected.id}
        clientName={selected.name}
        orgIssuer={{ name: org?.legalName || org?.name || "", taxId: org?.taxId ?? null }}
        rows={rows}
        submitLabel="Criar BM (rascunho)"
        defaults={{
          issuerName: "",
          issuerTaxId: "",
          number: suggestMeasurementNumber(selected.code || selected.name.split(/\s+/)[0], year, count + 1),
          periodLabel: `MEDIÇÃO ${MONTHS[now.getUTCMonth()]} ${year}`,
          periodStart: "",
          periodEnd: "",
          issuedAt: now.toISOString().slice(0, 10),
          notes: "",
        }}
      />
    </div>
  );
}
