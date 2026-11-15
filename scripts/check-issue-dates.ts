/**
 * Confere as datas do trâmite das revisões JÁ CADASTRADAS (o passivo).
 *
 * Duas conferências:
 *
 * 1. EMISSÃO contra a data do pacote em que a revisão foi enviada.
 *
 * O pacote é a emissão ao contratante e tem a sua data inicial ("ENVIO
 * 18102026" começa em 18/10). Até a correção desta rodada, a revisão que
 * entrava num pacote sem data digitada ficava com o instante do CADASTRO —
 * que costuma ser dias depois, quando o documento já tinha sido entregue.
 * Resultado: rastreamento e Boletim de Medição com a data errada.
 *
 * 2. RETORNO da análise, quando ele também é a data do cadastro. Na prática
 *    da projetista o cliente devolve comentado e a revisão seguinte sai no
 *    mesmo dia (D+0), então a emissão da sucessora é a data do retorno. Vale
 *    só para o passivo — a revisão mais nova (sem sucessora) nunca é tocada,
 *    e documento novo grava a data real no momento de cada evento.
 *
 * Uso:
 *   npx tsx scripts/check-issue-dates.ts --dry    # só lista as divergências
 *   npx tsx scripts/check-issue-dates.ts          # corrige
 *
 * O que a correção faz, por revisão divergente:
 *   - grava a data do pacote em `issuedAt`;
 *   - move o primeiro evento SUBMITTED para essa data (as Passagens passam a
 *     mostrar o envio real) e recua para antes dele os eventos de cadastro
 *     que ficarem depois;
 *   - registra a correção em `IssueDateChange`, como a feita pela tela.
 *
 * Não toca em: revisão sem pacote (ainda em produção), pacote sem data
 * inicial, revisão cuja data do pacote cairia depois do parecer já dado
 * (essas aparecem como "conferir à mão"), e nada que já esteja certo.
 * Idempotente: rodar de novo não muda mais nada.
 */
import { PrismaClient } from "@prisma/client";
import { daysBetween, inferredReturnDate, isOutcomeAction, type DocumentAction } from "../lib/documents";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const br = (d: Date | null) => {
  if (!d) return "sem data";
  const [y, m, dd] = day(d).split("-");
  return `${dd}/${m}/${y}`;
};

/** Meio-dia de Brasília do dia do pacote — mesma convenção do trâmite. */
function issueInstant(packageStart: Date): Date {
  return new Date(`${day(packageStart)}T15:00:00.000Z`);
}

const REGISTRATION = ["CREATED", "REVISED"];
const REASON = "Correção automática das datas do trâmite";

async function main() {
  const revisions = await prisma.documentRevision.findMany({
    where: { milestone: { isNot: null } },
    orderBy: [{ documentId: "asc" }, { sequence: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      issuedAt: true,
      analyzedAt: true,
      documentId: true,
      sequence: true,
      document: {
        select: { number: true, name: true, project: { select: { name: true } } },
      },
      milestone: { select: { name: true, startDate: true } },
      transitions: { orderBy: { createdAt: "asc" }, select: { id: true, action: true, createdAt: true } },
    },
  });

  const toFix: { id: string; at: Date; from: Date | null; label: string; transitionId: string | null; backdated: string[] }[] = [];
  const manual: string[] = [];
  let ok = 0;
  let noDate = 0;

  for (const r of revisions) {
    const start = r.milestone?.startDate ?? null;
    const label = `${r.document.project.name} · ${r.document.number ?? r.document.name} ${r.name} (pacote ${r.milestone?.name})`;
    if (!start) {
      noDate += 1;
      continue;
    }
    const at = issueInstant(start);
    if (r.issuedAt && day(r.issuedAt) === day(start)) {
      ok += 1;
      continue;
    }
    // Parecer anterior à data do pacote: alguma das duas está errada, e não
    // dá para saber qual daqui.
    if (r.analyzedAt && at.getTime() > r.analyzedAt.getTime()) {
      manual.push(`${label}: pacote ${br(start)} é depois do parecer ${br(r.analyzedAt)}`);
      continue;
    }
    const submitted = r.transitions.find((t) => t.action === "SUBMITTED") ?? null;
    toFix.push({
      id: r.id,
      at,
      from: r.issuedAt,
      label: `${label}: ${br(r.issuedAt)} → ${br(start)}`,
      transitionId: submitted?.id ?? null,
      backdated: r.transitions
        .filter((t) => REGISTRATION.includes(t.action) && t.createdAt.getTime() >= at.getTime())
        .map((t) => t.id),
    });
  }

  console.log(`${revisions.length} revisão(ões) em pacote.`);
  console.log(`  ${ok} com a data certa`);
  console.log(`  ${noDate} em pacote sem data inicial (cadastre a data do pacote)`);
  console.log(`  ${manual.length} para conferir à mão`);
  console.log(`  ${toFix.length} a corrigir`);
  console.log("");
  for (const m of manual) console.log(`  [à mão] ${m}`);
  for (const f of toFix) console.log(`  ${f.label}`);

  /* ------------------------- 2. datas de retorno ------------------------- */
  // Emissão já corrigida de cada revisão (a gravada, ou a que será gravada).
  const issuedAfterFix = new Map<string, Date | null>();
  for (const r of revisions) issuedAfterFix.set(r.id, r.issuedAt);
  for (const f of toFix) issuedAfterFix.set(f.id, f.at);

  const bySequence = new Map<string, typeof revisions>();
  for (const r of revisions) {
    const list = bySequence.get(r.documentId) ?? [];
    list.push(r);
    bySequence.set(r.documentId, list);
  }

  const returns: { id: string; at: Date; from: Date | null; label: string; transitionId: string | null; issuedAt: Date | null }[] = [];
  let returnsOk = 0;

  for (const r of revisions) {
    if (!r.analyzedAt) continue;
    const siblings = (bySequence.get(r.documentId) ?? []).sort((a, b) => a.sequence - b.sequence);
    const successor = siblings.find((x) => x.sequence > r.sequence) ?? null;
    const at = inferredReturnDate({
      issuedAt: issuedAfterFix.get(r.id) ?? null,
      successorIssuedAt: successor ? issuedAfterFix.get(successor.id) ?? null : null,
    });
    if (!at) continue;
    if (day(at) === day(r.analyzedAt)) {
      returnsOk += 1;
      continue;
    }
    const outcome = [...r.transitions].reverse().find((t) => isOutcomeAction(t.action as DocumentAction)) ?? null;
    returns.push({
      id: r.id,
      at,
      from: r.analyzedAt,
      issuedAt: issuedAfterFix.get(r.id) ?? null,
      label: `${r.document.project.name} · ${r.document.number ?? r.document.name} ${r.name}: retorno ${br(r.analyzedAt)} → ${br(at)} (emissão da ${successor?.name})`,
      transitionId: outcome?.id ?? null,
    });
  }

  console.log("");
  console.log(`Retornos: ${returnsOk} já batem, ${returns.length} a corrigir.`);
  for (const r of returns) console.log(`  ${r.label}`);

  if (DRY) {
    console.log("\n--dry: nada foi gravado.");
    return;
  }
  if (!toFix.length && !returns.length) return;

  for (const f of toFix) {
    const registrationAt = new Date(f.at.getTime() - 1000);
    await prisma.$transaction([
      prisma.documentRevision.update({ where: { id: f.id }, data: { issuedAt: f.at } }),
      prisma.issueDateChange.create({
        data: {
          revisionId: f.id,
          fromDate: f.from,
          toDate: f.at,
          field: "ISSUE",
          reason: REASON,
          changedByName: "scripts/check-issue-dates.ts",
        },
      }),
      ...(f.transitionId
        ? [prisma.documentTransition.update({ where: { id: f.transitionId }, data: { createdAt: f.at } })]
        : []),
      ...(f.backdated.length
        ? [
            prisma.documentTransition.updateMany({
              where: { id: { in: f.backdated } },
              data: { createdAt: registrationAt },
            }),
          ]
        : []),
    ]);
  }
  for (const r of returns) {
    await prisma.$transaction([
      prisma.documentRevision.update({ where: { id: r.id }, data: { analyzedAt: r.at } }),
      prisma.issueDateChange.create({
        data: {
          revisionId: r.id,
          field: "ANALYSIS",
          fromDate: r.from,
          toDate: r.at,
          reason: REASON,
          changedByName: "scripts/check-issue-dates.ts",
        },
      }),
      ...(r.transitionId
        ? [
            prisma.documentTransition.update({
              where: { id: r.transitionId },
              data: { createdAt: r.at, daysInPreviousStage: daysBetween(r.at, r.issuedAt) },
            }),
          ]
        : []),
    ]);
  }

  console.log(`\n${toFix.length} emissão(ões) e ${returns.length} retorno(s) corrigidos.`);
  console.log("Confira um documento na tela e, se houver BM em rascunho, reabra para as datas serem relidas.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
