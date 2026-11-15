"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { a1Equivalent, type SheetFormat } from "@/lib/documents";
import { toNumber } from "@/lib/format";
import {
  isActiveMeasurement,
  isMeasurementEditable,
  itemAmount,
  measurementTotals,
  parseDecimalBR,
  parsePercent,
  paymentSummary,
  round2,
  type MeasurementItemKind,
  type MeasurementStatus,
} from "@/lib/measurements";
import { loadMeasurableRevisions } from "@/lib/server/measurement-service";

/**
 * Medição (BM). Só ADMIN e MANAGER: é dado financeiro do contrato.
 * Todo id vindo do formulário é conferido contra a organização da sessão.
 */

const ROLES = ["ADMIN", "MANAGER"] as const;

export interface MeasurementFormState {
  ok?: boolean;
  error?: string;
  at?: number;
  measurementId?: string;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optDate(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function fail(error: string): MeasurementFormState {
  return { error, at: Date.now() };
}

function revalidateAll(id?: string) {
  revalidatePath("/measurements");
  revalidatePath("/measurements/documents");
  if (id) revalidatePath(`/measurements/${id}`);
}

type ItemDraft = {
  kind: MeasurementItemKind;
  revisionId: string | null;
  projectId: string | null;
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
  sortOrder: number;
};

/**
 * Lê e valida as linhas do formulário. Formato: cada revisão marcada traz
 * `pct_<id>` e `price_<id>`; a revisão precisa ser do cliente, medível e ter
 * saldo de percentual. Outros: arrays paralelos `other*`.
 */
async function readItems(
  fd: FormData,
  organizationId: string,
  clientId: string,
  measurementId?: string,
): Promise<{ items: ItemDraft[] } | { error: string }> {
  const selected = [...new Set(fd.getAll("revisionId").map(String).filter(Boolean))];
  const pool = await loadMeasurableRevisions(organizationId, { clientId, excludeMeasurementId: measurementId });
  const byId = new Map(pool.map((r) => [r.revisionId, r]));
  // Ordem do BM: projeto, depois número do documento (a mesma da tela).
  const ordered = pool.filter((r) => selected.includes(r.revisionId));
  if (ordered.length !== selected.length) {
    return { error: "Há documento selecionado que não pertence a este cliente." };
  }

  const items: ItemDraft[] = [];
  for (const r of ordered) {
    const label = `${r.documentNumber ?? r.documentName} ${r.revisionName}`;
    if (!byId.get(r.revisionId)?.billable) {
      return { error: `${label}: revisão sem mudança de escopo acordada não é medível.` };
    }
    if (r.a1Eq == null) return { error: `${label}: informe o formato e as folhas do documento antes de medir.` };
    const pct = parsePercent(fd.get(`pct_${r.revisionId}`));
    if ("error" in pct) return { error: `${label}: ${pct.error}` };
    if (pct.value > r.remainingPercent + 0.001) {
      return { error: `${label}: só restam ${r.remainingPercent}% a medir.` };
    }
    const price = parseDecimalBR(fd.get(`price_${r.revisionId}`)) ?? r.a1Price;
    if (price == null || price <= 0) {
      return { error: `${label}: defina o valor do A1 no projeto ${r.projectName} (ou na linha).` };
    }
    items.push({
      kind: "FORMAT",
      revisionId: r.revisionId,
      projectId: r.projectId,
      serviceNumber: r.serviceNumber,
      seOsg: r.seOsg,
      documentNumber: r.documentNumber,
      description: r.documentName,
      revisionName: r.revisionName,
      // Data digitada na linha vence a do sistema: o documento pode ter sido
      // cadastrado depois do envio ao contratante.
      executionDate: optDate(fd, `date_${r.revisionId}`) ?? r.issuedAt,
      sheetFormat: r.sheetFormat,
      sheetCount: r.sheetCount,
      quantity: a1Equivalent(r.sheetFormat, r.sheetCount) ?? 0,
      unit: "A1",
      percent: pct.value,
      unitPrice: round2(price),
      amount: itemAmount(r.a1Eq, pct.value, price),
      sortOrder: items.length,
    });
  }

  const descs = fd.getAll("otherDescription").map(String);
  const qtys = fd.getAll("otherQty").map(String);
  const units = fd.getAll("otherUnit").map(String);
  const prices = fd.getAll("otherPrice").map(String);
  for (let i = 0; i < descs.length; i++) {
    const description = descs[i].trim();
    if (!description) continue;
    const qty = parseDecimalBR(qtys[i]);
    const price = parseDecimalBR(prices[i]);
    if (qty == null || qty <= 0) return { error: `Outros — "${description}": quantidade inválida.` };
    if (price == null || price < 0) return { error: `Outros — "${description}": valor unitário inválido.` };
    items.push({
      kind: "OTHER",
      revisionId: null,
      projectId: null,
      serviceNumber: null,
      seOsg: null,
      documentNumber: null,
      description,
      revisionName: null,
      executionDate: null,
      sheetFormat: null,
      sheetCount: 1,
      quantity: qty,
      unit: units[i]?.trim() || null,
      percent: 100,
      unitPrice: round2(price),
      amount: itemAmount(qty, 100, price),
      sortOrder: items.length,
    });
  }

  if (!items.length) return { error: "Selecione ao menos um documento ou lance um item em Outros." };
  return { items };
}

/** Cria o BM (R00) ou, com `measurementId`, regrava um rascunho existente. */
export async function saveMeasurement(
  _prev: MeasurementFormState,
  fd: FormData,
): Promise<MeasurementFormState> {
  const me = await requireRole([...ROLES]);
  const orgId = me.organizationId;
  const measurementId = str(fd, "measurementId") || undefined;

  const clientId = str(fd, "clientId");
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { id: true } });
  if (!client) return fail("Cliente inválido.");

  const number = str(fd, "number").toUpperCase();
  const periodLabel = str(fd, "periodLabel");
  const issuedAt = optDate(fd, "issuedAt");
  if (!number) return fail("Informe o número do BM.");
  if (!periodLabel) return fail("Informe o período da medição.");
  if (!issuedAt) return fail("Informe a data de emissão.");
  const periodStart = optDate(fd, "periodStart");
  const periodEnd = optDate(fd, "periodEnd");
  if (periodStart && periodEnd && periodEnd < periodStart) return fail("O fim do período é anterior ao início.");

  let existing: { id: string; status: MeasurementStatus; revision: number; clientId: string } | null = null;
  if (measurementId) {
    const row = await prisma.measurement.findFirst({
      where: { id: measurementId, organizationId: orgId },
      select: { id: true, status: true, revision: true, clientId: true },
    });
    if (!row) return fail("BM não encontrado.");
    existing = { ...row, status: row.status as MeasurementStatus };
    if (!isMeasurementEditable(existing.status)) return fail("Só um BM em rascunho pode ser editado.");
    if (existing.clientId !== clientId) return fail("O cliente de um BM não muda.");
  }

  const dup = await prisma.measurement.findFirst({
    where: {
      organizationId: orgId,
      number,
      revision: existing?.revision ?? 0,
      ...(existing ? { id: { not: existing.id } } : {}),
    },
    select: { id: true },
  });
  if (dup) return fail(`Já existe um BM ${number} nesta revisão.`);

  const read = await readItems(fd, orgId, clientId, existing?.id);
  if ("error" in read) return fail(read.error);

  const issuerName = str(fd, "issuerName");
  const header = {
    number,
    issuerName: issuerName || null,
    // CPF/CNPJ só acompanha um emissor próprio.
    issuerTaxId: issuerName ? str(fd, "issuerTaxId") || null : null,
    periodLabel,
    periodStart,
    periodEnd,
    issuedAt,
    notes: str(fd, "notes") || null,
  };

  let id: string;
  if (existing) {
    id = existing.id;
    await prisma.$transaction([
      prisma.measurementItem.deleteMany({ where: { measurementId: id } }),
      prisma.measurement.update({
        where: { id },
        data: { ...header, items: { create: read.items } },
      }),
    ]);
  } else {
    const created = await prisma.measurement.create({
      data: {
        ...header,
        organizationId: orgId,
        clientId,
        createdById: me.id,
        items: { create: read.items },
      },
      select: { id: true },
    });
    id = created.id;
  }

  revalidateAll(id);
  return { ok: true, at: Date.now(), measurementId: id };
}

async function loadOwned(orgId: string, id: string) {
  return prisma.measurement.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      status: true,
      number: true,
      revision: true,
      approvedAmount: true,
      items: { select: { kind: true, quantity: true, percent: true, unitPrice: true, amount: true } },
      payments: { select: { amount: true } },
    },
  });
}

function totalOf(m: NonNullable<Awaited<ReturnType<typeof loadOwned>>>): number {
  return measurementTotals(
    m.items.map((i) => ({
      kind: i.kind as MeasurementItemKind,
      quantity: toNumber(i.quantity) ?? 0,
      percent: toNumber(i.percent) ?? 0,
      unitPrice: toNumber(i.unitPrice) ?? 0,
      amount: toNumber(i.amount) ?? 0,
    })),
  ).total;
}

function back(id: string, error?: string): never {
  redirect(`/measurements/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

/** Rascunho → Enviado ao contratante. */
export async function sendMeasurement(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const id = str(fd, "measurementId");
  const m = await loadOwned(me.organizationId, id);
  if (!m) back(id, "BM não encontrado.");
  if (m.status !== "DRAFT") back(id, "Só um rascunho pode ser enviado.");
  if (!m.items.length) back(id, "O BM não tem itens.");
  await prisma.measurement.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  revalidateAll(id);
  back(id);
}

/** Enviado → Rascunho (corrigir antes de o contratante responder). */
export async function reopenMeasurement(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const id = str(fd, "measurementId");
  const m = await loadOwned(me.organizationId, id);
  if (!m) back(id, "BM não encontrado.");
  if (m.status !== "SENT") back(id, "Só um BM enviado volta para rascunho.");
  await prisma.measurement.update({ where: { id }, data: { status: "DRAFT", sentAt: null } });
  revalidateAll(id);
  back(id);
}

/** Enviado → Aprovado, com o valor aprovado (menor que o total = glosa). */
export async function approveMeasurement(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const id = str(fd, "measurementId");
  const m = await loadOwned(me.organizationId, id);
  if (!m) back(id, "BM não encontrado.");
  if (m.status !== "SENT") back(id, "Só um BM enviado pode ser aprovado.");
  const total = totalOf(m);
  const approved = parseDecimalBR(fd.get("approvedAmount")) ?? total;
  if (approved < 0 || approved > total + 0.005) back(id, "O valor aprovado deve ficar entre zero e o total do BM.");
  await prisma.measurement.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedAt: optDate(fd, "approvedAt") ?? new Date(),
      approvedAmount: round2(approved),
    },
  });
  revalidateAll(id);
  back(id);
}

/**
 * Cancela o BM e libera os documentos para nova medição. Aprovado com
 * pagamento registrado não cancela: exclua os pagamentos antes.
 */
export async function cancelMeasurement(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const id = str(fd, "measurementId");
  const m = await loadOwned(me.organizationId, id);
  if (!m) back(id, "BM não encontrado.");
  if (!isActiveMeasurement(m.status as MeasurementStatus)) back(id, "Este BM já não está ativo.");
  if (m.payments.length) back(id, "BM com pagamento registrado não pode ser cancelado.");
  await prisma.measurement.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  revalidateAll(id);
  back(id);
}

/**
 * Nova revisão do BM (R00 → R01): o contratante devolveu e pediu ajuste.
 * Copia cabeçalho e itens para um rascunho novo e marca o atual como
 * Substituído — que deixa de contar como medido, liberando o percentual
 * para a revisão nova.
 */
export async function reviseMeasurement(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const id = str(fd, "measurementId");
  const m = await prisma.measurement.findFirst({
    where: { id, organizationId: me.organizationId },
    include: { items: true, payments: { select: { id: true } }, next: { select: { id: true } } },
  });
  if (!m) back(id, "BM não encontrado.");
  if (m.status !== "SENT" && m.status !== "APPROVED") back(id, "Só um BM enviado ou aprovado pode ser revisado.");
  if (m.payments.length) back(id, "BM com pagamento registrado não pode ser revisado.");
  if (m.next) back(id, "Este BM já tem uma revisão posterior.");

  const created = await prisma.$transaction(async (tx) => {
    await tx.measurement.update({ where: { id }, data: { status: "SUPERSEDED" } });
    return tx.measurement.create({
      data: {
        organizationId: m.organizationId,
        clientId: m.clientId,
        number: m.number,
        revision: m.revision + 1,
        previousId: m.id,
        periodLabel: m.periodLabel,
        periodStart: m.periodStart,
        periodEnd: m.periodEnd,
        issuedAt: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"),
        notes: m.notes,
        createdById: me.id,
        items: {
          create: m.items.map((i) => ({
            kind: i.kind,
            revisionId: i.revisionId,
            projectId: i.projectId,
            serviceNumber: i.serviceNumber,
            seOsg: i.seOsg,
            documentNumber: i.documentNumber,
            description: i.description,
            revisionName: i.revisionName,
            executionDate: i.executionDate,
            sheetFormat: i.sheetFormat,
            sheetCount: i.sheetCount,
            quantity: i.quantity,
            unit: i.unit,
            percent: i.percent,
            unitPrice: i.unitPrice,
            amount: i.amount,
            sortOrder: i.sortOrder,
          })),
        },
      },
      select: { id: true },
    });
  });
  revalidateAll(id);
  revalidateAll(created.id);
  redirect(`/measurements/${created.id}`);
}

/** Exclui um rascunho R00. Revisões (R01+) se cancelam, para manter a trilha. */
export async function deleteMeasurement(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const id = str(fd, "measurementId");
  const m = await loadOwned(me.organizationId, id);
  if (!m) back(id, "BM não encontrado.");
  if (m.status !== "DRAFT" || m.revision > 0) back(id, "Só um rascunho R00 pode ser excluído; use Cancelar.");
  await prisma.measurement.delete({ where: { id } });
  revalidateAll();
  redirect("/measurements");
}

/** Pagamento recebido de um BM aprovado. */
export async function addMeasurementPayment(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const id = str(fd, "measurementId");
  const m = await loadOwned(me.organizationId, id);
  if (!m) back(id, "BM não encontrado.");
  if (m.status !== "APPROVED") back(id, "Registre o pagamento depois de aprovar o BM.");
  const amount = parseDecimalBR(fd.get("amount"));
  const paidAt = optDate(fd, "paidAt");
  if (amount == null || amount <= 0) back(id, "Informe o valor recebido.");
  if (!paidAt) back(id, "Informe a data do recebimento.");
  const pay = paymentSummary({
    status: "APPROVED",
    total: totalOf(m),
    approvedAmount: toNumber(m.approvedAmount),
    payments: m.payments.map((p) => toNumber(p.amount) ?? 0),
  });
  if (amount > pay.balance + 0.005) back(id, "O valor passa do saldo a receber deste BM.");
  await prisma.measurementPayment.create({
    data: { measurementId: id, amount: round2(amount), paidAt, note: str(fd, "note") || null, createdById: me.id },
  });
  revalidateAll(id);
  back(id);
}

export async function deleteMeasurementPayment(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const id = str(fd, "measurementId");
  const paymentId = str(fd, "paymentId");
  const m = await loadOwned(me.organizationId, id);
  if (!m) back(id, "BM não encontrado.");
  await prisma.measurementPayment.deleteMany({ where: { id: paymentId, measurementId: id } });
  revalidateAll(id);
  back(id);
}

/** Razão social e CPF/CNPJ do emissor (cabeçalho do BM). Só ADMIN. */
export async function updateIssuer(fd: FormData): Promise<void> {
  const me = await requireRole(["ADMIN"]);
  await prisma.organization.update({
    where: { id: me.organizationId },
    data: { legalName: str(fd, "legalName") || null, taxId: str(fd, "taxId") || null },
  });
  revalidatePath("/measurements");
  redirect("/measurements");
}

/**
 * Marca (ou desmarca) uma revisão como cobrável por mudança de escopo
 * acordada com o contratante. A primeira revisão do documento é sempre
 * medível e não passa por aqui. Desmarcar uma revisão já medida num BM ativo
 * é bloqueado.
 */
export async function setRevisionBillable(fd: FormData): Promise<void> {
  const me = await requireRole([...ROLES]);
  const revisionId = str(fd, "revisionId");
  const rawReturn = str(fd, "returnTo");
  // Só caminho interno: nada de "//outro-site" ou URL absoluta.
  const returnTo = rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/measurements/documents";
  const billable = str(fd, "billable") === "1";
  const rev = await prisma.documentRevision.findFirst({
    where: { id: revisionId, document: { project: { organizationId: me.organizationId } } },
    select: {
      id: true,
      measurementItems: { select: { measurement: { select: { status: true } } } },
    },
  });
  if (!rev) redirect(returnTo);
  if (!billable && rev.measurementItems.some((i) => isActiveMeasurement(i.measurement.status as MeasurementStatus))) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("Revisão já medida num BM ativo.")}`);
  }
  await prisma.documentRevision.update({
    where: { id: revisionId },
    data: { billable, billableNote: billable ? str(fd, "billableNote") || null : null },
  });
  revalidateAll();
  redirect(returnTo);
}
