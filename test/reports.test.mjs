import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPortfolioReport,
  buildProjectReport,
  buildPackageReport,
  driDelta,
  latestRevisions,
  daysInReview,
  summarizeDocuments,
  STALLED_DAYS,
} from "../lib/reports.ts";
import { NOW, projectA, projectB, projectC, packageInput } from "./fixtures-reports.mjs";

test("driDelta compara com o snapshot mais próximo de 7 dias", () => {
  const r = driDelta(projectA.driScores, NOW);
  assert.equal(r.latest, 72.4);
  assert.equal(r.previous, 55.5); // 12/09 é o mais próximo de 12/09
  assert.equal(r.delta, 16.9);
});

test("driDelta sem histórico ou com um único ponto", () => {
  assert.deepEqual(driDelta([], NOW), { latest: null, previous: null, delta: null });
  const one = driDelta([{ score: 10, calculatedAt: NOW }], NOW);
  assert.equal(one.latest, 10);
  assert.equal(one.delta, null);
});

test("latestRevisions fica com a de maior sequência por documento", () => {
  const latest = latestRevisions(projectA.revisions);
  assert.equal(latest.length, 3);
  assert.equal(latest.find((r) => r.documentId === "d2").name, "R01");
});

test("daysInReview só conta revisão em análise", () => {
  assert.equal(daysInReview({ status: "IN_REVIEW", inReviewSince: new Date("2026-09-05T00:00:00Z") }, NOW), 14);
  assert.equal(daysInReview({ status: "APPROVED", inReviewSince: new Date("2026-09-05T00:00:00Z") }, NOW), null);
});

test("carteira ordena pelo pior DRI, ativo primeiro, sem DRI por último", () => {
  const rep = buildPortfolioReport([projectB, projectC, projectA], NOW);
  assert.deepEqual(rep.rows.map((r) => r.id), ["pa", "pb", "pc"]);
  assert.equal(rep.totals.projects, 3);
  assert.equal(rep.totals.active, 2);
  assert.equal(rep.totals.high, 1); // 72,4 = restrição provável
  assert.equal(rep.rows[0].dominant, "Emissao R00 - Eletrica");
  assert.equal(rep.rows[2].dri, null);
});

test("carteira: DRI médio só considera projeto ativo com DRI", () => {
  const rep = buildPortfolioReport([projectA, projectB, projectC], NOW);
  assert.equal(rep.totals.averageDri, 46.2); // (72,4 + 20) / 2
});

test("carteira: piorou = variação positiva, maior primeiro", () => {
  const rep = buildPortfolioReport([projectA, projectB], NOW);
  assert.deepEqual(rep.worsened.map((r) => r.id), ["pa"]); // B melhorou (-5)
});

test("carteira conta impedimento, solicitação vencida e revisão parada", () => {
  const rep = buildPortfolioReport([projectA], NOW);
  const row = rep.rows[0];
  assert.equal(row.openImpediments, 1);
  assert.equal(row.overdueRequests, 1);
  assert.equal(row.stalledReviews, 1); // R00 em análise desde 25/08 = 25 dias
  assert.ok(25 >= STALLED_DAYS);
  assert.equal(row.health, "LATE");
});

test("projeto: tarefa cancelada não entra nas contagens nem na lista", () => {
  const rep = buildProjectReport(projectA, NOW);
  assert.equal(rep.counts.tasks, 6 - 1);
  assert.ok(!rep.tasks.some((t) => t.name === "Tarefa cancelada"));
});

test("projeto: árvore com marco, filhas e depois tarefas sem pai", () => {
  const rep = buildProjectReport(projectA, NOW);
  const names = rep.tasks.map((t) => t.name);
  assert.equal(names[0], "Marco 1 - Projeto basico");
  assert.equal(rep.tasks[0].isGroup, true);
  assert.equal(rep.tasks[1].isChild, true);
  assert.equal(names[names.length - 1], "Licenciamento");
});

test("projeto: restrição dominante usa só folhas em aberto, maior DRI primeiro", () => {
  const rep = buildProjectReport(projectA, NOW);
  // marco m1 tem filhas: não entra; p2 está concluída: não entra.
  assert.deepEqual(rep.constraints.map((t) => t.id), ["p1", "t3", "t4"]);
});

test("projeto: solicitação vencida vem antes; respondida some", () => {
  const rep = buildProjectReport(projectA, NOW);
  assert.equal(rep.requests.length, 1);
  assert.equal(rep.requests[0].overdue, true);
  assert.equal(rep.counts.overdueRequests, 1);
});

test("projeto: tendência em ordem cronológica", () => {
  const rep = buildProjectReport(projectA, NOW);
  assert.equal(rep.dri.trend[0].score, 40);
  assert.equal(rep.dri.trend.at(-1).score, 72.4);
});

test("documentos: resumo usa a revisão vigente e ignora cancelado no percentual", () => {
  const s = summarizeDocuments(projectA.revisions, NOW);
  assert.equal(s.totalDocuments, 3);
  assert.equal(s.approved, 1);
  assert.equal(s.inReview, 1);
  assert.equal(s.draft, 1); // d2 R01 emitida
  assert.equal(s.returned, 0); // d2 R00 comentada já foi sucedida
  assert.equal(s.approvedPct, 33);
  assert.equal(s.stalled, 1);
  assert.equal(s.averageRevisions, 1.3);
  const ele = s.byDiscipline.find((x) => x.tag === "ELE");
  assert.deepEqual([ele.total, ele.approved, ele.open], [2, 0, 2]);
});

test("documentos: projeto sem revisões não quebra", () => {
  const s = summarizeDocuments([], NOW);
  assert.equal(s.approvedPct, null);
  assert.equal(s.averageRevisions, null);
  assert.deepEqual(s.byDiscipline, []);
});

test("pacote: contagens, dias parado e atraso de prazo", () => {
  const rep = buildPackageReport(packageInput, NOW);
  assert.equal(rep.counts.total, 2);
  assert.equal(rep.counts.inReview, 1);
  assert.equal(rep.counts.returned, 1);
  assert.equal(rep.counts.longestReviewDays, 25);
  assert.equal(rep.counts.finalPct, 50);
  assert.equal(rep.header.slip, 20);
  assert.equal(rep.header.overdue, false); // previsto 25/09
});

test("pacote: histórico cronológico e revisão em análise atrasada", () => {
  const rep = buildPackageReport(packageInput, NOW);
  assert.deepEqual(rep.transitions.map((t) => t.id), ["x1", "x2", "x3"]);
  const r1 = rep.revisions.find((r) => r.id === "r1");
  assert.equal(r1.overdue, true); // venceu 10/09
  const r2 = rep.revisions.find((r) => r.id === "r2");
  assert.equal(r2.overdue, false); // comentada: não é mais prazo aberto
});

test("pacote vazio não quebra", () => {
  const rep = buildPackageReport({ ...packageInput, revisions: [], transitions: [], requests: [], deadlineChanges: [] }, NOW);
  assert.equal(rep.counts.total, 0);
  assert.equal(rep.counts.finalPct, null);
  assert.equal(rep.counts.longestReviewDays, null);
});
