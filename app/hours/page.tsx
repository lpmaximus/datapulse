import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { projectVisibility } from "@/lib/visibility";
import { Card, SectionTitle, Empty } from "@/components/ui";
import { DeleteButton } from "@/components/delete-button";
import { ActualHoursForm, TimeEntryForm, type LinkOptions } from "@/components/hours-forms";
import { deleteTimeEntry } from "@/app/actions/hours";
import { calendarDay } from "@/lib/business-days";
import {
  DAILY_CAPACITY_HOURS,
  TIME_CATEGORY_LABEL,
  WEEK_CAPACITY_HOURS,
  effectiveHours,
  formatHours,
  isoDay,
  resolveWeek,
  shiftWeek,
  summarizeDay,
  weekDays,
  type TimeCategory,
} from "@/lib/timesheet";

export const dynamic = "force-dynamic";

const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dayLabel(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${WEEKDAY[d.getUTCDay()]} ${dd}/${mm}`;
}

function OccupancyBar({ pct, over }: { pct: number; over: boolean }) {
  return (
    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-canvas">
      <div
        className={over ? "h-full bg-red-500" : "h-full bg-accent"}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER", "SPECIALIST"], "/hours");
  const { semana } = await searchParams;

  const now = new Date();
  const today = calendarDay(now);
  const start = resolveWeek(semana, now);
  const days = weekDays(start);
  const end = days[days.length - 1];
  const visible = projectVisibility(user);

  const [entriesRaw, projects, tasks, documents] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId: user.id, date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        category: true,
        plannedHours: true,
        actualHours: true,
        note: true,
        project: { select: { id: true, name: true } },
        milestone: { select: { id: true, name: true, projectId: true } },
        document: { select: { id: true, number: true, name: true, projectId: true } },
      },
    }),
    prisma.project.findMany({
      where: { ...visible, status: "ACTIVE" },
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, name: true },
    }),
    prisma.milestone.findMany({
      where: {
        assigneeId: user.id,
        status: { notIn: ["DONE", "CANCELLED"] },
        project: { status: "ACTIVE", organizationId: user.organizationId },
      },
      orderBy: { name: "asc" },
      take: 100,
      select: { id: true, name: true, project: { select: { name: true } } },
    }),
    prisma.document.findMany({
      where: {
        project: { status: "ACTIVE", organizationId: user.organizationId },
        revisions: { some: { specialistId: user.id, status: "IN_REVIEW" } },
      },
      orderBy: { name: "asc" },
      take: 100,
      select: { id: true, number: true, name: true, project: { select: { name: true } } },
    }),
  ]);

  const options: LinkOptions = {
    projects,
    tasks: tasks.map((t) => ({ id: t.id, name: t.name, project: t.project.name })),
    documents: documents.map((d) => ({
      id: d.id,
      label: `${d.number ? `${d.number} — ` : ""}${d.name}`,
      project: d.project.name,
    })),
  };

  const entries = entriesRaw.map((e) => ({
    ...e,
    plannedHours: Number(e.plannedHours),
    actualHours: e.actualHours == null ? null : Number(e.actualHours),
  }));

  const weekEffective = entries.reduce((s, e) => s + effectiveHours(e), 0);
  const weekPct = Math.round((weekEffective / WEEK_CAPACITY_HOURS) * 1000) / 10;

  const prev = isoDay(shiftWeek(start, -1));
  const next = isoDay(shiftWeek(start, 1));
  const isCurrentWeek = isoDay(resolveWeek(undefined, now)) === isoDay(start);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Minhas horas</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Lance com antecedência o que vai consumir seu tempo (reuniões, visitas, coordenação,
            tarefas) e ajuste o realizado depois. Capacidade de {DAILY_CAPACITY_HOURS} h por dia útil.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/hours?semana=${prev}`}
            aria-label="Semana anterior"
            className="rounded-md border border-line p-1.5 text-ink-soft hover:bg-canvas"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="min-w-[150px] text-center tabular-nums text-ink">
            {dayLabel(days[0])} – {dayLabel(end)}
          </span>
          <Link
            href={`/hours?semana=${next}`}
            aria-label="Próxima semana"
            className="rounded-md border border-line p-1.5 text-ink-soft hover:bg-canvas"
          >
            <ChevronRight size={16} />
          </Link>
          {isCurrentWeek ? null : (
            <Link href="/hours" className="rounded-md border border-line px-2.5 py-1.5 text-ink-soft hover:bg-canvas">
              Hoje
            </Link>
          )}
        </div>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Semana</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatHours(weekEffective)}{" "}
            <span className="text-base font-normal text-ink-soft">
              de {formatHours(WEEK_CAPACITY_HOURS)} · {String(weekPct).replace(".", ",")}%
            </span>
          </p>
        </div>
        <OccupancyBar pct={weekPct} over={weekEffective > WEEK_CAPACITY_HOURS} />
      </Card>

      <div className="space-y-4">
        {days.map((day) => {
          const key = isoDay(day);
          const dayEntries = entries.filter((e) => isoDay(e.date) === key);
          const sum = summarizeDay(dayEntries);
          const isToday = key === isoDay(today);
          return (
            <section key={key}>
              <SectionTitle
                hint={`${formatHours(sum.effective)} de ${formatHours(sum.capacity)} · ${String(sum.pct).replace(".", ",")}%`}
              >
                {dayLabel(day)}
                {isToday ? " · hoje" : ""}
              </SectionTitle>
              <Card className="space-y-4">
                <OccupancyBar pct={sum.pct} over={sum.over} />
                {sum.over ? (
                  <p className="text-sm text-red-700">
                    Acima da capacidade do dia ({formatHours(sum.capacity)}).
                  </p>
                ) : null}

                {dayEntries.length === 0 ? (
                  <Empty>Nada lançado neste dia.</Empty>
                ) : (
                  <ul className="divide-y divide-line">
                    {dayEntries.map((e) => {
                      const target = e.milestone
                        ? { text: e.milestone.name, href: `/projects/${e.milestone.projectId}/tasks/${e.milestone.id}` }
                        : e.document
                          ? {
                              text: `${e.document.number ? `${e.document.number} — ` : ""}${e.document.name}`,
                              href: `/documents/${e.document.id}`,
                            }
                          : e.project
                            ? { text: e.project.name, href: `/projects/${e.project.id}` }
                            : null;
                      return (
                        <li
                          key={e.id}
                          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-[220px] flex-1">
                            <p className="text-sm font-medium text-ink">
                              {TIME_CATEGORY_LABEL[e.category as TimeCategory]}
                              <span className="ml-2 font-normal tabular-nums text-ink-soft">
                                {formatHours(e.plannedHours)} previstas
                                {e.actualHours != null ? ` · ${formatHours(e.actualHours)} realizadas` : ""}
                              </span>
                            </p>
                            {target ? (
                              <Link href={target.href} className="text-xs text-ink-soft hover:text-accent">
                                {target.text}
                              </Link>
                            ) : null}
                            {e.note ? <p className="text-xs text-ink-faint">{e.note}</p> : null}
                          </div>
                          <div className="flex items-center gap-3">
                            <ActualHoursForm entryId={e.id} actualHours={e.actualHours} />
                            <DeleteButton
                              action={deleteTimeEntry}
                              idField="entryId"
                              id={e.id}
                              confirm="Excluir este lançamento de horas?"
                              compact
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <TimeEntryForm date={key} options={options} />
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}
