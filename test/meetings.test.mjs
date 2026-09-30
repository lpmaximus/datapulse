import { test } from "node:test";
import assert from "node:assert/strict";
import { topicsToCarryOver, isTopicClosed } from "../lib/meetings.ts";

const base = { category: "ENGENHARIA", title: null, date: null, responsible: null, dueDate: null };

test("acompanhamento leva só o que está em aberto, na ordem", () => {
  const out = topicsToCarryOver([
    { ...base, id: "b", order: 1, description: "B", status: "PENDENTE" },
    { ...base, id: "a", order: 0, description: "A", status: "INFORMATIVO" },
    { ...base, id: "c", order: 2, description: "C", status: "CONCLUÍDO" },
    { ...base, id: "d", order: 3, description: "D", status: "CANCELADO" },
  ]);
  assert.deepEqual(out.map((t) => t.description), ["A", "B"]);
  assert.deepEqual(out.map((t) => t.sourceTopicId), ["a", "b"]);
});

test("item já acompanhado mantém a origem da primeira ata", () => {
  const [t] = topicsToCarryOver([{ ...base, id: "x2", description: "X", status: "PENDENTE", sourceTopicId: "x1" }]);
  assert.equal(t.sourceTopicId, "x1");
});

test("status encerrados", () => {
  assert.equal(isTopicClosed("CONCLUÍDO"), true);
  assert.equal(isTopicClosed("concluido"), true);
  assert.equal(isTopicClosed("CANCELADO"), true);
  assert.equal(isTopicClosed("PENDENTE"), false);
});
