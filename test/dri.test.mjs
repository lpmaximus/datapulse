import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMilestoneDRI,
  computeProjectDRI,
  computeHumanScore,
  computeSystemicScore,
  driBand,
  clamp,
} from "../lib/dri.ts";

const NOW = new Date("2026-08-17T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n) => new Date(NOW.getTime() + n * 86_400_000);

const baseMilestone = {
  id: "m1",
  name: "Marco",
  criticality: "MEDIUM",
  humanSignals: [],
  systemicSignals: [],
};

test("score fica entre 0 e 100 mesmo com entradas extremas", () => {
  const r = computeMilestoneDRI(
    {
      ...baseMilestone,
      criticality: "CRITICAL",
      plannedDate: daysAgo(500),
      humanSignals: [
        { failureProbability: 100, planConfidence: 1, blockedDecision: true, createdAt: daysAgo(1) },
      ],
      systemicSignals: [
        {
          referenceDate: daysAgo(1),
          delayDays: 900,
          plannedCost: 100,
          actualCost: 100000,
          openIssues: 500,
          replanCount: 90,
        },
      ],
    },
    NOW,
  );
  assert.ok(r.score <= 100 && r.score >= 0, `score fora da faixa: ${r.score}`);
  assert.equal(r.score, 100);
});

test("sem nenhum sinal, score é 0 e confiança é baixa", () => {
  const r = computeMilestoneDRI({ ...baseMilestone }, NOW);
  assert.equal(r.score, 0);
  assert.equal(r.humanScore, null);
  assert.equal(r.systemicScore, null);
  assert.ok(r.confidence < 0.3);
});

test("marco já concluído não pode ser a restrição", () => {
  const r = computeMilestoneDRI(
    {
      ...baseMilestone,
      criticality: "CRITICAL",
      actualDate: daysAgo(3),
      plannedDate: daysAgo(60),
      economicImpact: 1_000_000,
      humanSignals: [
        { failureProbability: 95, planConfidence: 1, createdAt: daysAgo(1) },
      ],
      systemicSignals: [{ referenceDate: daysAgo(1), delayDays: 57 }],
    },
    NOW,
  );
  assert.equal(r.score, 0);
  assert.equal(r.economicExposure, 0);
});

test("apenas sinal humano: peso é renormalizado para 100% humano", () => {
  const r = computeMilestoneDRI(
    {
      ...baseMilestone,
      humanSignals: [
        { failureProbability: 80, planConfidence: 2, createdAt: daysAgo(1) },
      ],
    },
    NOW,
  );
  assert.equal(r.breakdown.humanWeight, 1);
  assert.equal(r.breakdown.systemicWeight, 0);
  assert.equal(r.systemicScore, null);
  assert.ok(r.score > 0);
});

test("apenas sinal sistêmico: peso é renormalizado para 100% sistêmico", () => {
  const r = computeMilestoneDRI(
    {
      ...baseMilestone,
      plannedDate: daysAgo(30),
      systemicSignals: [{ referenceDate: daysAgo(1), delayDays: 30 }],
    },
    NOW,
  );
  assert.equal(r.breakdown.systemicWeight, 1);
  assert.equal(r.humanScore, null);
  assert.ok(r.score > 0);
});

test("sinais humanos fora da janela de 45 dias são ignorados", () => {
  const { score, used } = computeHumanScore(
    [{ failureProbability: 90, planConfidence: 1, createdAt: daysAgo(60) }],
    NOW,
  );
  assert.equal(score, null);
  assert.equal(used, 0);
});

test("divergência entre respondentes eleva o componente humano", () => {
  const concordam = computeHumanScore(
    [
      { failureProbability: 50, planConfidence: 3, createdAt: daysAgo(1) },
      { failureProbability: 50, planConfidence: 3, createdAt: daysAgo(1) },
    ],
    NOW,
  );
  const divergem = computeHumanScore(
    [
      { failureProbability: 10, planConfidence: 3, createdAt: daysAgo(1) },
      { failureProbability: 90, planConfidence: 3, createdAt: daysAgo(1) },
    ],
    NOW,
  );
  assert.equal(concordam.components.divergence.value, 0);
  assert.ok(divergem.components.divergence.value > 0);
  assert.ok(divergem.score > concordam.score);
});

test("atraso maior gera score sistêmico maior (monotonicidade)", () => {
  const mk = (delay) =>
    computeSystemicScore(
      { plannedDate: daysAgo(10), forecastDate: null, actualDate: null },
      [{ referenceDate: daysAgo(1), delayDays: delay }],
      NOW,
    ).score;

  assert.ok(mk(0) < mk(10));
  assert.ok(mk(10) < mk(25));
  assert.equal(mk(30), mk(60), "acima do horizonte, satura em 100");
});

test("adiantamento não vira risco (atraso negativo trata como 0)", () => {
  const r = computeSystemicScore(
    { plannedDate: daysAhead(30), forecastDate: null, actualDate: null },
    [{ referenceDate: daysAgo(1), delayDays: -12 }],
    NOW,
  );
  assert.equal(r.components.scheduleSlip.value, 0);
});

test("criticidade CRITICAL pontua acima de LOW com os mesmos sinais", () => {
  const mk = (criticality) =>
    computeMilestoneDRI(
      {
        ...baseMilestone,
        criticality,
        humanSignals: [
          { failureProbability: 50, planConfidence: 3, createdAt: daysAgo(1) },
        ],
      },
      NOW,
    ).score;

  assert.ok(mk("LOW") < mk("MEDIUM"));
  assert.ok(mk("MEDIUM") < mk("HIGH"));
  assert.ok(mk("HIGH") < mk("CRITICAL"));
});

test("exposição econômica = score/100 * impacto", () => {
  const r = computeMilestoneDRI(
    {
      ...baseMilestone,
      economicImpact: 1_000_000,
      humanSignals: [
        { failureProbability: 60, planConfidence: 2, createdAt: daysAgo(1) },
      ],
    },
    NOW,
  );
  assert.equal(r.economicExposure, Math.round((r.score / 100) * 1_000_000 * 100) / 100);
});

test("DRI do projeto é dominado pelo pior marco, não pela média", () => {
  const umGargalo = computeProjectDRI([
    { score: 90, economicImpact: 100 },
    { score: 5, economicImpact: 100 },
    { score: 5, economicImpact: 100 },
  ]);
  const media = (90 + 5 + 5) / 3;
  assert.ok(
    umGargalo.score > media,
    `esperava score acima da média (${media}), veio ${umGargalo.score}`,
  );
  assert.equal(umGargalo.dominant, 90);
});

test("projeto sem marcos não quebra", () => {
  assert.deepEqual(computeProjectDRI([]), { score: 0, dominant: 0, contextual: 0 });
});

test("faixas do DRI batem com os limiares do dashboard", () => {
  assert.equal(driBand(0), "low");
  assert.equal(driBand(34.9), "low");
  assert.equal(driBand(35), "watch");
  assert.equal(driBand(54.9), "watch");
  assert.equal(driBand(55), "high");
  assert.equal(driBand(74.9), "high");
  assert.equal(driBand(75), "critical");
  assert.equal(driBand(100), "critical");
});

test("clamp protege contra NaN", () => {
  assert.equal(clamp(Number.NaN), 0);
  assert.equal(clamp(150), 100);
  assert.equal(clamp(-10), 0);
});

/* ------------------- mvp-2: sinais operacionais e agregação ------------------- */

import { computeOperationalComponents, aggregateGroupDRI, FORMULA_VERSION } from "../lib/dri.ts";

const noOp = {
  openImpedimentDates: [],
  pendingRequestDueDates: [],
  reviewsInReviewSince: [],
  maxRevisionsPerDocument: 0,
};

test("versão da fórmula", () => {
  assert.equal(FORMULA_VERSION, "mvp-2");
});

test("prazo previsto já vencido, sem conclusão, continua gerando atraso até hoje", () => {
  const r = computeSystemicScore(
    { plannedDate: daysAgo(20), forecastDate: daysAgo(10), actualDate: null },
    [],
    NOW,
  );
  // atraso = hoje − planejado = 20 dias → 20/30
  assert.ok(Math.abs(r.components.scheduleSlip.value - (20 / 30) * 100) < 0.01);
});

test("previsão futura continua valendo como data efetiva", () => {
  const r = computeSystemicScore(
    { plannedDate: daysAgo(10), forecastDate: daysAhead(5), actualDate: null },
    [],
    NOW,
  );
  // atraso = previsão − planejado = 15 dias
  assert.ok(Math.abs(r.components.scheduleSlip.value - (15 / 30) * 100) < 0.01);
});

test("sem nenhuma condição operacional, nenhum componente operacional", () => {
  assert.deepEqual(computeOperationalComponents(noOp, NOW), {});
  assert.deepEqual(computeOperationalComponents(undefined, NOW), {});
});

test("impedimento aberto: pesa pelo mais antigo e satura em 21 dias", () => {
  const half = computeOperationalComponents(
    { ...noOp, openImpedimentDates: [daysAgo(2), daysAgo(10.5)] },
    NOW,
  );
  assert.ok(Math.abs(half.openImpediment.value - 50) < 0.01);
  const full = computeOperationalComponents({ ...noOp, openImpedimentDates: [daysAgo(40)] }, NOW);
  assert.equal(full.openImpediment.value, 100);
});

test("solicitação vencida: só conta a com prazo passado; sem prazo ou no prazo não", () => {
  const c = computeOperationalComponents(
    { ...noOp, pendingRequestDueDates: [daysAgo(7), daysAhead(3), null] },
    NOW,
  );
  assert.ok(Math.abs(c.overdueRequests.value - 50) < 0.01);
  const none = computeOperationalComponents(
    { ...noOp, pendingRequestDueDates: [daysAhead(3), null] },
    NOW,
  );
  assert.equal(none.overdueRequests, undefined);
});

test("revisão parada em análise: 7 dias = metade do horizonte de 14", () => {
  const c = computeOperationalComponents({ ...noOp, reviewsInReviewSince: [daysAgo(7)] }, NOW);
  assert.ok(Math.abs(c.reviewStall.value - 50) < 0.01);
});

test("ciclos de revisão: 1 revisão não pesa; 4 saturam", () => {
  assert.equal(
    computeOperationalComponents({ ...noOp, maxRevisionsPerDocument: 1 }, NOW).revisionCycles,
    undefined,
  );
  const two = computeOperationalComponents({ ...noOp, maxRevisionsPerDocument: 2 }, NOW);
  assert.ok(Math.abs(two.revisionCycles.value - (1 / 3) * 100) < 0.01);
  const four = computeOperationalComponents({ ...noOp, maxRevisionsPerDocument: 4 }, NOW);
  assert.equal(four.revisionCycles.value, 100);
});

test("impedimento antigo sozinho já vira restrição, sem datas nem sinais", () => {
  const r = computeMilestoneDRI(
    { ...baseMilestone, operational: { ...noOp, openImpedimentDates: [daysAgo(21)] } },
    NOW,
  );
  assert.equal(r.score, 100);
  assert.ok(r.breakdown.systemic.openImpediment);
});

test("tarefa concluída zera o DRI mesmo com impedimento antigo registrado", () => {
  const r = computeMilestoneDRI(
    {
      ...baseMilestone,
      actualDate: daysAgo(1),
      operational: { ...noOp, openImpedimentDates: [daysAgo(30)] },
    },
    NOW,
  );
  assert.equal(r.score, 0);
});

test("marco que agrupa: pior das filhas, não média", () => {
  const g = aggregateGroupDRI([
    { name: "A", score: 20 },
    { name: "B", score: 80 },
    { name: "C", score: 50 },
  ]);
  assert.deepEqual(g, { score: 80, dominantChild: "B", childCount: 3 });
  assert.deepEqual(aggregateGroupDRI([]), { score: 0, dominantChild: null, childCount: 0 });
});
