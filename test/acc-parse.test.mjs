import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAccCost,
  summarizeAccIssues,
  matchCostToMilestones,
  normalizeAccHeader,
} from "../lib/acc/parse-acc.ts";
import { hubIdToAccountId } from "../lib/acc/data-connector.ts";

test("normaliza cabeçalho do ACC removendo acento e pontuação", () => {
  assert.equal(normalizeAccHeader("Original Amount"), "original amount");
  assert.equal(normalizeAccHeader("Descrição (R$)"), "descricao r");
});

test("extrai custo previsto e realizado do cost_budgets", () => {
  const rows = parseAccCost([
    { Name: "Fundações", "Original Amount": "1.000.000,00", "Actual Cost": "1.150.000,00" },
    { Name: "Estrutura", "Original Amount": "2000000", "Actual Cost": "1900000" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].plannedCost, 1_000_000);
  assert.equal(rows[0].actualCost, 1_150_000);
  assert.equal(rows[1].plannedCost, 2_000_000);
});

test("ignora linha de custo sem nenhum valor", () => {
  const rows = parseAccCost([
    { Name: "Vazio", "Original Amount": "", "Actual Cost": "" },
    { Name: "Válido", "Original Amount": "500" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Válido");
});

test("cost sem coluna de nome não quebra", () => {
  assert.deepEqual(parseAccCost([{ Foo: "1", Bar: "2" }]), []);
  assert.deepEqual(parseAccCost([]), []);
});

test("conta issues abertas ignorando status de fechamento", () => {
  const summary = summarizeAccIssues([
    { Status: "open" },
    { Status: "In Review" },
    { Status: "closed" },
    { Status: "Void" },
    { Status: "answered" },
  ]);
  assert.equal(summary.total, 5);
  assert.equal(summary.openIssues, 2);
});

test("issues sem coluna de status devolve total sem inventar abertas", () => {
  const summary = summarizeAccIssues([{ Foo: "x" }, { Foo: "y" }]);
  assert.equal(summary.total, 2);
  assert.equal(summary.openIssues, 0);
});

test("casa custo com marco apenas por nome normalizado idêntico", () => {
  const matched = matchCostToMilestones(
    [
      { name: "FUNDAÇÕES", plannedCost: 100, actualCost: 120 },
      { name: "Algo que não existe", plannedCost: 999, actualCost: 999 },
    ],
    [
      { id: "m1", name: "Fundações" },
      { id: "m2", name: "Estrutura" },
    ],
  );
  assert.equal(matched.size, 1);
  assert.equal(matched.get("m1").plannedCost, 100);
  assert.equal(matched.get("m2"), undefined);
});

test("não faz match fuzzy — nome parecido não casa", () => {
  const matched = matchCostToMilestones(
    [{ name: "Fundações profundas", plannedCost: 100, actualCost: 100 }],
    [{ id: "m1", name: "Fundações" }],
  );
  assert.equal(matched.size, 0, "match parcial contaminaria o DRI silenciosamente");
});

test("soma múltiplas linhas de custo do mesmo marco", () => {
  const matched = matchCostToMilestones(
    [
      { name: "Estrutura", plannedCost: 100, actualCost: 90 },
      { name: "Estrutura", plannedCost: 50, actualCost: 70 },
    ],
    [{ id: "m1", name: "Estrutura" }],
  );
  assert.equal(matched.get("m1").plannedCost, 150);
  assert.equal(matched.get("m1").actualCost, 160);
});

test("soma trata null como ausente, não como zero", () => {
  const matched = matchCostToMilestones(
    [
      { name: "X", plannedCost: null, actualCost: 10 },
      { name: "X", plannedCost: 40, actualCost: null },
    ],
    [{ id: "m1", name: "X" }],
  );
  assert.equal(matched.get("m1").plannedCost, 40);
  assert.equal(matched.get("m1").actualCost, 10);
});

test("hubId vira accountId sem o prefixo b.", () => {
  assert.equal(hubIdToAccountId("b.abc-123"), "abc-123");
  assert.equal(hubIdToAccountId("abc-123"), "abc-123");
});
