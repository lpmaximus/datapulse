/**
 * Apontamento de horas e capacidade (regras puras, sem Prisma/Next).
 *
 * Decisões de 21/09/2026: o especialista aponta as próprias horas (reuniões,
 * visitas, coordenação, execução de tarefa, análise) com antecedência; o
 * lançamento nasce como PREVISTO e pode ser ajustado para o REALIZADO depois.
 * A capacidade é de 8 h por dia útil, fixa nesta versão (sem férias, licença
 * ou feriado). Documento não vira horas por estimativa: só entra aqui o que o
 * especialista lançar.
 *
 * Os dias são "dia de calendário" em meia-noite UTC, o mesmo formato dos
 * campos de data do sistema (ver lib/business-days.ts).
 */

import { calendarDay } from "./business-days";

/** Capacidade diária de um especialista, em horas. */
export const DAILY_CAPACITY_HOURS = 8;
export const WEEK_CAPACITY_HOURS = DAILY_CAPACITY_HOURS * 5;

export const TIME_CATEGORIES = [
  "EXECUCAO",
  "ANALISE",
  "REUNIAO",
  "CAMPO",
  "CLIENTE",
  "COORDENACAO",
  "OUTRO",
] as const;

export type TimeCategory = (typeof TIME_CATEGORIES)[number];

export const TIME_CATEGORY_LABEL: Record<TimeCategory, string> = {
  EXECUCAO: "Execução de tarefa",
  ANALISE: "Análise de documento",
  REUNIAO: "Reunião",
  CAMPO: "Visita de campo",
  CLIENTE: "Cliente / órgão público",
  COORDENACAO: "Coordenação",
  OUTRO: "Outro",
};

export function isTimeCategory(v: string): v is TimeCategory {
  return (TIME_CATEGORIES as readonly string[]).includes(v);
}

const DAY_MS = 86_400_000;

/**
 * Lê horas digitadas ("2", "1,5", "0.25"). Aceita de 0,25 a 24, em passos de
 * 15 minutos. Devolve o erro em português, pronto para a tela.
 */
export function parseHours(raw: string): { hours: number } | { error: string } {
  const text = raw.trim().replace(",", ".");
  if (!text) return { error: "Informe as horas." };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: "Horas inválidas. Use números, como 2 ou 1,5." };
  const hours = Number(text);
  if (hours < 0.25) return { error: "O mínimo é 0,25 h (15 minutos)." };
  if (hours > 24) return { error: "Um dia tem no máximo 24 h." };
  if (Math.abs(hours * 4 - Math.round(hours * 4)) > 1e-9) {
    return { error: "Use passos de 15 minutos (0,25 h)." };
  }
  return { hours };
}

/** Dia de calendário (meia-noite UTC) a partir de "AAAA-MM-DD"; nulo se inválido. */
export function parseDay(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(raw + "T00:00:00.000Z");
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === raw ? d : null;
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Segunda a sexta. */
export function isWeekday(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5;
}

/** Segunda-feira da semana que contém o dia. Sábado e domingo ficam na semana que termina. */
export function weekStartOf(day: Date): Date {
  const base = calendarDay(day);
  const dow = base.getUTCDay(); // 0 = domingo
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(base.getTime() - back * DAY_MS);
}

/** Semana a exibir: a do parâmetro "AAAA-MM-DD" (qualquer dia dela) ou a de hoje. */
export function resolveWeek(param: string | undefined | null, now: Date): Date {
  const parsed = param ? parseDay(param) : null;
  return weekStartOf(parsed ?? calendarDay(now));
}

export function shiftWeek(start: Date, weeks: number): Date {
  return new Date(start.getTime() + weeks * 7 * DAY_MS);
}

/** Os cinco dias úteis (segunda a sexta) da semana. */
export function weekDays(start: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
}

export interface EntryHours {
  plannedHours: number;
  /** Horas realizadas, quando o especialista já ajustou. */
  actualHours: number | null;
}

/** Horas que valem para a carga: o realizado, se ajustado; senão o previsto. */
export function effectiveHours(e: EntryHours): number {
  return e.actualHours ?? e.plannedHours;
}

export interface DaySummary {
  planned: number;
  /** Soma do que vale (realizado quando ajustado, previsto no resto). */
  effective: number;
  capacity: number;
  /** Ocupação em % da capacidade, com 1 casa (pode passar de 100). */
  pct: number;
  over: boolean;
}

export function summarizeDay(entries: EntryHours[], capacity: number = DAILY_CAPACITY_HOURS): DaySummary {
  const planned = entries.reduce((s, e) => s + e.plannedHours, 0);
  const effective = entries.reduce((s, e) => s + effectiveHours(e), 0);
  return {
    planned,
    effective,
    capacity,
    pct: capacity > 0 ? Math.round((effective / capacity) * 1000) / 10 : 0,
    over: effective > capacity,
  };
}

/** "2 h", "1,5 h", "0,25 h". */
export function formatHours(h: number): string {
  const text = Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100).replace(".", ",");
  return `${text} h`;
}
