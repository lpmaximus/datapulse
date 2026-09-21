import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canReceiveAnalysis,
  currentAnalystId,
  checkRequestDelegation,
  checkRespondDelegation,
  checkWithdrawDelegation,
} from "../lib/delegation.ts";
import { statusAfter, ACTION_LABEL } from "../lib/documents.ts";

const okRequest = {
  userId: "ana",
  revisionStatus: "IN_REVIEW",
  analystId: "ana",
  toUserId: "bia",
  toUserEligible: true,
  hasPending: false,
};

test("só ADMIN, MANAGER e SPECIALIST recebem análise", () => {
  for (const r of ["ADMIN", "MANAGER", "SPECIALIST"]) assert.equal(canReceiveAnalysis(r), true);
  assert.equal(canReceiveAnalysis("EXECUTIVE"), false);
});

test("o analista da vez é o designado; sem designado, o responsável", () => {
  assert.equal(currentAnalystId({ specialistId: "s", responsibleId: "r" }), "s");
  assert.equal(currentAnalystId({ specialistId: null, responsibleId: "r" }), "r");
  assert.equal(currentAnalystId({ specialistId: null, responsibleId: null }), null);
});

test("pedido válido não tem erro", () => {
  assert.equal(checkRequestDelegation(okRequest), null);
});

test("pedido: revisão precisa estar em análise", () => {
  for (const st of ["DRAFT", "APPROVED", "COMMENTED", "REJECTED", "SUPERSEDED", "CANCELLED"]) {
    assert.match(checkRequestDelegation({ ...okRequest, revisionStatus: st }), /em análise/);
  }
});

test("pedido: só o analista da vez delega", () => {
  assert.match(checkRequestDelegation({ ...okRequest, analystId: "carla" }), /com a análise/);
  assert.match(checkRequestDelegation({ ...okRequest, analystId: null }), /com a análise/);
});

test("pedido: destinatário válido, diferente de si e elegível", () => {
  assert.match(checkRequestDelegation({ ...okRequest, toUserId: "" }), /Escolha o especialista/);
  assert.match(checkRequestDelegation({ ...okRequest, toUserId: "ana" }), /outra pessoa/);
  assert.match(checkRequestDelegation({ ...okRequest, toUserEligible: false }), /não pode receber/);
});

test("pedido: uma delegação pendente por vez", () => {
  assert.match(checkRequestDelegation({ ...okRequest, hasPending: true }), /pendente/);
});

const okRespond = {
  userId: "bia",
  decision: "accept",
  comment: "",
  delegation: { status: "PENDING", toUserId: "bia", fromUserId: "ana" },
  revisionStatus: "IN_REVIEW",
  analystId: "ana",
};

test("resposta válida (aceitar sem comentário)", () => {
  assert.equal(checkRespondDelegation(okRespond), null);
});

test("resposta: só o destinatário, só pendente, só em análise", () => {
  assert.match(checkRespondDelegation({ ...okRespond, userId: "carla" }), /destinatário/);
  assert.match(
    checkRespondDelegation({ ...okRespond, delegation: { ...okRespond.delegation, status: "ACCEPTED" } }),
    /já foi respondida/,
  );
  assert.match(checkRespondDelegation({ ...okRespond, revisionStatus: "APPROVED" }), /não está mais em análise/);
});

test("resposta: análise que mudou de mãos invalida o pedido", () => {
  assert.match(checkRespondDelegation({ ...okRespond, analystId: "carla" }), /mudou de mãos/);
});

test("recusar exige motivo; aceitar não", () => {
  assert.match(checkRespondDelegation({ ...okRespond, decision: "decline", comment: "  " }), /motivo/);
  assert.equal(checkRespondDelegation({ ...okRespond, decision: "decline", comment: "Sem agenda" }), null);
});

test("retirar: só quem pediu e só pendente", () => {
  const d = { status: "PENDING", fromUserId: "ana" };
  assert.equal(checkWithdrawDelegation({ userId: "ana", delegation: d }), null);
  assert.match(checkWithdrawDelegation({ userId: "bia", delegation: d }), /quem pediu/);
  assert.match(checkWithdrawDelegation({ userId: "ana", delegation: { ...d, status: "DECLINED" } }), /já foi respondida/);
});

test("eventos de delegação não mudam o status da revisão", () => {
  for (const a of ["DELEGATION_REQUESTED", "DELEGATION_ACCEPTED", "DELEGATION_DECLINED", "DELEGATION_CANCELLED"]) {
    assert.equal(statusAfter(a), "IN_REVIEW");
    assert.ok(ACTION_LABEL[a]);
  }
});
