import { prisma } from "@/lib/prisma";
import { a1Equivalent, type SheetFormat } from "@/lib/documents";
import { toNumber } from "@/lib/format";
import {
  billableRevisionIds,
  isActiveMeasurement,
  measuredPercentByRevision,
  measurementCode,
  measurementTotals,
  paymentSummary,
  previousMeasuredTotal,
  remainingPercent,
  round2,
  type MeasurementItemKind,
  type MeasurementStatus,
  type PaymentSummary,
  type MeasurementTotals,
} from "@/lib/measurements";

/**
 * Leitura do módulo de medição. Tudo filtrado por organização — BM, cliente,
 * projeto e revisão chegam aqui por id de formulário/URL e são validados
 * contra o tenant antes de qualquer uso.
 */

/** Linha de revisão como aparece na seleção do BM e no painel por documento. */
export interface MeasurableRevision {
  revisionId: string;
  documentId: string;
  projectId: string;
  projectName: string;
  osNumber: string | null;
  serviceNumber: string | null;
  seOsg: string | null;
  a1Price: number | null;
  documentNumber: string | null;
  documentName: string;
  revisionName: string;
  revisionStatus: string;
  productionProgress: number;
  issuedAt: Date | null;
  sheetFormat: SheetFormat | null;
  sheetCount: number;
  a1Eq: number | null;
  billable: boolean;
  billableNote: string | null;
  isFirstRevision: boolean;
  measuredPercent: number;
  remainingPercent: number;
  /** BMs ativos em que a revisão está (código + % + situação do pagamento). */
  measurements: { id: string; code: string; percent: number; status: MeasurementStatus; paid: boolean }[];
}

/**
 * Revisões dos projetos de um cliente (ou de toda a organização), com o que
 * já foi medido. `excludeMeasurementId`: o BM em edição não conta contra ele
 * mesmo.
 */
export async function loadMeasurableRevisions(
  organizationId: string,
  opts: { clientId?: string; excludeMeasurementId?: string } = {},
): Promise<MeasurableRevision[]> {
  const docs = await prisma.document.findMany({
    where: {
      project: { organizationId, ...(opts.clientId ? { clientId: opts.clientId } : {}) },
    },
    orderBy: [{ project: { name: "asc" } }, { number: "asc" }, { name: "asc" }],
    select: {
      id: true,
      number: true,
      name: true,
      sheetFormat: true,
      sheetCount: true,
      project: {
        select: { id: true, name: true, osNumber: true, serviceNumber: true, seOsg: true, a1Price: true },
      },
      revisions: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          name: true,
          sequence: true,
          status: true,
          billable: true,
          billableNote: true,
          productionProgress: true,
          issuedAt: true,
          measurementItems: {
            select: {
              percent: true,
              measurement: {
                select: {
                  id: true,
                  number: true,
                  revision: true,
                  status: true,
                  approvedAmount: true,
                  items: { select: { amount: true } },
                  payments: { select: { amount: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const out: MeasurableRevision[] = [];
  for (const d of docs) {
    const billable = billableRevisionIds(d.revisions);
    const first = d.revisions[0]?.id;
    for (const r of d.revisions) {
      const lines = r.measurementItems.map((it) => ({
        revisionId: r.id,
        percent: toNumber(it.percent) ?? 0,
        measurementStatus: it.measurement.status as MeasurementStatus,
        measurementId: it.measurement.id,
      }));
      const measured = measuredPercentByRevision(lines, opts.excludeMeasurementId).get(r.id) ?? 0;
      const a1Eq = a1Equivalent(d.sheetFormat as SheetFormat | null, d.sheetCount);
      out.push({
        revisionId: r.id,
        documentId: d.id,
        projectId: d.project.id,
        projectName: d.project.name,
        osNumber: d.project.osNumber,
        serviceNumber: d.project.serviceNumber,
        seOsg: d.project.seOsg,
        a1Price: toNumber(d.project.a1Price),
        documentNumber: d.number,
        documentName: d.name,
        revisionName: r.name,
        revisionStatus: r.status,
        productionProgress: r.productionProgress,
        issuedAt: r.issuedAt,
        sheetFormat: d.sheetFormat as SheetFormat | null,
        sheetCount: d.sheetCount,
        a1Eq,
        billable: billable.has(r.id),
        billableNote: r.billableNote,
        isFirstRevision: r.id === first,
        measuredPercent: measured,
        remainingPercent: remainingPercent(measured),
        measurements: r.measurementItems
          .filter((it) => isActiveMeasurement(it.measurement.status as MeasurementStatus))
          .map((it) => {
            const m = it.measurement;
            const total = round2(m.items.reduce((a, i) => a + (toNumber(i.amount) ?? 0), 0));
            const pay = paymentSummary({
              status: m.status as MeasurementStatus,
              total,
              approvedAmount: toNumber(m.approvedAmount),
              payments: m.payments.map((p) => toNumber(p.amount) ?? 0),
            });
            return {
              id: m.id,
              code: measurementCode(m.number, m.revision),
              percent: toNumber(it.percent) ?? 0,
              status: m.status as MeasurementStatus,
              paid: pay.state === "PAID",
            };
          }),
      });
    }
  }
  return out;
}

/** Valor ainda a medir de uma revisão (saldo de % × A1 eq × valor do A1). */
export function valueToMeasure(r: MeasurableRevision): number {
  if (!r.billable || r.a1Eq == null || r.a1Price == null) return 0;
  return round2(r.a1Eq * (r.remainingPercent / 100) * r.a1Price);
}

export interface MeasurementListRow {
  id: string;
  code: string;
  number: string;
  revision: number;
  clientName: string;
  periodLabel: string;
  issuedAt: Date;
  createdAt: Date;
  status: MeasurementStatus;
  totals: MeasurementTotals;
  approvedAmount: number | null;
  payment: PaymentSummary;
  itemCount: number;
}

export async function loadMeasurementList(
  organizationId: string,
  opts: { clientId?: string } = {},
): Promise<MeasurementListRow[]> {
  const rows = await prisma.measurement.findMany({
    where: { organizationId, ...(opts.clientId ? { clientId: opts.clientId } : {}) },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      number: true,
      revision: true,
      periodLabel: true,
      issuedAt: true,
      createdAt: true,
      status: true,
      approvedAmount: true,
      client: { select: { name: true } },
      items: { select: { kind: true, quantity: true, percent: true, unitPrice: true, amount: true } },
      payments: { select: { amount: true } },
    },
  });
  return rows.map((m) => {
    const totals = measurementTotals(
      m.items.map((i) => ({
        kind: i.kind as MeasurementItemKind,
        quantity: toNumber(i.quantity) ?? 0,
        percent: toNumber(i.percent) ?? 0,
        unitPrice: toNumber(i.unitPrice) ?? 0,
        amount: toNumber(i.amount) ?? 0,
      })),
    );
    const approvedAmount = toNumber(m.approvedAmount);
    return {
      id: m.id,
      code: measurementCode(m.number, m.revision),
      number: m.number,
      revision: m.revision,
      clientName: m.client.name,
      periodLabel: m.periodLabel,
      issuedAt: m.issuedAt,
      createdAt: m.createdAt,
      status: m.status as MeasurementStatus,
      totals,
      approvedAmount,
      payment: paymentSummary({
        status: m.status as MeasurementStatus,
        total: totals.total,
        approvedAmount,
        payments: m.payments.map((p) => toNumber(p.amount) ?? 0),
      }),
      itemCount: m.items.length,
    };
  });
}

export interface MeasurementDetail {
  id: string;
  code: string;
  number: string;
  revision: number;
  status: MeasurementStatus;
  client: { id: string; name: string };
  issuer: { name: string; taxId: string | null };
  periodLabel: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  issuedAt: Date;
  createdAt: Date;
  sentAt: Date | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
  approvedAmount: number | null;
  notes: string | null;
  previous: { id: string; code: string } | null;
  next: { id: string; code: string } | null;
  items: {
    id: string;
    kind: MeasurementItemKind;
    revisionId: string | null;
    documentId: string | null;
    projectId: string | null;
    projectName: string | null;
    osNumber: string | null;
    serviceNumber: string | null;
    seOsg: string | null;
    documentNumber: string | null;
    description: string;
    revisionName: string | null;
    executionDate: Date | null;
    sheetFormat: SheetFormat | null;
    sheetCount: number;
    quantity: number;
    unit: string | null;
    percent: number;
    unitPrice: number;
    amount: number;
  }[];
  payments: { id: string; paidAt: Date; amount: number; note: string | null }[];
  totals: MeasurementTotals;
  payment: PaymentSummary;
  /** Acumulado do cliente antes deste BM. */
  previousTotal: number;
}

export async function loadMeasurement(organizationId: string, id: string): Promise<MeasurementDetail | null> {
  const m = await prisma.measurement.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      number: true,
      revision: true,
      status: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      issuedAt: true,
      createdAt: true,
      sentAt: true,
      approvedAt: true,
      cancelledAt: true,
      approvedAmount: true,
      notes: true,
      clientId: true,
      client: { select: { id: true, name: true } },
      organization: { select: { name: true, legalName: true, taxId: true } },
      previous: { select: { id: true, number: true, revision: true } },
      next: { select: { id: true, number: true, revision: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          kind: true,
          revisionId: true,
          revision: { select: { documentId: true } },
          projectId: true,
          project: { select: { name: true, osNumber: true } },
          serviceNumber: true,
          seOsg: true,
          documentNumber: true,
          description: true,
          revisionName: true,
          executionDate: true,
          sheetFormat: true,
          sheetCount: true,
          quantity: true,
          unit: true,
          percent: true,
          unitPrice: true,
          amount: true,
        },
      },
      payments: { orderBy: { paidAt: "asc" }, select: { id: true, paidAt: true, amount: true, note: true } },
    },
  });
  if (!m) return null;

  const items = m.items.map((i) => ({
    id: i.id,
    kind: i.kind as MeasurementItemKind,
    revisionId: i.revisionId,
    documentId: i.revision?.documentId ?? null,
    projectId: i.projectId,
    projectName: i.project?.name ?? null,
    osNumber: i.project?.osNumber ?? null,
    serviceNumber: i.serviceNumber,
    seOsg: i.seOsg,
    documentNumber: i.documentNumber,
    description: i.description,
    revisionName: i.revisionName,
    executionDate: i.executionDate,
    sheetFormat: i.sheetFormat as SheetFormat | null,
    sheetCount: i.sheetCount,
    quantity: toNumber(i.quantity) ?? 0,
    unit: i.unit,
    percent: toNumber(i.percent) ?? 0,
    unitPrice: toNumber(i.unitPrice) ?? 0,
    amount: toNumber(i.amount) ?? 0,
  }));
  const totals = measurementTotals(items);
  const approvedAmount = toNumber(m.approvedAmount);
  const payments = m.payments.map((p) => ({ id: p.id, paidAt: p.paidAt, amount: toNumber(p.amount) ?? 0, note: p.note }));

  // Acumulado anterior do mesmo cliente.
  const siblings = await loadMeasurementList(organizationId, { clientId: m.clientId });
  const previousTotal = previousMeasuredTotal(
    { id: m.id, issuedAt: m.issuedAt, createdAt: m.createdAt },
    siblings.map((s) => ({
      id: s.id,
      status: s.status,
      issuedAt: s.issuedAt,
      createdAt: s.createdAt,
      total: s.totals.total,
      approvedAmount: s.approvedAmount,
    })),
  );

  return {
    id: m.id,
    code: measurementCode(m.number, m.revision),
    number: m.number,
    revision: m.revision,
    status: m.status as MeasurementStatus,
    client: m.client,
    issuer: { name: m.organization.legalName || m.organization.name, taxId: m.organization.taxId },
    periodLabel: m.periodLabel,
    periodStart: m.periodStart,
    periodEnd: m.periodEnd,
    issuedAt: m.issuedAt,
    createdAt: m.createdAt,
    sentAt: m.sentAt,
    approvedAt: m.approvedAt,
    cancelledAt: m.cancelledAt,
    approvedAmount,
    notes: m.notes,
    previous: m.previous ? { id: m.previous.id, code: measurementCode(m.previous.number, m.previous.revision) } : null,
    next: m.next ? { id: m.next.id, code: measurementCode(m.next.number, m.next.revision) } : null,
    items,
    payments,
    totals,
    payment: paymentSummary({
      status: m.status as MeasurementStatus,
      total: totals.total,
      approvedAmount,
      payments: payments.map((p) => p.amount),
    }),
    previousTotal,
  };
}

/** Clientes da organização que têm projeto — os únicos que podem ser medidos. */
export async function loadMeasurableClients(organizationId: string) {
  return prisma.client.findMany({
    where: { organizationId, projects: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
}

/** Linha da tela de montagem do BM (datas serializadas para o componente cliente). */
export function toFormRow(r: MeasurableRevision, statusLabel: (s: string) => string) {
  return {
    revisionId: r.revisionId,
    projectId: r.projectId,
    projectName: r.projectName,
    osNumber: r.osNumber,
    documentNumber: r.documentNumber,
    documentName: r.documentName,
    revisionName: r.revisionName,
    revisionStatusLabel: statusLabel(r.revisionStatus),
    issuedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
    sheetFormat: r.sheetFormat,
    sheetCount: r.sheetCount,
    a1Eq: r.a1Eq,
    a1Price: r.a1Price,
    billable: r.billable,
    remainingPercent: r.remainingPercent,
    measuredPercent: r.measuredPercent,
  };
}

export { isActiveMeasurement };
