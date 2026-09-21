import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_CAPACITY_HOURS,
  WEEK_CAPACITY_HOURS,
  parseHours,
  parseDay,
  isWeekday,
  weekStartOf,
  resolveWeek,
  shiftWeek,
  weekDays,
  effectiveHours,
  summarizeDay,
  formatHours,
  isTimeCategory,
  TIME_CATEGORIES,
  TIME_CATEGORY_LABEL,
} from "../lib/timesheet.ts";

const d = (iso) => new Date(iso + "T00:00:00.000Z");
const iso = (x) => x.toISOString().slice(0, 10);

test("capacidade: 8 h por dia, 40 h por semana", () => {
  assert.equal(DAILY_CAPACITY_HOURS, 8);
  assert.equal(WEEK_CAPACITY_HOURS, 40);
});

test("parseHours aceita vírgula, ponto e passos de 15 min", () => {
  assert.deepEqual(parseHours("2"), { hours: 2 });
  assert.deepEqual(parseHours("1,5"), { hours: 1.5 });
  assert.deepEqual(parseHours(" 0.25 "), { hours: 0.25 });
  assert.deepEqual(parseHours("24"), { hours: 24 });
});

test("parseHours recusa vazio, texto, negativo, fora da faixa e passo quebrado", () => {
  for (const bad of ["", "  ", "abc", "-1", "1,2,3", "0", "0,1", "25", "1,3"]) {
    assert.ok("error" in parseHours(bad), bad);
  }
});

test("parseDay valida o formato e o calendário", () => {
  assert.equal(iso(parseDay("2026-09-21")), "2026-09-21");
  assert.equal(parseDay("2026-02-30"), null);
  assert.equal(parseDay("21/09/2026"), null);
  assert.equal(parseDay(""), null);
});

test("dias úteis: segunda a sexta", () => {
  assert.equal(isWeekday(d("2026-09-21")), true); // segunda
  assert.equal(isWeekday(d("2026-09-25")), true); // sexta
  assert.equal(isWeekday(d("2026-09-26")), false); // sábado
  assert.equal(isWeekday(d("2026-09-27")), false); // domingo
});

test("a semana começa na segunda", () => {
  assert.equal(iso(weekStartOf(d("2026-09-21"))), "2026-09-21");
  assert.equal(iso(weekStartOf(d("2026-09-23"))), "2026-09-21");
  assert.equal(iso(weekStartOf(d("2026-09-25"))), "2026-09-21");
  assert.equal(iso(weekStartOf(d("2026-09-26"))), "2026-09-21");
  assert.equal(iso(weekStartOf(d("2026-09-27"))), "2026-09-21");
  assert.equal(iso(weekStartOf(d("2026-09-28"))), "2026-09-28");
});

test("resolveWeek usa o parâmetro; sem ele (ou inválido), a semana de hoje em Brasília", () => {
  const now = new Date("2026-09-23T15:00:00.000Z");
  assert.equal(iso(resolveWeek("2026-10-08", now)), "2026-10-05");
  assert.equal(iso(resolveWeek(undefined, now)), "2026-09-21");
  assert.equal(iso(resolveWeek("lixo", now)), "2026-09-21");
  // Domingo 22h em Brasília já é segunda em UTC: continua a semana que termina.
  assert.equal(iso(resolveWeek(undefined, new Date("2026-09-28T01:00:00.000Z"))), "2026-09-21");
});

test("shiftWeek e weekDays", () => {
  const start = d("2026-09-21");
  assert.equal(iso(shiftWeek(start, 1)), "2026-09-28");
  assert.equal(iso(shiftWeek(start, -2)), "2026-09-07");
  assert.deepEqual(weekDays(start).map(iso), [
    "2026-09-21",
    "2026-09-22",
    "2026-09-23",
    "2026-09-24",
    "2026-09-25",
  ]);
});

test("o realizado ajustado vale mais que o previsto", () => {
  assert.equal(effectiveHours({ plannedHours: 4, actualHours: null }), 4);
  assert.equal(effectiveHours({ plannedHours: 4, actualHours: 2.5 }), 2.5);
  assert.equal(effectiveHours({ plannedHours: 4, actualHours: 0 }), 0);
});

test("resumo do dia: previsto, efetivo, % e excesso", () => {
  const s = summarizeDay([
    { plannedHours: 4, actualHours: null },
    { plannedHours: 2, actualHours: 3 },
  ]);
  assert.equal(s.planned, 6);
  assert.equal(s.effective, 7);
  assert.equal(s.pct, 87.5);
  assert.equal(s.over, false);
  assert.equal(summarizeDay([{ plannedHours: 9, actualHours: null }]).over, true);
  assert.equal(summarizeDay([{ plannedHours: 8, actualHours: null }]).over, false);
  assert.equal(summarizeDay([]).pct, 0);
});

test("formatHours", () => {
  assert.equal(formatHours(2), "2 h");
  assert.equal(formatHours(1.5), "1,5 h");
  assert.equal(formatHours(0.25), "0,25 h");
});

test("categorias: todas têm rótulo e são reconhecidas", () => {
  for (const c of TIME_CATEGORIES) {
    assert.ok(TIME_CATEGORY_LABEL[c]);
    assert.equal(isTimeCategory(c), true);
  }
  assert.equal(isTimeCategory("FERIAS"), false);
});
