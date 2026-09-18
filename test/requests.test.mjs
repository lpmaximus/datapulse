import { test } from "node:test";
import assert from "node:assert/strict";
import { isRequestOpen, isRequestOverdue, daysOpen } from "../lib/requests.ts";

const NOW = new Date("2026-09-17T15:00:00Z");
const d = (s) => new Date(s + "T00:00:00Z");

test("solicitação atrasada = pendente com prazo antes de hoje", () => {
  assert.equal(isRequestOverdue({ status: "PENDING", dueAt: d("2026-09-10") }, NOW), true);
  assert.equal(isRequestOverdue({ status: "PENDING", dueAt: d("2026-09-17") }, NOW), false, "vence hoje não é atraso");
  assert.equal(isRequestOverdue({ status: "PENDING", dueAt: null }, NOW), false);
  assert.equal(isRequestOverdue({ status: "ANSWERED", dueAt: d("2026-09-01") }, NOW), false);
});

test("isRequestOpen só é true para pendente", () => {
  assert.equal(isRequestOpen({ status: "PENDING" }), true);
  assert.equal(isRequestOpen({ status: "ANSWERED" }), false);
  assert.equal(isRequestOpen({ status: "DISMISSED" }), false);
  assert.equal(isRequestOpen({ status: "EXPIRED" }), false);
});

test("dias em aberto conta a partir da criação, nunca negativo", () => {
  assert.equal(daysOpen({ dueAt: null, createdAt: d("2026-09-10") }, NOW), 7);
  assert.equal(daysOpen({ dueAt: null, createdAt: d("2026-09-17") }, NOW), 0);
  assert.equal(daysOpen({ dueAt: null, createdAt: d("2026-09-20") }, NOW), 0, "criada no futuro não fica negativa");
});
