import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMaster,
  toDate,
  titleCase,
  emailFor,
  normalizeName,
} from "../lib/parse-master.ts";

/** Monta uma linha esparsa: { índice: valor }. */
function row(cells) {
  const out = new Array(32).fill(null);
  for (const [i, v] of Object.entries(cells)) out[Number(i)] = v;
  return out;
}

const ANEXO = [
  [],
  [],
  [],
  row({ 4: "MRS001-CON25", 5: "VIADUTO A", 6: "43029-001", 7: "EGIS", 19: "APR", 20: "APROVADO", 26: "LUIZ PAULO", 28: "MET", 29: "METÁLICA" }),
  row({ 19: "REJ", 20: "REJEITADO", 26: "ANDERSON MANSO", 28: "ECO", 29: "ESTRUTURA CONCRETO" }),
  row({ 19: "COM", 20: "COMENTADO" }),
  row({ 19: "CLD", 20: "CANCELADO" }),
];

/** Uma linha de lançamento da aba BANCO DADOS. */
function lancamento({ doc, rev, analise = null, inicio, prazo, solucao = null, analista = "LUIZ PAULO", obs = null }) {
  return row({
    1: analise ? "NÃO" : "SIM",
    3: inicio,
    5: "MRS001-CON25",
    6: "VIADUTO A",
    7: doc,
    8: rev,
    9: "MET",
    10: "METÁLICA",
    11: analista,
    12: analise,
    13: prazo,
    15: solucao,
    16: obs,
  });
}

const D = (iso) => new Date(iso);
const banco = (...linhas) => [[], [], [], [], ...linhas];

test("cadastros saem do ANEXO", () => {
  const plan = parseMaster(banco(), ANEXO);
  assert.deepEqual(plan.analysisCodes.map((c) => c.tag), ["APR", "REJ", "COM", "CLD"]);
  assert.equal(plan.analysisCodes[0].effect, "APPROVES");
  assert.deepEqual(plan.disciplines.map((d) => d.tag), ["MET", "ECO"]);
  assert.deepEqual(plan.people.map((p) => p.email), [
    "luiz.paulo@mrs.local",
    "anderson.manso@mrs.local",
  ]);
  assert.deepEqual(plan.designFirms, ["EGIS"]);
  assert.equal(plan.projects[0].serviceOrder, "43029-001");
});

test("sem parecer a revisão fica em análise", () => {
  const plan = parseMaster(
    banco(lancamento({ doc: "A-PE-DE-MET-001.dwg", rev: "V1", inicio: D("2026-05-04") , prazo: D("2026-05-11") })),
    ANEXO,
  );
  const [rev] = plan.documents[0].revisions;
  assert.equal(rev.status, "IN_REVIEW");
  assert.equal(plan.stats.open, 1);
});

test("aprovada e sucedida vira substituída; comentada preserva o desfecho", () => {
  const plan = parseMaster(
    banco(
      lancamento({ doc: "A-PE-DE-MET-001.dwg", rev: "V1", analise: "APROVADO", inicio: D("2026-05-04"), prazo: D("2026-05-11"), solucao: D("2026-05-10") }),
      lancamento({ doc: "A-PE-DE-MET-001.dwg", rev: "V2", analise: "COMENTADO", inicio: D("2026-06-01"), prazo: D("2026-06-08"), solucao: D("2026-06-07") }),
      lancamento({ doc: "A-PE-DE-MET-001.dwg", rev: "V3", analise: "APROVADO", inicio: D("2026-07-01"), prazo: D("2026-07-08"), solucao: D("2026-07-05") }),
    ),
    ANEXO,
  );
  const [doc] = plan.documents;
  assert.deepEqual(doc.revisions.map((r) => r.status), ["SUPERSEDED", "COMMENTED", "APPROVED"]);
  assert.deepEqual(doc.revisions.map((r) => r.sequence), [0, 1, 2]);
});

test("a mesma revisão analisada duas vezes vira dois ciclos, não dois documentos", () => {
  const plan = parseMaster(
    banco(
      lancamento({ doc: "A-PE-DE-MET-001.dwg", rev: "V1", analise: "REJEITADO", inicio: D("2026-05-14"), prazo: D("2026-05-21"), solucao: D("2026-07-16") }),
      lancamento({ doc: "A-PE-DE-MET-001.dwg", rev: "V1", analise: "COMENTADO", inicio: D("2026-08-14"), prazo: D("2026-08-21"), solucao: D("2026-08-18") }),
    ),
    ANEXO,
  );
  assert.equal(plan.documents.length, 1);
  const [rev] = plan.documents[0].revisions;
  assert.equal(rev.rounds.length, 2);
  assert.equal(rev.status, "COMMENTED", "vale o último parecer");
  assert.equal(rev.issuedAt.toISOString().slice(0, 10), "2026-05-14", "o envio é o do primeiro ciclo");
  assert.ok(plan.warnings.some((w) => w.includes("2 ciclos")));
});

test("linha idêntica repetida é digitação em duplicidade", () => {
  const linha = () => lancamento({ doc: "A-PE-DE-MET-001.dwg", rev: "V1", analise: "COMENTADO", inicio: D("2026-05-14"), prazo: D("2026-05-21"), solucao: D("2026-05-20") });
  const plan = parseMaster(banco(linha(), linha()), ANEXO);
  assert.equal(plan.documents[0].revisions[0].rounds.length, 1);
  assert.ok(plan.warnings.some((w) => w.includes("repetição exata")));
});

test("arquivos diferentes do mesmo código são documentos diferentes", () => {
  const plan = parseMaster(
    banco(
      lancamento({ doc: "A-PE-DE-MET-001.dwg", rev: "V1", analise: "APROVADO", inicio: D("2026-05-04"), prazo: D("2026-05-11"), solucao: D("2026-05-10") }),
      lancamento({ doc: "A-PE-DE-MET-001.pdf", rev: "V1", analise: "REJEITADO", inicio: D("2026-05-04"), prazo: D("2026-05-11"), solucao: D("2026-05-10") }),
    ),
    ANEXO,
  );
  assert.equal(plan.documents.length, 2, "o .pdf tem trâmite próprio");
  assert.deepEqual([...new Set(plan.documents.map((d) => d.number))], ["A-PE-DE-MET-001"]);
  assert.equal(plan.documents[0].type, "DE");
});

test("projeto fora do ANEXO entra pelo lançamento, com aviso", () => {
  const linha = lancamento({ doc: "B-PE-DE-MET-001.dwg", rev: "V1", inicio: D("2026-05-04"), prazo: D("2026-05-11") });
  linha[5] = "MRS999-CON26";
  linha[6] = "PROJETO NOVO";
  const plan = parseMaster(banco(linha), ANEXO);
  const novo = plan.projects.find((p) => p.os === "MRS999-CON26");
  assert.equal(novo.name, "PROJETO NOVO");
  assert.ok(plan.warnings.some((w) => w.includes("MRS999-CON26")));
});

test("datas aceitam Date, serial do Excel e dd/mm/aaaa", () => {
  assert.equal(toDate(new Date("2026-05-04T00:00:00Z")).toISOString().slice(0, 10), "2026-05-04");
  assert.equal(toDate(46146).toISOString().slice(0, 10), "2026-05-04");
  assert.equal(toDate("04/05/2026").toISOString().slice(0, 10), "2026-05-04");
  assert.equal(toDate(""), null);
  assert.equal(toDate(null), null);
});

test("nomes viram rótulo legível e e-mail estável", () => {
  assert.equal(titleCase("MARCIO ANGELINO"), "Marcio Angelino");
  assert.equal(titleCase("MARIA DE OLIVEIRA"), "Maria de Oliveira");
  assert.equal(emailFor("MARIA OLIVEIRA (MALU)", "mrs.local"), "maria.oliveira@mrs.local");
  assert.equal(normalizeName(" José  da Silva "), "JOSE DA SILVA");
});
