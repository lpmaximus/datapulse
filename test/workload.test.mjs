import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkloadGrid, CONCENTRATED_DUE_THRESHOLD } from "../lib/workload.ts";

const d = (iso) => new Date(iso + "T00:00:00.000Z");
const MON = d("2026-09-21");
const users = [
  { id: "a", name: "Ana" },
  { id: "b", name: "Bruno" },
];
const e = (userId, date, h, actual = null) => ({ userId, date: d(date), plannedHours: h, actualHours: actual });
const due = (userId, date) => ({ userId, dueAt: d(date) });
const row = (rows, id) => rows.find((r) => r.user.id === id);

test("horas por dia usam realizado quando ajustado e somam entradas do dia", () => {
  const rows = buildWorkloadGrid({
    users, weekStart: MON, today: MON,
    entries: [e("a", "2026-09-21", 4), e("a", "2026-09-21", 2, 3), e("b", "2026-09-22", 8)],
    dues: [],
  });
  const a = row(rows, "a");
  assert.equal(a.days[0].hours, 7);
  assert.equal(a.days[0].pct, 87.5);
  assert.equal(a.weekHours, 7);
  assert.equal(a.weekPct, 17.5);
  assert.equal(row(rows, "b").days[1].pct, 100);
  assert.equal(row(rows, "b").days[1].over, false);
});

test("dia acima de 8h gera OVER", () => {
  const rows = buildWorkloadGrid({ users, weekStart: MON, today: MON, entries: [e("a", "2026-09-22", 9)], dues: [] });
  assert.deepEqual(row(rows, "a").days[1].signals, ["OVER"]);
  assert.ok(row(rows, "a").signals.includes("OVER"));
});

test("documento vencendo em dia sem horas: sinal só de hoje para trás", () => {
  const rows = buildWorkloadGrid({
    users, weekStart: MON, today: d("2026-09-23"),
    entries: [e("b", "2026-09-22", 2)],
    dues: [due("a", "2026-09-22"), due("a", "2026-09-25"), due("b", "2026-09-22")],
  });
  const a = row(rows, "a");
  assert.deepEqual(a.days[1].signals, ["DUE_NO_HOURS"]);
  assert.deepEqual(a.days[4].signals, []); // futuro: ainda dá tempo de apontar
  assert.equal(a.days[4].dueCount, 1);
  assert.deepEqual(row(rows, "b").days[1].signals, []); // tem horas
});

test("vencimentos concentrados", () => {
  const dues = Array.from({ length: CONCENTRATED_DUE_THRESHOLD }, () => due("a", "2026-09-24"));
  const rows = buildWorkloadGrid({ users, weekStart: MON, today: MON, entries: [], dues });
  assert.deepEqual(row(rows, "a").days[3].signals, ["DUE_CONCENTRATED"]);
});

test("vencidos de qualquer semana entram em overdueCount", () => {
  const rows = buildWorkloadGrid({
    users, weekStart: MON, today: d("2026-09-23"),
    entries: [], dues: [due("a", "2026-09-10"), due("a", "2026-09-22"), due("a", "2026-09-30")],
  });
  assert.equal(row(rows, "a").overdueCount, 2);
  assert.ok(row(rows, "a").signals.includes("OVERDUE"));
});

test("ordena por sinais, depois carga, depois nome", () => {
  const rows = buildWorkloadGrid({
    users: [...users, { id: "c", name: "Carla" }], weekStart: MON, today: MON,
    entries: [e("b", "2026-09-21", 6), e("a", "2026-09-21", 2), e("c", "2026-09-21", 9)],
    dues: [],
  });
  assert.deepEqual(rows.map((r) => r.user.id), ["c", "b", "a"]);
});
