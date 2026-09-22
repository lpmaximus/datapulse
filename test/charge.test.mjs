import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChargeEmail, buildChargeMailto } from "../lib/charge.ts";

const base = {
  to: "bfavrin@iemebrasil.com.br",
  assigneeName: "Beatriz Terumi",
  senderName: "Luiz Paulo",
  task: {
    taskName: "Memorial de cálculo HVAC",
    projectName: "Pátio Sul",
    due: new Date("2026-09-10T00:00:00Z"),
    statusLabel: "Em andamento",
    progress: 60,
    late: true,
  },
};

test("cobrança atrasada marca assunto e prazo vencido", () => {
  const { subject, body } = buildChargeEmail(base);
  assert.equal(subject, "[ATRASADA] Pátio Sul — Memorial de cálculo HVAC");
  assert.match(body, /^Olá, Beatriz,/);
  assert.match(body, /Prazo: 10\/09\/2026 \(vencido\)/);
  assert.match(body, /Em andamento · 60% concluído/);
});

test("cobrança em dia e marco sem avanço/prazo", () => {
  const { subject, body } = buildChargeEmail({
    ...base,
    task: { ...base.task, late: false, progress: null, due: null },
  });
  assert.equal(subject, "Pátio Sul — Memorial de cálculo HVAC");
  assert.match(body, /Prazo: a definir\n/);
  assert.doesNotMatch(body, /%/);
});

test("mailto usa CRLF e mantém o destinatário legível", () => {
  const url = buildChargeMailto(base);
  assert.ok(url.startsWith("mailto:bfavrin@iemebrasil.com.br?subject="));
  assert.ok(url.includes("%0D%0A"));
  assert.ok(!/%0A(?<!%0D%0A)/.test(url.replace(/%0D%0A/g, "")));
});
