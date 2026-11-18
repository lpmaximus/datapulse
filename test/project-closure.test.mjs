import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canCloseProject,
  canReopenProject,
  statusChangeLabel,
  isDocumentPending,
  openMeetingTopics,
  openMeasurements,
  closureChecklist,
  checklistSnapshot,
  closureMetrics,
  closureNeedsReason,
  validateClosure,
  validateReopen,
} from "../lib/project-closure.ts";

const d = (s) => new Date(s + "T00:00:00Z");
const doc = (id, statuses) => ({
  id,
  number: `DOC-${id}`,
  name: `Documento ${id}`,
  revisions: statuses.map((status, i) => ({ name: `R0${i}`, status })),
});
const empty = (over = {}) => ({
  projectId: "p1",
  tasks: [],
  documents: [],
  requests: [],
  impediments: [],
  topics: [],
  toMeasure: [],
  measurementLines: [],
  ...over,
});
const form = (over = {}) => ({
  closureType: "COMPLETED",
  closedOn: "2026-11-18",
  acceptanceRef: "",
  summary: "",
  lessonsKeep: "",
  lessonsImprove: "",
  reason: "",
  ...over,
});
const TODAY = new Date("2026-11-18T17:00:00Z");

test("encerrar vale para ativo e pausado; reabrir só para encerrado", () => {
  assert.equal(canCloseProject("ACTIVE"), true);
  assert.equal(canCloseProject("PAUSED"), true);
  assert.equal(canCloseProject("CLOSED"), false);
  assert.equal(canReopenProject("CLOSED"), true);
  assert.equal(canReopenProject("PAUSED"), false);
});

test("rótulos do histórico de status", () => {
  assert.equal(statusChangeLabel("ACTIVE", "CLOSED"), "Encerrado");
  assert.equal(statusChangeLabel("PAUSED", "CLOSED"), "Encerrado");
  assert.equal(statusChangeLabel("CLOSED", "ACTIVE"), "Reaberto");
  assert.equal(statusChangeLabel("ACTIVE", "PAUSED"), "Pausado");
  assert.equal(statusChangeLabel("PAUSED", "ACTIVE"), "Reativado");
});

test("documento só sai da pendência com a revisão vigente aprovada ou cancelada", () => {
  assert.equal(isDocumentPending(doc("1", ["COMMENTED", "APPROVED"])), false);
  assert.equal(isDocumentPending(doc("2", ["APPROVED", "CANCELLED"])), false);
  assert.equal(isDocumentPending(doc("3", ["APPROVED", "IN_REVIEW"])), true);
  assert.equal(isDocumentPending(doc("4", ["COMMENTED"])), true);
  assert.equal(isDocumentPending(doc("5", [])), true);
});

test("pendência de reunião vale pela cópia mais recente do item", () => {
  const topics = [
    { id: "a", sourceTopicId: null, description: "Enviar memorial", status: "PENDENTE", meetingId: "m1", meetingDate: d("2026-11-01") },
    { id: "b", sourceTopicId: "a", description: "Enviar memorial", status: "CONCLUÍDO", meetingId: "m2", meetingDate: d("2026-11-08") },
    { id: "c", sourceTopicId: null, description: "Definir cota", status: "Pendente", meetingId: "m2", meetingDate: d("2026-11-08") },
    { id: "e", sourceTopicId: null, description: "Aviso geral", status: "INFORMATIVO", meetingId: "m2", meetingDate: d("2026-11-08") },
  ];
  assert.deepEqual(openMeetingTopics(topics).map((t) => t.id), ["c"]);
});

test("BMs em aberto agrupam as linhas e ignoram aprovados/cancelados", () => {
  const lines = [
    { measurementId: "bm1", code: "BM-01 R00", status: "DRAFT", amount: 100 },
    { measurementId: "bm1", code: "BM-01 R00", status: "DRAFT", amount: 50.5 },
    { measurementId: "bm2", code: "BM-02 R00", status: "APPROVED", amount: 300 },
    { measurementId: "bm3", code: "BM-03 R00", status: "CANCELLED", amount: 80 },
    { measurementId: "bm4", code: "BM-04 R00", status: "SENT", amount: 20 },
  ];
  assert.deepEqual(openMeasurements(lines), [
    { id: "bm1", code: "BM-01 R00", status: "DRAFT", amount: 150.5 },
    { id: "bm4", code: "BM-04 R00", status: "SENT", amount: 20 },
  ]);
});

test("projeto sem pendências: checklist zerado", () => {
  const c = closureChecklist(
    empty({
      tasks: [{ id: "t1", name: "Emissão", status: "DONE", parentId: null }],
      documents: [doc("1", ["APPROVED"]), doc("2", ["CANCELLED"])],
    }),
  );
  assert.equal(c.pendingCount, 0);
  assert.equal(c.items.length, 7);
  assert.deepEqual(checklistSnapshot(c), []);
});

test("checklist conta só folhas abertas e itens realmente pendentes", () => {
  const c = closureChecklist(
    empty({
      tasks: [
        { id: "m", name: "Marco", kind: "MILESTONE", status: "IN_PROGRESS", parentId: null },
        { id: "t1", name: "Filha aberta", status: "IN_PROGRESS", parentId: "m" },
        { id: "t2", name: "Filha cancelada", status: "CANCELLED", parentId: "m" },
      ],
      documents: [doc("1", ["IN_REVIEW"]), doc("2", ["APPROVED"])],
      requests: [
        { id: "r1", title: "Enviar LD", status: "PENDING" },
        { id: "r2", title: "Já respondida", status: "ANSWERED" },
      ],
      impediments: [{ id: "i1", description: "Aguardando topografia", taskId: "t1", taskName: "Filha aberta" }],
      toMeasure: [
        { documentId: "2", documentNumber: "DOC-2", documentName: "Documento 2", revisionName: "R00", remainingPercent: 40, value: 400 },
        { documentId: "1", documentNumber: "DOC-1", documentName: "Documento 1", revisionName: "R00", remainingPercent: 0, value: 0 },
      ],
    }),
  );
  const count = Object.fromEntries(c.items.map((i) => [i.key, i.count]));
  assert.deepEqual(count, {
    deliverables: 1,
    tasks: 1,
    requests: 1,
    impediments: 1,
    meetingTopics: 0,
    toMeasure: 1,
    measurements: 0,
  });
  assert.equal(c.pendingCount, 5);
  const deliv = c.items.find((i) => i.key === "deliverables");
  assert.equal(deliv.details[0].label, "DOC-1 — Documento 1 (R00: em análise)");
  assert.equal(deliv.details[0].href, "/projects/p1/documents?doc=1");
  assert.equal(checklistSnapshot(c).length, 5);
});

test("indicadores finais: prazo, retrabalho, aprovação de primeira e medição", () => {
  const m = closureMetrics(
    empty({
      tasks: [
        { id: "t1", name: "A", status: "DONE", parentId: null },
        { id: "t2", name: "B", status: "CANCELLED", parentId: null },
      ],
      documents: [
        doc("1", ["APPROVED"]),
        doc("2", ["COMMENTED", "APPROVED"]),
        doc("3", ["CANCELLED"]),
        doc("4", ["IN_REVIEW"]),
      ],
      toMeasure: [{ documentId: "2", documentNumber: null, documentName: "x", revisionName: "R01", remainingPercent: 50, value: 225 }],
      measurementLines: [
        { measurementId: "bm1", code: "BM-01", status: "APPROVED", amount: 900 },
        { measurementId: "bm2", code: "BM-02", status: "SENT", amount: 100 },
        { measurementId: "bm3", code: "BM-03", status: "CANCELLED", amount: 999 },
      ],
    }),
    { startsAt: d("2026-11-01"), endsAt: d("2026-11-10"), closedOn: d("2026-11-18"), cost: 5000 },
  );
  assert.equal(m.scheduleVarianceDays, 8);
  assert.equal(m.tasksTotal, 1);
  assert.equal(m.tasksDone, 1);
  assert.equal(m.documentsTotal, 4);
  assert.equal(m.documentsApproved, 2);
  assert.equal(m.documentsCancelled, 1);
  assert.equal(m.documentsPending, 1);
  assert.equal(m.revisionsIssued, 4);
  assert.equal(m.reworkRevisions, 1);
  assert.equal(m.firstPassApprovalPct, 50);
  assert.equal(m.measuredApproved, 900);
  assert.equal(m.measuredPending, 100);
  assert.equal(m.valueToMeasure, 225);
  assert.equal(m.plannedEnd, "2026-11-10");
  assert.equal(m.closedOn, "2026-11-18");
});

test("sem término previsto, não há desvio de prazo; sem aprovados, sem % de primeira", () => {
  const m = closureMetrics(empty(), { startsAt: null, endsAt: null, closedOn: d("2026-11-18"), cost: null });
  assert.equal(m.scheduleVarianceDays, null);
  assert.equal(m.firstPassApprovalPct, null);
});

test("justificativa exigida com pendência ou interrupção", () => {
  assert.equal(closureNeedsReason("COMPLETED", 0), false);
  assert.equal(closureNeedsReason("COMPLETED", 2), true);
  assert.equal(closureNeedsReason("INTERRUPTED", 0), true);
});

test("validação do termo de encerramento", () => {
  const ctx = { pendingCount: 0, startsAt: d("2026-11-01"), today: TODAY };
  const ok = validateClosure(form({ summary: "  Entregue  ", lessonsKeep: "Reunião semanal" }), ctx);
  assert.ok("value" in ok);
  assert.equal(ok.value.summary, "Entregue");
  assert.equal(ok.value.acceptanceRef, null);
  assert.equal(ok.value.closedOn.toISOString(), "2026-11-18T00:00:00.000Z");

  assert.match(validateClosure(form({ closureType: "" }), ctx).error, /concluído ou interrompido/);
  assert.match(validateClosure(form({ closedOn: "" }), ctx).error, /data do encerramento/);
  assert.match(validateClosure(form({ closedOn: "2026-11-19" }), ctx).error, /futura/);
  assert.match(validateClosure(form({ closedOn: "2026-10-31" }), ctx).error, /anterior ao início/);
  assert.match(validateClosure(form({ closureType: "INTERRUPTED" }), ctx).error, /interrompido/);
  assert.match(validateClosure(form(), { ...ctx, pendingCount: 3 }).error, /pendências abertas/);
  assert.ok("value" in validateClosure(form({ reason: "Contratante aceitou por e-mail" }), { ...ctx, pendingCount: 3 }));
  assert.match(validateClosure(form({ summary: "x".repeat(4001) }), ctx).error, /até 4000/);
});

test("reabrir exige justificativa", () => {
  assert.match(validateReopen("   ").error, /reaberto/);
  assert.deepEqual(validateReopen(" Nova revisão pedida pela IDG "), { value: "Nova revisão pedida pela IDG" });
});
