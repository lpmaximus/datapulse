/**
 * Dias úteis e prazo padrão de análise de documento.
 *
 * Módulo puro (sem Prisma/Next), testado com o runner de testes. Trabalha em
 * "dia de calendário" representado por meia-noite UTC — o mesmo formato que os
 * formulários de data do sistema gravam (`optDate`).
 *
 * Dia útil aqui é segunda a sexta. Feriados entram por parâmetro: hoje nenhum
 * chamador passa lista (decisão de 21/09/2026: começar sem feriados), mas o
 * ponto de extensão existe para ligar um cadastro depois sem mexer nas regras.
 */

/** Prazo padrão de análise: a revisão vence 5 dias úteis após a entrada. */
export const REVIEW_BUSINESS_DAYS = 5;

/** Fuso do usuário: o "dia" de um instante com hora é o dia em Brasília. */
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Dia de calendário (meia-noite UTC) de um instante, no fuso indicado.
 * Sem isso, quem registra às 22h de segunda em Brasília (terça 01h UTC)
 * teria o prazo contado a partir de terça.
 */
export function localDayUTC(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return new Date(parts + "T00:00:00.000Z");
}

/**
 * Normaliza para dia de calendário. Data já em meia-noite UTC (vinda de um
 * campo de data) é o próprio dia; instante com hora (ex.: "agora") vira o dia
 * local em Brasília.
 */
export function calendarDay(d: Date, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const isMidnightUTC =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return isMidnightUTC ? new Date(d.getTime()) : localDayUTC(d, timeZone);
}

/**
 * Soma `days` dias úteis a `from`. O dia de partida não conta: a partir de uma
 * segunda, +5 é a segunda seguinte. Partindo de sábado ou domingo, o primeiro
 * dia útil contado é a segunda. `holidays` são dias que não contam
 * (Date em meia-noite UTC ou "AAAA-MM-DD"). `days <= 0` devolve o próprio dia.
 */
export function addBusinessDays(
  from: Date,
  days: number,
  holidays: ReadonlyArray<Date | string> = [],
): Date {
  const skip = new Set(holidays.map((h) => (typeof h === "string" ? h.slice(0, 10) : isoDay(h))));
  const cursor = calendarDay(from);
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    cursor.setTime(cursor.getTime() + DAY_MS);
    if (!isWeekend(cursor) && !skip.has(isoDay(cursor))) remaining -= 1;
  }
  return cursor;
}

/** Vencimento padrão da análise: entrada (envio da projetista) + 5 dias úteis. */
export function reviewDueDate(
  receivedAt: Date,
  holidays: ReadonlyArray<Date | string> = [],
): Date {
  return addBusinessDays(receivedAt, REVIEW_BUSINESS_DAYS, holidays);
}
