import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActionDate, localDay } from "../lib/documents.ts";

// 05/11/2026 13:10 em Brasília
const now = new Date("2026-11-05T16:10:00.000Z");

test("vazia ou hoje: instante atual", () => {
  assert.equal(resolveActionDate("", now, null).at, now);
  assert.equal(resolveActionDate("2026-11-05", now, null).at, now);
});

test("hoje no fuso de Brasília mesmo com UTC já no dia seguinte", () => {
  const late = new Date("2026-11-06T01:30:00.000Z"); // 05/11 22:30 BRT
  assert.equal(resolveActionDate("2026-11-05", late, null).at, late);
  assert.ok("error" in resolveActionDate("2026-11-06", late, null));
});

test("dia passado: meio-dia de Brasília", () => {
  const r = resolveActionDate("2026-11-03", now, null);
  assert.equal(r.at.toISOString(), "2026-11-03T15:00:00.000Z");
  assert.equal(localDay(r.at), "2026-11-03");
});

test("futura e inválida recusadas", () => {
  assert.ok("error" in resolveActionDate("2026-11-06", now, null));
  assert.ok("error" in resolveActionDate("2026-02-30", now, null));
  assert.ok("error" in resolveActionDate("abc", now, null));
});

test("antes do evento anterior recusada", () => {
  const floor = new Date("2026-11-02T13:00:00.000Z");
  const r = resolveActionDate("2026-11-01", now, floor, "o envio");
  assert.match(r.error, /anterior a o envio \(02\/11\/2026\)/);
});

test("mesmo dia do evento anterior nunca fica antes dele", () => {
  const floor = new Date("2026-11-02T19:00:00.000Z"); // 16:00 BRT
  const r = resolveActionDate("2026-11-02", now, floor);
  assert.ok(r.at.getTime() > floor.getTime());
  assert.equal(localDay(r.at), "2026-11-02");
});
