/**
 * Tradução dos extratos do ACC para sinais do DataPulse.
 *
 * Módulo puro (sem Prisma, sem rede) para ser testável isoladamente, igual ao
 * parser de planilha.
 *
 * O que o ACC entrega e o que fazemos com isso:
 * - `cost_budgets.csv`   → custo previsto vs. realizado por item de orçamento.
 * - `issues_issues.csv`  → contagem de issues abertas, agrupada por projeto.
 *
 * O que o ACC NÃO entrega: datas planejadas/reais de cronograma. Não existe
 * service group de schedule na Data Connector API. O componente de prazo do
 * DRI (peso 0,45) continua vindo da planilha — por isso os sinais do ACC são
 * gravados sem sobrescrever datas.
 */

import { parseNumber } from "@/lib/parse-systemic";

export interface AccCostRow {
  /** Nome do item de orçamento — usado para casar com o marco. */
  name: string;
  plannedCost: number | null;
  actualCost: number | null;
}

export interface AccIssueSummary {
  /** Issues não fechadas no momento da extração. */
  openIssues: number;
  total: number;
}

/** Normaliza cabeçalho: sem acento, minúsculo, só alfanumérico. */
function norm(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickColumn(
  headers: string[],
  candidates: string[],
): string | null {
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
  const exact = normalized.find((h) => candidates.includes(h.n));
  if (exact) return exact.raw;
  const partial = normalized.find((h) => candidates.some((c) => h.n.includes(c)));
  return partial?.raw ?? null;
}

/**
 * Extrai custo do `cost_budgets.csv`.
 *
 * Os nomes de coluna variam entre versões do ACC, então casamos por sinônimo
 * em vez de posição fixa — mesma estratégia do parser de planilha.
 */
export function parseAccCost(records: Record<string, unknown>[]): AccCostRow[] {
  if (records.length === 0) return [];

  const headers = Object.keys(records[0]);
  const nameCol = pickColumn(headers, ["name", "budget name", "description", "code"]);
  const plannedCol = pickColumn(headers, [
    "original amount",
    "budget amount",
    "original budget",
    "approved budget",
  ]);
  const actualCol = pickColumn(headers, [
    "actual cost",
    "actual amount",
    "committed amount",
    "spent",
  ]);

  if (!nameCol) return [];

  const rows: AccCostRow[] = [];
  for (const rec of records) {
    const name = String(rec[nameCol] ?? "").trim();
    if (!name) continue;

    const plannedCost = plannedCol ? parseNumber(rec[plannedCol]) : null;
    const actualCost = actualCol ? parseNumber(rec[actualCol]) : null;
    if (plannedCost == null && actualCost == null) continue;

    rows.push({ name, plannedCost, actualCost });
  }
  return rows;
}

/** Status que contam como "aberta" nos issues do ACC. */
const CLOSED_STATUSES = new Set(["closed", "void", "answered", "completed"]);

/** Conta issues abertas no `issues_issues.csv`. */
export function summarizeAccIssues(
  records: Record<string, unknown>[],
): AccIssueSummary {
  if (records.length === 0) return { openIssues: 0, total: 0 };

  const statusCol = pickColumn(Object.keys(records[0]), ["status", "issue status"]);
  if (!statusCol) return { openIssues: 0, total: records.length };

  let openIssues = 0;
  for (const rec of records) {
    const status = norm(String(rec[statusCol] ?? ""));
    if (status && !CLOSED_STATUSES.has(status)) openIssues += 1;
  }

  return { openIssues, total: records.length };
}

/**
 * Casa itens de custo do ACC com marcos do DataPulse por nome normalizado.
 *
 * Deliberadamente conservador: só casa nome idêntico após normalização. Um
 * match fuzzy erraria de forma silenciosa e contaminaria o DRI — melhor não
 * casar e deixar o dado de fora do que atribuir custo ao marco errado.
 */
export function matchCostToMilestones(
  costRows: AccCostRow[],
  milestones: { id: string; name: string }[],
): Map<string, AccCostRow> {
  const byName = new Map(milestones.map((m) => [norm(m.name), m.id]));
  const result = new Map<string, AccCostRow>();

  for (const row of costRows) {
    const milestoneId = byName.get(norm(row.name));
    if (!milestoneId) continue;

    // Se o ACC trouxer várias linhas para o mesmo marco, somamos.
    const existing = result.get(milestoneId);
    result.set(
      milestoneId,
      existing
        ? {
            name: existing.name,
            plannedCost: sumNullable(existing.plannedCost, row.plannedCost),
            actualCost: sumNullable(existing.actualCost, row.actualCost),
          }
        : row,
    );
  }

  return result;
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return a + b;
}

export { norm as normalizeAccHeader };
