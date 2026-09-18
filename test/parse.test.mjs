import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  parseNumber,
  matchColumns,
  parseRows,
  normalizeHeader,
} from "../lib/parse-systemic.ts";

test("normaliza cabeçalho com acento e caixa", () => {
  assert.equal(normalizeHeader("Data Planejada"), "data planejada");
  assert.equal(normalizeHeader("TÉRMINO PREVISTO"), "termino previsto");
  assert.equal(normalizeHeader("Custo  Previsto (R$)"), "custo previsto r");
});

test("reconhece datas em pt-BR, ISO e serial do Excel", () => {
  assert.equal(parseDate("15/03/2026").toISOString().slice(0, 10), "2026-03-15");
  assert.equal(parseDate("2026-03-15").toISOString().slice(0, 10), "2026-03-15");
  assert.equal(parseDate("15/03/26").toISOString().slice(0, 10), "2026-03-15");
  assert.equal(parseDate(46096).toISOString().slice(0, 10), "2026-03-15");
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate("não é data"), null);
});

test("reconhece números em pt-BR e en-US", () => {
  assert.equal(parseNumber("R$ 1.234,56"), 1234.56);
  assert.equal(parseNumber("1,234.56"), 1234.56);
  assert.equal(parseNumber("1234.56"), 1234.56);
  assert.equal(parseNumber("-15"), -15);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("—"), null);
});

test("mapeia colunas por sinônimo sem confundir 'real' com 'custo real'", () => {
  const cols = matchColumns([
    "Marco",
    "Data Planejada",
    "Data Real",
    "Custo Previsto",
    "Custo Real",
  ]);
  assert.equal(cols.milestoneName, "Marco");
  assert.equal(cols.plannedDate, "Data Planejada");
  assert.equal(cols.actualDate, "Data Real");
  assert.equal(cols.plannedCost, "Custo Previsto");
  assert.equal(cols.actualCost, "Custo Real");
});

test("mapeia cabeçalhos em inglês", () => {
  const cols = matchColumns(["Milestone", "Planned Date", "Actual Date", "Budget"]);
  assert.equal(cols.milestoneName, "Milestone");
  assert.equal(cols.plannedDate, "Planned Date");
  assert.equal(cols.actualDate, "Actual Date");
  assert.equal(cols.plannedCost, "Budget");
});

test("deriva atraso a partir das duas datas quando a coluna não existe", () => {
  const { rows, errors } = parseRows([
    { Marco: "Projeto executivo", "Data Planejada": "01/03/2026", "Data Real": "16/03/2026" },
  ]);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].delayDays, 15);
});

test("coluna de atraso explícita tem precedência", () => {
  const { rows } = parseRows([
    {
      Marco: "Montagem",
      "Data Planejada": "01/03/2026",
      "Data Real": "16/03/2026",
      Atraso: "3",
    },
  ]);
  assert.equal(rows[0].delayDays, 3);
});

test("linha sem data nem custo é reportada, não importada", () => {
  const { rows, errors } = parseRows([
    { Marco: "Vazio", "Data Planejada": "", "Data Real": "" },
    { Marco: "Válido", "Data Planejada": "01/03/2026" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].milestoneName, "Válido");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Vazio/);
});

test("linha totalmente em branco é ignorada em silêncio", () => {
  const { rows, errors } = parseRows([
    { Marco: "", "Data Planejada": "" },
    { Marco: "Real", "Data Planejada": "01/03/2026" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 0);
});

test("planilha sem coluna de marco falha com mensagem acionável", () => {
  const { rows, errors } = parseRows([{ Coluna: "x", Outra: "y" }]);
  assert.equal(rows.length, 0);
  assert.match(errors[0].message, /coluna da tarefa/i);
});

test("planilha vazia não quebra", () => {
  const { rows, errors } = parseRows([]);
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
});
