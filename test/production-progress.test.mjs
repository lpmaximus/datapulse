import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveProgress,
  isProgressStale,
  parseProgress,
  progressAgeLabel,
  weightedProduction,
} from "../lib/documents.ts";

test("avanço à mão vai de 0 a 99; 100 é automático", () => {
  assert.deepEqual(parseProgress("40"), { value: 40 });
  assert.deepEqual(parseProgress("0"), { value: 0 });
  assert.deepEqual(parseProgress("99,4"), { value: 99 });
  assert.ok("error" in parseProgress("100"));
  assert.ok("error" in parseProgress("-5"));
  assert.ok("error" in parseProgress(""));
  assert.ok("error" in parseProgress("abc"));
});

test("fora da produção a revisão vale 100; cancelada vale 0", () => {
  assert.equal(effectiveProgress({ status: "DRAFT", milestone: null, productionProgress: 40 }), 40);
  assert.equal(effectiveProgress({ status: "DRAFT", milestone: null }), 0);
  assert.equal(effectiveProgress({ status: "DRAFT", milestone: { id: "p" }, productionProgress: 10 }), 100);
  assert.equal(effectiveProgress({ status: "IN_REVIEW", milestone: { id: "p" }, productionProgress: 100 }), 100);
  assert.equal(effectiveProgress({ status: "CANCELLED", milestone: null, productionProgress: 50 }), 0);
});

test("idade e número velho", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  assert.equal(progressAgeLabel(null, now), "nunca atualizado");
  assert.equal(progressAgeLabel(new Date("2026-11-10T08:00:00Z"), now), "atualizado hoje");
  assert.equal(progressAgeLabel(new Date("2026-11-09T08:00:00Z"), now), "atualizado há 1 dia");
  assert.equal(isProgressStale(null, now), true);
  assert.equal(isProgressStale(new Date("2026-11-05T12:00:00Z"), now), false);
  assert.equal(isProgressStale(new Date("2026-11-01T12:00:00Z"), now), true);
});

test("avanço físico ponderado pelo A1 equivalente", () => {
  const r = weightedProduction([
    // A0 a 50% = 1 A1 feito de 2
    { sheetFormat: "A0", sheetCount: 1, revision: { status: "DRAFT", milestone: null, productionProgress: 50 } },
    // A4 já em análise = 0,125 de 0,125
    { sheetFormat: "A4", sheetCount: 1, revision: { status: "IN_REVIEW", milestone: { id: "p" } } },
    // sem formato: fora da soma
    { sheetFormat: null, sheetCount: 1, revision: { status: "DRAFT", milestone: null, productionProgress: 80 } },
    // cancelado: fora da soma
    { sheetFormat: "A1", sheetCount: 1, revision: { status: "CANCELLED", milestone: null } },
  ]);
  assert.equal(r.total, 2.125);
  assert.equal(r.done, 1.125);
  assert.equal(r.percent, 53);
  assert.equal(r.missing, 1);
  assert.equal(weightedProduction([]).percent, null);
});
