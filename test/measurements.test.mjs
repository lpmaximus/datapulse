import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assigneeSummary,
  billableRevisionIds,
  formatSheetsByFormat,
  lineShare,
  mergeLinesForClient,
  parseSheets,
  suggestLine,
  itemAmount,
  measuredPercentByRevision,
  measurementCode,
  measurementTotals,
  parseDecimalBR,
  parsePercent,
  paymentSummary,
  portfolioSummary,
  previousMeasuredTotal,
  remainingPercent,
  suggestMeasurementNumber,
} from "../lib/measurements.ts";

test("valor do item reproduz o BM-IDG-OUT-NOV 2026-R00", () => {
  // 31 folhas A4 = 3,875 A1 eq × R$ 900 = R$ 3.487,50
  assert.equal(itemAmount(31 * 0.125, 100, 900), 3487.5);
  // 5 folhas A3 = 1,25 A1 eq × R$ 900 = R$ 1.125,00
  assert.equal(itemAmount(5 * 0.25, 100, 900), 1125);
  // medição parcial: 70% de 1 A1 a R$ 750
  assert.equal(itemAmount(1, 70, 750), 525);
});

test("totais separam formatos e outros e detectam valor do A1 único", () => {
  const items = [
    { kind: "FORMAT", quantity: 3.875, percent: 100, unitPrice: 900, amount: 3487.5 },
    { kind: "FORMAT", quantity: 1.25, percent: 100, unitPrice: 900, amount: 1125 },
    { kind: "OTHER", quantity: 10, percent: 100, unitPrice: 120, amount: 1200 },
  ];
  const t = measurementTotals(items);
  assert.equal(t.a1Measured, 5.125);
  assert.equal(t.formats, 4612.5);
  assert.equal(t.others, 1200);
  assert.equal(t.total, 5812.5);
  assert.equal(t.uniformA1Price, 900);
  items.push({ kind: "FORMAT", quantity: 1, percent: 50, unitPrice: 750, amount: 375 });
  const t2 = measurementTotals(items);
  assert.equal(t2.uniformA1Price, null);
  assert.equal(t2.a1Measured, 5.625);
});

test("só a primeira revisão e as cobráveis são medíveis", () => {
  const ids = billableRevisionIds([
    { id: "r0", sequence: 0, status: "COMMENTED", billable: false },
    { id: "r1", sequence: 1, status: "COMMENTED", billable: false },
    { id: "r2", sequence: 2, status: "APPROVED", billable: true },
    { id: "r3", sequence: 3, status: "CANCELLED", billable: true },
  ]);
  assert.deepEqual([...ids].sort(), ["r0", "r2"]);
});

test("percentual medido ignora BM cancelado/substituído e o próprio BM", () => {
  const m = measuredPercentByRevision(
    [
      { revisionId: "a", percent: 70, measurementStatus: "APPROVED", measurementId: "bm1" },
      { revisionId: "a", percent: 30, measurementStatus: "CANCELLED", measurementId: "bm2" },
      { revisionId: "a", percent: 30, measurementStatus: "SUPERSEDED", measurementId: "bm3" },
      { revisionId: "a", percent: 20, measurementStatus: "DRAFT", measurementId: "bm4" },
      { revisionId: null, percent: 100, measurementStatus: "DRAFT", measurementId: "bm4" },
    ],
    "bm4",
  );
  assert.equal(m.get("a"), 70);
  assert.equal(remainingPercent(m.get("a")), 30);
  assert.equal(remainingPercent(undefined), 100);
});

test("pagamento com glosa e parcial", () => {
  const p = paymentSummary({ status: "APPROVED", total: 18225, approvedAmount: 18000, payments: [10000] });
  assert.deepEqual(p, { expected: 18000, glosa: 225, paid: 10000, balance: 8000, state: "PARTIAL" });
  const q = paymentSummary({ status: "APPROVED", total: 18225, approvedAmount: null, payments: [18225] });
  assert.equal(q.state, "PAID");
  assert.equal(paymentSummary({ status: "SENT", total: 100, approvedAmount: null, payments: [] }).state, "NOT_DUE");
});

test("painel feito/medido/aprovado/recebido", () => {
  const s = portfolioSummary(1500, [
    { status: "SENT", total: 4218.75, approvedAmount: null, payments: [] },
    { status: "APPROVED", total: 18225, approvedAmount: 18225, payments: [18225] },
    { status: "APPROVED", total: 1000, approvedAmount: 900, payments: [] },
    { status: "CANCELLED", total: 999, approvedAmount: null, payments: [] },
  ]);
  assert.deepEqual(s, { toMeasure: 1500, measuredPending: 4218.75, approved: 19125, received: 18225, receivable: 900 });
});

test("medido anterior soma só BMs ativos emitidos antes", () => {
  const d = (s) => new Date(s + "T00:00:00Z");
  const cur = { id: "c", issuedAt: d("2026-11-09"), createdAt: d("2026-11-09") };
  const prev = previousMeasuredTotal(cur, [
    { id: "a", status: "APPROVED", issuedAt: d("2026-10-01"), createdAt: d("2026-10-01"), total: 1000, approvedAmount: 950 },
    { id: "b", status: "SUPERSEDED", issuedAt: d("2026-10-02"), createdAt: d("2026-10-02"), total: 500, approvedAmount: null },
    { id: "e", status: "SENT", issuedAt: d("2026-12-01"), createdAt: d("2026-12-01"), total: 700, approvedAmount: null },
    { id: "c", status: "DRAFT", issuedAt: d("2026-11-09"), createdAt: d("2026-11-09"), total: 300, approvedAmount: null },
  ]);
  assert.equal(prev, 950);
});

test("numeração e parsing pt-BR", () => {
  assert.equal(measurementCode("BM-IDG-OUT-NOV-2026", 0), "BM-IDG-OUT-NOV-2026-R00");
  assert.equal(measurementCode("BM-IDG-2026-001", 12), "BM-IDG-2026-001-R12");
  assert.equal(suggestMeasurementNumber("idg eng", 2026, 3), "BM-IDG-ENG-2026-003");
  assert.equal(suggestMeasurementNumber(null, 2026, 1), "BM-2026-001");
  assert.equal(parseDecimalBR("R$ 1.234,56"), 1234.56);
  assert.equal(parseDecimalBR("1.500"), 1500);
  assert.equal(parseDecimalBR("0.25"), 0.25);
  assert.equal(parseDecimalBR("900"), 900);
  assert.equal(parseDecimalBR(""), null);
  assert.deepEqual(parsePercent("70,5%"), { value: 70.5 });
  assert.ok("error" in parsePercent("120"));
  assert.ok("error" in parsePercent("0"));
});

test("fatia da linha considera as folhas medidas", () => {
  assert.equal(lineShare(100, 2, 4), 50);
  assert.equal(lineShare(50, 4, 4), 50);
  assert.equal(lineShare(80, 3, 4), 60);
  // item antigo, sem folhas do documento: vale o percentual
  assert.equal(lineShare(70, 4, null), 70);
});

test("doc casado: partes do mesmo documento somam até 100%", () => {
  const lines = [
    { revisionId: "a", percent: 100, sheetCount: 1, documentSheetCount: 3, measurementStatus: "DRAFT", measurementId: "bm1" },
    { revisionId: "a", percent: 100, sheetCount: 1, documentSheetCount: 3, measurementStatus: "DRAFT", measurementId: "bm1" },
    { revisionId: "a", percent: 100, sheetCount: 1, documentSheetCount: 3, measurementStatus: "APPROVED", measurementId: "bm0" },
  ];
  const m = measuredPercentByRevision(lines);
  assert.equal(remainingPercent(m.get("a")), 0);
  // editando o bm1, só o bm0 conta: sobram 2/3
  assert.equal(remainingPercent(measuredPercentByRevision(lines, "bm1").get("a")), 66.67);
});

test("folhas medidas: inteiro entre 1 e as folhas do documento", () => {
  assert.deepEqual(parseSheets("3", 4), { value: 3 });
  assert.ok("error" in parseSheets("5", 4));
  assert.ok("error" in parseSheets("0", 4));
  assert.ok("error" in parseSheets("1,5", 4));
  assert.ok("error" in parseSheets("", 4));
});

test("sugestão de linha usa folhas inteiras quando o saldo permite", () => {
  assert.deepEqual(suggestLine(4, 100), { sheets: 4, percent: 100 });
  assert.deepEqual(suggestLine(4, 50), { sheets: 2, percent: 100 });
  assert.deepEqual(suggestLine(4, 30), { sheets: 4, percent: 30 });
  assert.deepEqual(suggestLine(3, 66.67), { sheets: 2, percent: 100 });
});

test("resumo por projetista soma folhas por formato, A1 eq e valor", () => {
  const items = [
    { kind: "FORMAT", assigneeName: "Ana", sheetFormat: "A1", sheetCount: 2, quantity: 2, percent: 100, amount: 1800 },
    { kind: "FORMAT", assigneeName: " ana ", sheetFormat: "A3", sheetCount: 4, quantity: 1, percent: 100, amount: 900 },
    { kind: "FORMAT", assigneeName: "Bruno", sheetFormat: "A1", sheetCount: 2, quantity: 2, percent: 50, amount: 900 },
    { kind: "FORMAT", assigneeName: null, sheetFormat: "A4", sheetCount: 8, quantity: 1, percent: 100, amount: 900 },
    { kind: "OTHER", assigneeName: null, sheetFormat: null, sheetCount: 1, quantity: 10, percent: 100, amount: 1200 },
  ];
  const r = assigneeSummary(items);
  assert.deepEqual(r.map((x) => x.name), ["Ana", "Bruno", null]);
  assert.equal(r[0].sheets, 6);
  assert.equal(r[0].a1Measured, 3);
  assert.equal(r[0].amount, 2700);
  assert.equal(formatSheetsByFormat(r[0].sheetsByFormat), "2 A1 + 4 A3");
  assert.equal(r[1].a1Measured, 1);
});

test("BM do contratante junta as partes do mesmo documento", () => {
  const d = new Date("2026-11-10T00:00:00Z");
  const base = { kind: "FORMAT", revisionId: "a", percent: 100, unitPrice: 900, executionDate: d };
  const merged = mergeLinesForClient([
    { ...base, id: "1", sheetCount: 2, quantity: 2, amount: 1800 },
    { ...base, id: "2", sheetCount: 1, quantity: 1, amount: 900 },
    { ...base, id: "3", percent: 50, sheetCount: 1, quantity: 1, amount: 450 },
    { kind: "OTHER", revisionId: null, percent: 100, unitPrice: 120, executionDate: null, id: "4", sheetCount: 1, quantity: 10, amount: 1200 },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].sheetCount, 3);
  assert.equal(merged[0].amount, 2700);
  assert.equal(merged[1].percent, 50);
});
