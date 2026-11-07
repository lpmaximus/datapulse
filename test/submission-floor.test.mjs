import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActionDate, submissionFloor } from "../lib/documents.ts";

const now = new Date("2026-11-07T13:16:00.000Z"); // 07/11/2026 10:16 em Brasília

test("cadastro feito hoje não barra envio passado", () => {
  const floor = submissionFloor([{ action: "CREATED", createdAt: now }], null);
  assert.equal(floor, null);
  const r = resolveActionDate("2026-03-10", now, floor);
  assert.ok("at" in r);
  assert.equal(r.at.toISOString(), "2026-03-10T15:00:00.000Z");
});

test("nova revisão: o piso é o parecer da revisão anterior, não o cadastro", () => {
  const parecer = new Date("2026-04-02T15:00:00.000Z");
  const floor = submissionFloor([{ action: "REVISED", createdAt: now }], parecer);
  assert.equal(floor?.toISOString(), parecer.toISOString());
  assert.ok("error" in resolveActionDate("2026-04-01", now, floor));
  assert.ok("at" in resolveActionDate("2026-04-05", now, floor));
});

test("eventos de trâmite continuam valendo como piso", () => {
  const delegated = new Date("2026-05-01T15:00:00.000Z");
  const floor = submissionFloor(
    [
      { action: "CREATED", createdAt: now },
      { action: "DELEGATION_REQUESTED", createdAt: delegated },
    ],
    null,
  );
  assert.equal(floor?.toISOString(), delegated.toISOString());
});
