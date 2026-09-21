/**
 * Carga de trabalho por especialista × dia da semana (regras puras).
 *
 * Insumos: horas apontadas (TimeEntry) e revisões de documento em análise com
 * vencimento. Documento NÃO gera horas por estimativa — ele aparece só no dia
 * do vencimento, como item (contagem), e as horas vêm do que o especialista
 * lançar. Os sinais são um "gatilho" para o Coordenador conversar com o
 * especialista, não uma cobrança automática.
 */

import { calendarDay } from "./business-days";
import { DAILY_CAPACITY_HOURS, effectiveHours, isoDay, weekDays } from "./timesheet";

/** A partir de quantos documentos vencendo no mesmo dia consideramos "concentrado". */
export const CONCENTRATED_DUE_THRESHOLD = 3;

export type WorkloadSignal = "OVER" | "DUE_NO_HOURS" | "DUE_CONCENTRATED" | "OVERDUE";

export const WORKLOAD_SIGNAL_LABEL: Record<WorkloadSignal, string> = {
  OVER: "Dia acima de 100%",
  DUE_NO_HOURS: "Documento vence em dia sem horas apontadas",
  DUE_CONCENTRATED: "Vencimentos concentrados no mesmo dia",
  OVERDUE: "Documentos em análise vencidos",
};

export interface WorkloadUser {
  id: string;
  name: string;
}

export interface WorkloadEntry {
  userId: string;
  date: Date;
  plannedHours: number;
  actualHours: number | null;
}

export interface WorkloadDue {
  userId: string;
  dueAt: Date;
}

export interface WorkloadDayCell {
  iso: string;
  hours: number;
  pct: number;
  over: boolean;
  dueCount: number;
  signals: WorkloadSignal[];
}

export interface WorkloadRow {
  user: WorkloadUser;
  days: WorkloadDayCell[];
  weekHours: number;
  weekPct: number;
  /** Em análise, com vencimento anterior a hoje (de qualquer semana). */
  overdueCount: number;
  signals: WorkloadSignal[];
  signalCount: number;
}

export function buildWorkloadGrid(input: {
  users: WorkloadUser[];
  weekStart: Date;
  entries: WorkloadEntry[];
  dues: WorkloadDue[];
  today: Date;
  capacity?: number;
}): WorkloadRow[] {
  const capacity = input.capacity ?? DAILY_CAPACITY_HOURS;
  const dayKeys = weekDays(input.weekStart).map(isoDay);
  const todayKey = isoDay(calendarDay(input.today));

  const rows = input.users.map<WorkloadRow>((user) => {
    const hoursByDay = new Map<string, number>();
    for (const e of input.entries) {
      if (e.userId !== user.id) continue;
      const k = isoDay(e.date);
      hoursByDay.set(k, (hoursByDay.get(k) ?? 0) + effectiveHours(e));
    }
    const dueByDay = new Map<string, number>();
    let overdueCount = 0;
    for (const d of input.dues) {
      if (d.userId !== user.id) continue;
      const k = isoDay(calendarDay(d.dueAt));
      if (k < todayKey) overdueCount++;
      dueByDay.set(k, (dueByDay.get(k) ?? 0) + 1);
    }

    const cells = dayKeys.map<WorkloadDayCell>((iso) => {
      const hours = hoursByDay.get(iso) ?? 0;
      const dueCount = dueByDay.get(iso) ?? 0;
      const signals: WorkloadSignal[] = [];
      if (hours > capacity) signals.push("OVER");
      // Só cobra horas de dia que já começou: hoje ou passado.
      if (dueCount > 0 && hours === 0 && iso <= todayKey) signals.push("DUE_NO_HOURS");
      if (dueCount >= CONCENTRATED_DUE_THRESHOLD) signals.push("DUE_CONCENTRATED");
      return {
        iso,
        hours,
        pct: capacity > 0 ? Math.round((hours / capacity) * 1000) / 10 : 0,
        over: hours > capacity,
        dueCount,
        signals,
      };
    });

    const weekHours = cells.reduce((s, c) => s + c.hours, 0);
    const signals = new Set<WorkloadSignal>(cells.flatMap((c) => c.signals));
    if (overdueCount > 0) signals.add("OVERDUE");
    const signalCount = cells.reduce((s, c) => s + c.signals.length, 0) + (overdueCount > 0 ? 1 : 0);

    return {
      user,
      days: cells,
      weekHours,
      weekPct: Math.round((weekHours / (capacity * 5)) * 1000) / 10,
      overdueCount,
      signals: [...signals],
      signalCount,
    };
  });

  // Quem pede conversa primeiro: mais sinais, depois maior carga, depois nome.
  return rows.sort(
    (a, b) =>
      b.signalCount - a.signalCount ||
      b.weekHours - a.weekHours ||
      a.user.name.localeCompare(b.user.name, "pt-BR"),
  );
}
