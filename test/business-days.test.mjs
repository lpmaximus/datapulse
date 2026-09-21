import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addBusinessDays,
  reviewDueDate,
  calendarDay,
  REVIEW_BUSINESS_DAYS,
} from "../lib/business-days.ts";

const d = (iso) => new Date(iso + "T00:00:00.000Z");
const iso = (date) => date.toISOString().slice(0, 10);

test("o prazo padrão é de 5 dias úteis", () => {
  assert.equal(REVIEW_BUSINESS_DAYS, 5);
});

test("segunda + 5 úteis é a segunda seguinte", () => {
  assert.equal(iso(reviewDueDate(d("2026-09-21"))), "2026-09-28");
});

test("sexta + 5 úteis é a sexta seguinte", () => {
  assert.equal(iso(reviewDueDate(d("2026-09-18"))), "2026-09-25");
});

test("quarta + 5 úteis atravessa o fim de semana", () => {
  assert.equal(iso(reviewDueDate(d("2026-09-23"))), "2026-09-30");
});

test("partindo de sábado ou domingo, o primeiro dia útil é a segunda", () => {
  assert.equal(iso(addBusinessDays(d("2026-09-19"), 1)), "2026-09-21");
  assert.equal(iso(addBusinessDays(d("2026-09-20"), 1)), "2026-09-21");
  assert.equal(iso(reviewDueDate(d("2026-09-19"))), "2026-09-25");
  assert.equal(iso(reviewDueDate(d("2026-09-20"))), "2026-09-25");
});

test("o resultado nunca cai em fim de semana", () => {
  for (let i = 0; i < 60; i++) {
    const start = new Date(d("2026-01-01").getTime() + i * 86_400_000);
    const due = reviewDueDate(start);
    assert.ok(![0, 6].includes(due.getUTCDay()), iso(start));
    assert.equal(due.getUTCHours(), 0);
  }
});

test("zero, negativo e fracionário", () => {
  assert.equal(iso(addBusinessDays(d("2026-09-23"), 0)), "2026-09-23");
  assert.equal(iso(addBusinessDays(d("2026-09-23"), -3)), "2026-09-23");
  assert.equal(iso(addBusinessDays(d("2026-09-23"), 1.9)), "2026-09-24");
});

test("feriados não contam (Date ou texto)", () => {
  // Feriado na quarta 23/09: segunda + 5 úteis passa a vencer na terça 29/09.
  assert.equal(iso(reviewDueDate(d("2026-09-21"), ["2026-09-23"])), "2026-09-29");
  assert.equal(iso(reviewDueDate(d("2026-09-21"), [d("2026-09-23")])), "2026-09-29");
  // Feriado em fim de semana não muda nada.
  assert.equal(iso(reviewDueDate(d("2026-09-21"), ["2026-09-26"])), "2026-09-28");
});

test("não altera a data recebida", () => {
  const start = d("2026-09-21");
  reviewDueDate(start);
  assert.equal(iso(start), "2026-09-21");
});

test("instante com hora usa o dia de Brasília, não o dia UTC", () => {
  // Segunda 22h em Brasília = terça 01h UTC: o dia de calendário ainda é segunda.
  assert.equal(iso(calendarDay(new Date("2026-09-22T01:00:00.000Z"))), "2026-09-21");
  assert.equal(iso(reviewDueDate(new Date("2026-09-22T01:00:00.000Z"))), "2026-09-28");
  // Meia-noite UTC vinda de campo de data é o próprio dia.
  assert.equal(iso(calendarDay(d("2026-09-22"))), "2026-09-22");
});
