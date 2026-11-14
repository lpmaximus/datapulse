/**
 * Medição (Boletim de Medição — BM). Regras puras, sem Prisma, testáveis.
 *
 * Unidade medida: a REVISÃO de um documento, em A1 equivalente
 * (formato × folhas). Valor = A1 eq × % medido × valor do A1 do projeto.
 *
 * Três estados que a projetista acompanha:
 *  - Feito:  revisão emitida (não cancelada) e medível;
 *  - Medido: a revisão está num BM ativo (rascunho, enviado ou aprovado);
 *  - Pago:   o BM em que ela está recebeu pagamento.
 *
 * Revisão medível: a PRIMEIRA revisão do documento sempre; as seguintes só
 * quando marcadas como cobráveis (mudança de escopo acordada com o
 * contratante). Medição parcial: um documento pode ser medido em várias
 * linhas/BMs desde que a soma dos percentuais não passe de 100%.
 */

export type MeasurementStatus = "DRAFT" | "SENT" | "APPROVED" | "SUPERSEDED" | "CANCELLED";
export type MeasurementItemKind = "FORMAT" | "OTHER";

export const MEASUREMENT_STATUS_LABEL: Record<MeasurementStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  APPROVED: "Aprovado",
  SUPERSEDED: "Substituído",
  CANCELLED: "Cancelado",
};

/** BM nestes estados "ocupa" o percentual medido do documento. */
export const ACTIVE_MEASUREMENT_STATUSES: MeasurementStatus[] = ["DRAFT", "SENT", "APPROVED"];

export function isActiveMeasurement(status: MeasurementStatus): boolean {
  return ACTIVE_MEASUREMENT_STATUSES.includes(status);
}

/** Itens só se editam em rascunho; enviado/aprovado muda por nova revisão do BM. */
export function isMeasurementEditable(status: MeasurementStatus): boolean {
  return status === "DRAFT";
}

/* ----------------------------- numeração ----------------------------- */

/** 0 → "R00", 1 → "R01". */
export function revisionLabel(revision: number): string {
  return `R${String(Math.max(0, revision)).padStart(2, "0")}`;
}

/** "BM-IDG-OUT-NOV-2026" + 0 → "BM-IDG-OUT-NOV-2026-R00". */
export function measurementCode(number: string, revision: number): string {
  return `${number}-${revisionLabel(revision)}`;
}

/** Sugestão de número: BM-<código do cliente>-<AAAA>-<seq 3 dígitos>. */
export function suggestMeasurementNumber(clientCode: string | null | undefined, year: number, seq: number): string {
  const code = (clientCode ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return ["BM", code || null, String(year), String(seq).padStart(3, "0")].filter(Boolean).join("-");
}

/* ------------------------------ números ------------------------------ */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Número vindo de formulário em pt-BR: "1.234,56", "1234,56", "900", "R$ 900,00".
 * Ponto sem vírgula: milhar se tiver exatamente 3 dígitos depois ("1.500"),
 * senão decimal ("0.25"). Devolve null quando vazio ou inválido.
 */
export function parseDecimalBR(value: unknown): number | null {
  let raw = String(value ?? "").trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!raw) return null;
  if (raw.includes(",")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Percentual medido: 0 < p ≤ 100, até 2 casas. */
export function parsePercent(value: unknown): { value: number } | { error: string } {
  const n = parseDecimalBR(String(value ?? "").replace("%", ""));
  if (n == null) return { error: "Informe o percentual medido." };
  if (n <= 0 || n > 100) return { error: "O percentual deve ficar entre 0 e 100%." };
  return { value: round2(n) };
}

/** Valor do item: quantidade × percentual × preço unitário, em centavos. */
export function itemAmount(quantity: number, percent: number, unitPrice: number): number {
  return round2(quantity * (percent / 100) * unitPrice);
}

/* -------------------------- revisão medível -------------------------- */

export interface RevisionForBilling {
  id: string;
  sequence: number;
  status: string;
  billable: boolean;
}

/**
 * Revisões medíveis de um documento: a primeira (menor `sequence`) e as
 * marcadas como cobráveis. Revisão cancelada nunca é medível.
 */
export function billableRevisionIds(revisions: RevisionForBilling[]): Set<string> {
  const out = new Set<string>();
  const live = revisions.filter((r) => r.status !== "CANCELLED");
  if (!revisions.length) return out;
  const first = [...revisions].sort((a, b) => a.sequence - b.sequence)[0];
  for (const r of live) {
    if (r.id === first.id || r.billable) out.add(r.id);
  }
  return out;
}

/** Por que a revisão não é medível (texto para a tela), ou null se é. */
export function nonBillableReason(rev: RevisionForBilling, isFirst: boolean): string | null {
  if (rev.status === "CANCELLED") return "Revisão cancelada";
  if (isFirst || rev.billable) return null;
  return "Revisão sem mudança de escopo acordada";
}

/* ------------------------- percentual medido ------------------------- */

export interface MeasuredLine {
  revisionId: string | null;
  percent: number;
  measurementStatus: MeasurementStatus;
  /** Linha do próprio BM que está sendo editado — não conta contra ele mesmo. */
  measurementId?: string;
}

/** Soma do % já medido por revisão, só em BMs ativos. */
export function measuredPercentByRevision(
  lines: MeasuredLine[],
  excludeMeasurementId?: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (!l.revisionId) continue;
    if (!isActiveMeasurement(l.measurementStatus)) continue;
    if (excludeMeasurementId && l.measurementId === excludeMeasurementId) continue;
    out.set(l.revisionId, round2((out.get(l.revisionId) ?? 0) + l.percent));
  }
  return out;
}

export function remainingPercent(measured: number | undefined): number {
  return round2(Math.max(0, 100 - (measured ?? 0)));
}

/* ------------------------------ totais ------------------------------ */

export interface ItemForTotals {
  kind: MeasurementItemKind;
  quantity: number;
  percent: number;
  unitPrice: number;
  amount: number;
}

export interface MeasurementTotals {
  /** A1 equivalente efetivamente medido (A1 eq × %). */
  a1Measured: number;
  formats: number;
  others: number;
  total: number;
  /** Valor do A1 quando todas as linhas de formato usam o mesmo; senão null. */
  uniformA1Price: number | null;
}

export function measurementTotals(items: ItemForTotals[]): MeasurementTotals {
  let a1 = 0;
  let formats = 0;
  let others = 0;
  const prices = new Set<number>();
  for (const it of items) {
    if (it.kind === "FORMAT") {
      a1 += it.quantity * (it.percent / 100);
      formats += it.amount;
      prices.add(it.unitPrice);
    } else {
      others += it.amount;
    }
  }
  return {
    a1Measured: Math.round(a1 * 10000) / 10000,
    formats: round2(formats),
    others: round2(others),
    total: round2(formats + others),
    uniformA1Price: prices.size === 1 ? [...prices][0] : null,
  };
}

/* ---------------------------- pagamento ---------------------------- */

export type PaymentState = "NOT_DUE" | "OPEN" | "PARTIAL" | "PAID";

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  NOT_DUE: "Aguardando aprovação",
  OPEN: "A receber",
  PARTIAL: "Pago parcial",
  PAID: "Pago",
};

export interface PaymentSummary {
  /** Valor que o contratante deve: aprovado (com glosa) ou, antes da aprovação, o total. */
  expected: number;
  /** Total − aprovado, quando o aprovado é menor. */
  glosa: number;
  paid: number;
  balance: number;
  state: PaymentState;
}

export function paymentSummary(input: {
  status: MeasurementStatus;
  total: number;
  approvedAmount: number | null;
  payments: number[];
}): PaymentSummary {
  const paid = round2(input.payments.reduce((a, b) => a + b, 0));
  const approved = input.status === "APPROVED";
  const expected = approved ? round2(input.approvedAmount ?? input.total) : round2(input.total);
  const glosa = approved ? round2(Math.max(0, input.total - expected)) : 0;
  const balance = round2(Math.max(0, expected - paid));
  let state: PaymentState;
  if (!approved) state = paid > 0 ? "PARTIAL" : "NOT_DUE";
  else if (paid <= 0) state = "OPEN";
  else if (balance <= 0.005) state = "PAID";
  else state = "PARTIAL";
  return { expected, glosa, paid, balance, state };
}

/* ----------------------- painel feito/medido/pago ----------------------- */

export interface PortfolioMeasurement {
  status: MeasurementStatus;
  total: number;
  approvedAmount: number | null;
  payments: number[];
}

export interface PortfolioSummary {
  /** Feito e ainda não medido (saldo de % × valor do A1). */
  toMeasure: number;
  /** Em BM rascunho ou enviado (aguardando aprovação). */
  measuredPending: number;
  /** Aprovado (valor aprovado, já descontada glosa). */
  approved: number;
  received: number;
  /** Aprovado − recebido. */
  receivable: number;
}

export function portfolioSummary(
  toMeasure: number,
  measurements: PortfolioMeasurement[],
): PortfolioSummary {
  let measuredPending = 0;
  let approved = 0;
  let received = 0;
  let receivable = 0;
  for (const m of measurements) {
    if (!isActiveMeasurement(m.status)) continue;
    const p = paymentSummary(m);
    received += p.paid;
    if (m.status === "APPROVED") {
      approved += p.expected;
      receivable += p.balance;
    } else {
      measuredPending += m.total;
    }
  }
  return {
    toMeasure: round2(toMeasure),
    measuredPending: round2(measuredPending),
    approved: round2(approved),
    received: round2(received),
    receivable: round2(receivable),
  };
}

/**
 * Medido anterior (acumulado do contrato até este BM): soma dos BMs ativos do
 * mesmo cliente emitidos antes deste — aprovados pelo valor aprovado, os
 * demais pelo total. Revisões substituídas e cancelados ficam de fora.
 */
export function previousMeasuredTotal(
  current: { id: string; issuedAt: Date; createdAt: Date },
  others: { id: string; status: MeasurementStatus; issuedAt: Date; createdAt: Date; total: number; approvedAmount: number | null }[],
): number {
  let sum = 0;
  for (const m of others) {
    if (m.id === current.id || !isActiveMeasurement(m.status)) continue;
    const before =
      m.issuedAt.getTime() < current.issuedAt.getTime() ||
      (m.issuedAt.getTime() === current.issuedAt.getTime() && m.createdAt.getTime() < current.createdAt.getTime());
    if (!before) continue;
    sum += m.status === "APPROVED" ? (m.approvedAmount ?? m.total) : m.total;
  }
  return round2(sum);
}

/** "1.234,56" — moeda pt-BR com centavos (o BM não arredonda para inteiro). */
export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

/** "100%" · "70,5%". */
export function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
