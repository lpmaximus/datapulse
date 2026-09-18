/**
 * Camada 1 — parse de planilha (CSV/XLSX) para SystemicSignal.
 *
 * Regra de ouro do MVP: aceitar planilha bagunçada de cliente sem exigir
 * template rígido. O mapeamento de colunas é tolerante a acentos, caixa e
 * sinônimos comuns em PT/EN.
 */

export interface ParsedRow {
  milestoneName: string;
  plannedDate: Date | null;
  actualDate: Date | null;
  delayDays: number | null;
  plannedCost: number | null;
  actualCost: number | null;
  openIssues: number | null;
  replanCount: number | null;
  raw: Record<string, unknown>;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { line: number; message: string }[];
  detectedColumns: Record<string, string | null>;
}

const COLUMN_ALIASES: Record<keyof Omit<ParsedRow, "raw">, string[]> = {
  milestoneName: ["marco", "milestone", "atividade", "tarefa", "task", "nome", "name", "entrega"],
  plannedDate: [
    "data planejada", "planejado", "data prevista", "prevista", "baseline",
    "planned date", "planned", "plannedfinish", "termino previsto", "fim previsto",
  ],
  actualDate: [
    "data real", "real", "data realizada", "realizada", "actual date", "actual",
    "actualfinish", "termino real", "fim real", "conclusao",
  ],
  delayDays: ["atraso", "atraso dias", "dias de atraso", "delay", "delay days", "variance", "desvio dias"],
  plannedCost: ["custo previsto", "custo planejado", "orcamento", "budget", "planned cost", "custo baseline"],
  actualCost: ["custo real", "custo realizado", "actual cost", "realizado", "gasto"],
  openIssues: ["issues", "issues abertas", "pendencias", "open issues", "rfis", "nao conformidades"],
  replanCount: ["replanejamentos", "replan", "revisoes", "replan count", "reprogramacoes"],
};

/** Remove acentos, pontuação e caixa para comparar cabeçalhos. */
export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchColumns(headers: string[]): Record<string, string | null> {
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const result: Record<string, string | null> = {};

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    // Exato primeiro, depois prefixo — evita "custo real" casar com "real".
    const exact = normalized.find((h) => aliases.includes(h.norm));
    const partial =
      exact ??
      normalized.find((h) => aliases.some((a) => h.norm === a || h.norm.startsWith(a + " ")));
    const loose =
      partial ?? normalized.find((h) => aliases.some((a) => h.norm.includes(a)));
    result[field] = loose?.raw ?? null;
  }
  return result;
}

/** Aceita dd/mm/aaaa, aaaa-mm-dd, serial do Excel e Date. */
export function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "number") {
    // Serial date do Excel (base 1899-12-30).
    if (value > 20000 && value < 60000) {
      return new Date(Math.round((value - 25569) * 86400 * 1000));
    }
    return null;
  }

  const s = String(value).trim();
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const dt = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Aceita "R$ 1.234,56", "1,234.56", "1234.56". */
export function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let s = String(value).replace(/[^\d,.\-]/g, "").trim();
  if (s === "" || s === "-") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Formato pt-BR: ponto é milhar, vírgula é decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const DAY_MS = 86_400_000;

export function parseRows(records: Record<string, unknown>[]): ParseResult {
  const errors: ParseResult["errors"] = [];
  const rows: ParsedRow[] = [];

  if (records.length === 0) {
    return { rows, errors: [{ line: 0, message: "Planilha vazia." }], detectedColumns: {} };
  }

  const detectedColumns = matchColumns(Object.keys(records[0]));
  if (!detectedColumns.milestoneName) {
    return {
      rows,
      errors: [
        {
          line: 0,
          message:
            "Não encontrei a coluna da tarefa. Renomeie a coluna para 'Tarefa' (ou 'Marco') e reenvie.",
        },
      ],
      detectedColumns,
    };
  }

  const pick = (rec: Record<string, unknown>, field: string) => {
    const col = detectedColumns[field];
    return col ? rec[col] : null;
  };

  records.forEach((rec, i) => {
    const line = i + 2; // +1 pelo cabeçalho, +1 porque humanos contam do 1
    const name = String(pick(rec, "milestoneName") ?? "").trim();
    if (!name) return; // linha em branco: ignora silenciosamente

    const plannedDate = parseDate(pick(rec, "plannedDate"));
    const actualDate = parseDate(pick(rec, "actualDate"));
    let delayDays = parseNumber(pick(rec, "delayDays"));

    if (delayDays == null && plannedDate && actualDate) {
      delayDays = Math.round((actualDate.getTime() - plannedDate.getTime()) / DAY_MS);
    }

    const plannedCost = parseNumber(pick(rec, "plannedCost"));
    const actualCost = parseNumber(pick(rec, "actualCost"));

    if (plannedDate == null && actualDate == null && plannedCost == null && actualCost == null) {
      errors.push({
        line,
        message: `"${name}": nenhuma data ou custo reconhecido — linha ignorada.`,
      });
      return;
    }

    rows.push({
      milestoneName: name,
      plannedDate,
      actualDate,
      delayDays: delayDays == null ? null : Math.round(delayDays),
      plannedCost,
      actualCost,
      openIssues: (() => {
        const n = parseNumber(pick(rec, "openIssues"));
        return n == null ? null : Math.round(n);
      })(),
      replanCount: (() => {
        const n = parseNumber(pick(rec, "replanCount"));
        return n == null ? null : Math.round(n);
      })(),
      raw: rec,
    });
  });

  return { rows, errors, detectedColumns };
}
