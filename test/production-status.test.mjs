import { test } from "node:test";
import assert from "node:assert/strict";
import { isInProduction, revisionStatusLabel } from "../lib/documents.ts";

test("rascunho sem pacote está em produção", () => {
  assert.equal(isInProduction({ status: "DRAFT", milestone: null }), true);
  assert.equal(isInProduction({ status: "DRAFT", milestoneId: null }), true);
  assert.equal(revisionStatusLabel("DRAFT", true), "Em produção");
});

test("rascunho com pacote continua Emitida", () => {
  assert.equal(isInProduction({ status: "DRAFT", milestone: { id: "p1" } }), false);
  assert.equal(isInProduction({ status: "DRAFT", milestoneId: "p1" }), false);
  assert.equal(revisionStatusLabel("DRAFT", false), "Emitida");
});

test("fora do rascunho nunca é produção", () => {
  assert.equal(isInProduction({ status: "IN_REVIEW", milestone: null }), false);
  assert.equal(revisionStatusLabel("IN_REVIEW", true), "Em análise");
});
