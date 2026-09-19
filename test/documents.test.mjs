import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedActions,
  isActionAllowed,
  statusAfter,
  isRevisionClosed,
  isRevisionOpen,
  isApproved,
  requiresNewRevision,
  nextRound,
  nextRevisionName,
  actionForEffect,
  applicableCodes,
  daysBetween,
  summarizeCycles,
  buildPassages,
  documentSearchFilter,
  DEFAULT_ANALYSIS_CODES,
} from "../lib/documents.ts";
import { hashPassword, verifyPassword, generateTemporaryPassword } from "../lib/password.ts";

const CODES = DEFAULT_ANALYSIS_CODES.map((c, i) => ({ id: `c${i}`, ...c }));

/* ------------------------------ fluxo ---------------------------------- */

test("revisão emitida só pode ser enviada para análise ou cancelada", () => {
  assert.deepEqual(allowedActions("DRAFT"), ["SUBMITTED", "CANCELLED"]);
  assert.equal(isActionAllowed("DRAFT", "APPROVED"), false, "não se aprova sem analisar");
});

test("em análise permite comentar, reprovar e aprovar", () => {
  assert.equal(isActionAllowed("IN_REVIEW", "COMMENTED"), true);
  assert.equal(isActionAllowed("IN_REVIEW", "REJECTED"), true);
  assert.equal(isActionAllowed("IN_REVIEW", "APPROVED"), true);
  assert.equal(isActionAllowed("IN_REVIEW", "SUBMITTED"), false, "já está em análise");
});

test("REGRA CENTRAL: revisão analisada nunca é reenviada", () => {
  // A revisão é o pacote de envio da projetista. Todo trâmite novo é uma
  // revisão nova — reenviar a mesma apagaria a contagem de idas e vindas.
  for (const status of ["APPROVED", "COMMENTED", "REJECTED", "CANCELLED", "SUPERSEDED"]) {
    assert.deepEqual(
      allowedActions(status),
      [],
      `${status} deveria ser terminal`,
    );
    assert.equal(isActionAllowed(status, "SUBMITTED"), false);
    assert.equal(isRevisionClosed(status), true);
  }
});

test("só emitida e em análise contam como revisão em curso", () => {
  assert.equal(isRevisionOpen("DRAFT"), true);
  assert.equal(isRevisionOpen("IN_REVIEW"), true);
  assert.equal(isRevisionOpen("COMMENTED"), false);
  assert.equal(isRevisionOpen("REJECTED"), false);
  assert.equal(isRevisionOpen("APPROVED"), false);
});

test("comentada e reprovada exigem nova revisão; aprovada não", () => {
  assert.equal(requiresNewRevision("COMMENTED"), true);
  assert.equal(requiresNewRevision("REJECTED"), true);
  assert.equal(requiresNewRevision("APPROVED"), false);
  assert.equal(requiresNewRevision("CANCELLED"), false);
  assert.equal(isApproved("APPROVED"), true);
  assert.equal(isApproved("COMMENTED"), false);
});

test("cada parecer leva a um status terminal próprio, sem colapsar significados", () => {
  assert.equal(statusAfter("COMMENTED"), "COMMENTED");
  assert.equal(statusAfter("REJECTED"), "REJECTED");
  assert.equal(statusAfter("APPROVED"), "APPROVED");
  assert.equal(statusAfter("APPROVED_WITH_COMMENTS"), "APPROVED");
  assert.equal(statusAfter("CANCELLED"), "CANCELLED");
  assert.equal(statusAfter("SUBMITTED"), "IN_REVIEW");
  assert.notEqual(
    statusAfter("COMMENTED"),
    statusAfter("REJECTED"),
    "comentada e reprovada são desfechos diferentes",
  );
});

test("ciclo dentro da revisão avança ao enviar para análise", () => {
  assert.equal(nextRound(0, "SUBMITTED"), 1);
  assert.equal(nextRound(1, "COMMENTED"), 1);
});

/* --------------------- códigos configuráveis --------------------------- */

test("cada efeito mapeia para a ação correspondente", () => {
  assert.equal(actionForEffect("APPROVES"), "APPROVED");
  assert.equal(actionForEffect("APPROVES_WITH_COMMENTS"), "APPROVED_WITH_COMMENTS");
  assert.equal(actionForEffect("COMMENTS"), "COMMENTED");
  assert.equal(actionForEffect("REJECTS"), "REJECTED");
  assert.equal(actionForEffect("CANCELS"), "CANCELLED");
});

test("códigos padrão do rascunho existem com o efeito certo", () => {
  const byTag = Object.fromEntries(DEFAULT_ANALYSIS_CODES.map((c) => [c.tag, c]));
  assert.equal(byTag.APR.effect, "APPROVES");
  assert.equal(byTag.REJ.effect, "REJECTS");
  assert.equal(byTag.COM.effect, "COMMENTS");
  assert.equal(byTag.CLD.effect, "CANCELS");
});

test("pareceres só são aplicáveis quando a revisão está em análise", () => {
  assert.equal(applicableCodes("IN_REVIEW", CODES).length, 4);
  assert.equal(applicableCodes("DRAFT", CODES).length, 0);
  assert.equal(applicableCodes("APPROVED", CODES).length, 0);
});

test("um código customizado do cliente funciona pelo efeito, não pela sigla", () => {
  const custom = [{ id: "x", tag: "APR-R", name: "Aprovado com ressalva", effect: "APPROVES_WITH_COMMENTS" }];
  const aplicaveis = applicableCodes("IN_REVIEW", custom);
  assert.equal(aplicaveis.length, 1);
  assert.equal(statusAfter(actionForEffect(aplicaveis[0].effect)), "APPROVED");
});

/* ------------------------- nome da revisão ----------------------------- */

test("sugere a próxima revisão preservando o padrão", () => {
  assert.equal(nextRevisionName(null), "R00");
  assert.equal(nextRevisionName("R00"), "R01");
  assert.equal(nextRevisionName("R09"), "R10");
  assert.equal(nextRevisionName("R99"), "R100");
  assert.equal(nextRevisionName("0"), "1");
  assert.equal(nextRevisionName("A"), "B");
  assert.equal(nextRevisionName("REV-01"), "REV-02");
});

test("padrão desconhecido não quebra a sugestão", () => {
  assert.equal(nextRevisionName("versão final"), "versão final-1");
});

/* ------------------- ciclo completo do documento ----------------------- */

test("documento percorre três revisões até a aprovação final", () => {
  // Cada trâmite é uma revisão nova; o histórico da análise É a sequência.
  const desfechos = [];
  let nome = "R00";

  for (const parecer of ["COMMENTED", "REJECTED", "APPROVED"]) {
    let status = "DRAFT";

    assert.equal(isActionAllowed(status, "SUBMITTED"), true);
    status = statusAfter("SUBMITTED");
    assert.equal(status, "IN_REVIEW");

    assert.equal(isActionAllowed(status, parecer), true);
    status = statusAfter(parecer);

    desfechos.push({ nome, status });

    // Revisão analisada é terminal: o próximo passo é outra revisão.
    assert.equal(isRevisionClosed(status), true);
    nome = nextRevisionName(nome);
  }

  assert.deepEqual(desfechos, [
    { nome: "R00", status: "COMMENTED" },
    { nome: "R01", status: "REJECTED" },
    { nome: "R02", status: "APPROVED" },
  ]);

  const retrabalho = desfechos.filter((d) => requiresNewRevision(d.status)).length;
  assert.equal(retrabalho, 2, "duas devoluções antes de aprovar");
  assert.equal(nome, "R03", "próxima revisão sugerida, caso haja");
});

test("não se emite nova revisão com outra em curso", () => {
  assert.equal(isRevisionOpen("IN_REVIEW"), true, "bloqueia enquanto analisa");
  assert.equal(isRevisionOpen("DRAFT"), true, "bloqueia enquanto não enviou");
  assert.equal(isRevisionOpen("COMMENTED"), false, "liberado após desfecho");
});

/* ---------------------------- métricas --------------------------------- */

test("dias entre datas nunca é negativo", () => {
  const now = new Date("2026-08-18T12:00:00Z");
  assert.equal(daysBetween(now, new Date("2026-08-08T12:00:00Z")), 10);
  assert.equal(daysBetween(now, new Date("2026-08-20T12:00:00Z")), 0);
  assert.equal(daysBetween(now, null), null);
});

test("resumo conta retrabalho e dias em análise", () => {
  const s = summarizeCycles([
    { action: "CREATED", round: 0, daysInPreviousStage: null },
    { action: "SUBMITTED", round: 1, daysInPreviousStage: 2 },
    { action: "COMMENTED", round: 1, daysInPreviousStage: 12 },
    { action: "SUBMITTED", round: 2, daysInPreviousStage: 5 },
    { action: "REJECTED", round: 2, daysInPreviousStage: 20 },
    { action: "SUBMITTED", round: 3, daysInPreviousStage: 1 },
    { action: "APPROVED", round: 3, daysInPreviousStage: 8 },
  ]);
  assert.equal(s.rounds, 3);
  assert.equal(s.reworkCount, 2);
  assert.equal(s.totalDaysInReview, 40);
});

test("histórico vazio não quebra o resumo", () => {
  assert.deepEqual(summarizeCycles([]), {
    rounds: 0,
    totalDaysInReview: 0,
    reworkCount: 0,
  });
});

/* ----------------------------- senhas ---------------------------------- */

test("senha correta valida e senha errada não", async () => {
  const hash = await hashPassword("senha-de-teste-123");
  assert.equal(await verifyPassword("senha-de-teste-123", hash), true);
  assert.equal(await verifyPassword("senha-errada-123", hash), false);
});

test("mesma senha gera hashes diferentes (salt aleatório)", async () => {
  const a = await hashPassword("mesma-senha-123");
  const b = await hashPassword("mesma-senha-123");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("mesma-senha-123", a), true);
});

test("hash carrega os parâmetros para permitir endurecer o custo depois", async () => {
  const [algo, N, r, p] = (await hashPassword("qualquer-senha-123")).split("$");
  assert.equal(algo, "scrypt");
  assert.equal(Number(N), 16384);
  assert.equal(Number(r), 8);
  assert.equal(Number(p), 1);
});

test("senha curta é recusada na origem", async () => {
  await assert.rejects(() => hashPassword("curta"), /ao menos 8/);
});

test("hash corrompido devolve false em vez de estourar", async () => {
  assert.equal(await verifyPassword("x", "lixo"), false);
  assert.equal(await verifyPassword("x", ""), false);
  assert.equal(await verifyPassword("x", "scrypt$a$b$c$d$e"), false);
});

test("senha provisória evita caracteres ambíguos", () => {
  for (let i = 0; i < 30; i += 1) {
    const pwd = generateTemporaryPassword();
    assert.equal(pwd.length, 12);
    assert.ok(!/[O0l1I]/.test(pwd), `caractere ambíguo em "${pwd}"`);
  }
});

/* --------------------------- busca documental --------------------------- */

test("busca vazia não filtra nada", () => {
  assert.deepEqual(documentSearchFilter(undefined), {});
  assert.deepEqual(documentSearchFilter("   "), {}, "espaço em branco não é busca");
});

test("busca cobre número, nome, tipo e disciplina", () => {
  const { OR } = documentSearchFilter("ele");
  const campos = OR.map((c) => Object.keys(c)[0]);
  assert.deepEqual(campos, ["number", "name", "type", "discipline", "discipline"]);
  assert.deepEqual(OR[0].number, { contains: "ele", mode: "insensitive" });
  assert.deepEqual(OR[3].discipline, { tag: { contains: "ele", mode: "insensitive" } });
});

test("projeto só entra na busca da visão geral", () => {
  assert.ok(!documentSearchFilter("x").OR.some((c) => "project" in c));
  assert.ok(documentSearchFilter("x", true).OR.some((c) => "project" in c));
});


/* ----------------------------- passagens -------------------------------- */

const D = (iso) => new Date(iso + "T12:00:00.000Z");
let seq = 0;
const ev = (action, iso, revId, revName, round, extra = {}) => ({
  id: `t${++seq}`,
  action,
  round,
  analysisCodeTag: null,
  actorName: null,
  assignedToName: null,
  comment: null,
  dueAt: null,
  createdAt: D(iso),
  revision: { id: revId, name: revName },
  ...extra,
});

test("passagens: cada envio abre uma e o desfecho a fecha", () => {
  const passages = buildPassages(
    [
      ev("CREATED", "2026-01-01", "r0", "R00", 0),
      ev("SUBMITTED", "2026-01-05", "r0", "R00", 1, { assignedToName: "Ana", dueAt: D("2026-01-15") }),
      ev("COMMENTED", "2026-01-13", "r0", "R00", 1, { analysisCodeTag: "COM", comment: "Ajustar carga" }),
      ev("REVISED", "2026-01-20", "r1", "R01", 0),
      ev("SUBMITTED", "2026-02-01", "r1", "R01", 1, { assignedToName: "Bruno" }),
      ev("APPROVED", "2026-02-10", "r1", "R01", 1, { analysisCodeTag: "APR" }),
    ],
    D("2026-03-01"),
  );

  assert.equal(passages.length, 2);
  assert.deepEqual(
    passages.map((p) => [p.number, p.revisionName, p.outcome, p.days, p.open]),
    [
      [1, "R00", "COMMENTED", 8, false],
      [2, "R01", "APPROVED", 9, false],
    ],
  );
  assert.equal(passages[0].analyst, "Ana");
  assert.equal(passages[0].returnComment, "Ajustar carga");
  assert.equal(passages[1].analysisTag, "APR");
});

test("passagens: envio sem desfecho é a que está em análise, contando até agora", () => {
  const [p] = buildPassages(
    [ev("SUBMITTED", "2026-02-01", "r0", "R00", 1, { assignedToName: "Ana" })],
    D("2026-02-11"),
  );
  assert.equal(p.open, true);
  assert.equal(p.outcome, null);
  assert.equal(p.returnedAt, null);
  assert.equal(p.days, 10);
});

test("passagens: a mesma revisão analisada mais de uma vez gera uma passagem por envio (carga da planilha)", () => {
  const passages = buildPassages(
    [
      ev("SUBMITTED", "2026-01-05", "r0", "R00", 1),
      ev("REJECTED", "2026-01-09", "r0", "R00", 1, { analysisCodeTag: "REJ" }),
      ev("SUBMITTED", "2026-01-20", "r0", "R00", 2),
      ev("APPROVED", "2026-01-22", "r0", "R00", 2, { analysisCodeTag: "APR" }),
    ],
    D("2026-03-01"),
  );
  assert.deepEqual(
    passages.map((p) => [p.number, p.round, p.outcome]),
    [
      [1, 1, "REJECTED"],
      [2, 2, "APPROVED"],
    ],
  );
});

test("passagens: eventos fora de ordem são lidos em ordem cronológica e cancelar antes de enviar não cria passagem", () => {
  const passages = buildPassages(
    [
      ev("APPROVED", "2026-02-10", "r1", "R01", 1),
      ev("SUBMITTED", "2026-02-01", "r1", "R01", 1),
      ev("CANCELLED", "2026-03-01", "r2", "R02", 0),
    ],
    D("2026-03-05"),
  );
  assert.equal(passages.length, 1);
  assert.equal(passages[0].outcome, "APPROVED");
  assert.equal(buildPassages([], D("2026-03-05")).length, 0);
});
