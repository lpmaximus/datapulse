import Link from "next/link";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { Empty, SectionTitle } from "@/components/ui";
import { ResizableCell, ResizableTable } from "@/components/table-ui";
import { Avatar } from "@/components/task-ui";
import { calendarDay } from "@/lib/business-days";
import { currentAnalystId } from "@/lib/delegation";
import { TIME_CATEGORY_LABEL, effectiveHours, formatHours, isoDay, resolveWeek, shiftWeek, weekDays } from "@/lib/timesheet";
import { WORKLOAD_SIGNAL_LABEL, buildWorkloadGrid, type WorkloadSignal } from "@/lib/workload";

const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dayLabel(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${WEEKDAY[d.getUTCDay()]} ${dd}/${mm}`;
}

const pctText = (n: number) => `${String(n).replace(".", ",")}%`;

function cellTone(pct: number, hours: number): string {
  if (hours === 0) return "bg-canvas text-ink-faint";
  if (pct > 100) return "bg-red-100 text-red-800";
  if (pct >= 80) return "bg-amber-100 text-amber-900";
  return "bg-emerald-50 text-emerald-900";
}

interface DayItem {
  kind: "hours" | "doc";
  text: string;
}

/**
 * Grade Coordenador: especialista × dia útil da semana. Horas vêm do apontamento
 * do próprio especialista; documento aparece só no dia do vencimento (sem horas).
 * Só ADMIN e MANAGER veem.
 */
export async function WorkloadGrid({
  user,
  week,
  disciplineId,
  basePath,
}: {
  user: SessionUser;
  week?: string;
  disciplineId?: string;
  basePath: string;
}) {
  const now = new Date();
  const today = calendarDay(now);
  const start = resolveWeek(week, now);
  const days = weekDays(start);
  const end = days[days.length - 1];
  const orgId = user.organizationId;

  const [disciplines, specialists, revisions] = await Promise.all([
    prisma.discipline.findMany({
      where: { organizationId: orgId },
      orderBy: { tag: "asc" },
      select: { id: true, tag: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        role: "SPECIALIST",
        ...(disciplineId ? { disciplines: { some: { disciplineId } } } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Não filtra por quem já está no quadro de especialistas: um documento
    // pode ter administrador/gerente como especialista ou responsável
    // (permitido na tela do documento), e essa pessoa precisa aparecer aqui
    // mesmo fora do papel Especialista. Disciplina filtra direto no
    // documento, não pelo especialista — senão um vencimento assim ficaria
    // invisível mesmo sem filtro de disciplina nenhum selecionado.
    prisma.documentRevision.findMany({
      where: {
        status: "IN_REVIEW",
        dueAt: { not: null, lte: end },
        document: {
          project: { organizationId: orgId, status: "ACTIVE" },
          ...(disciplineId ? { disciplineId } : {}),
        },
      },
      select: {
        specialistId: true,
        dueAt: true,
        name: true,
        specialist: { select: { id: true, name: true } },
        document: {
          select: {
            number: true,
            name: true,
            responsibleId: true,
            responsible: { select: { id: true, name: true } },
            project: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  const specialistIds = specialists.map((p) => p.id);

  const dueDocs = revisions.flatMap((r) => {
    const uid = currentAnalystId({ specialistId: r.specialistId, responsibleId: r.document.responsibleId });
    return uid && r.dueAt ? [{ userId: uid, dueAt: r.dueAt, rev: r }] : [];
  });

  // Quem tem documento vencendo mas não está no quadro de especialistas.
  const extra = new Map<string, { id: string; name: string }>();
  for (const r of revisions) {
    const uid = currentAnalystId({ specialistId: r.specialistId, responsibleId: r.document.responsibleId });
    if (!uid || specialistIds.includes(uid)) continue;
    const person = r.specialistId === uid ? r.specialist : r.document.responsible;
    if (person) extra.set(uid, person);
  }
  const people = extra.size
    ? [...specialists, ...[...extra.values()].sort((a, b) => a.name.localeCompare(b.name))]
    : specialists;
  const ids = people.map((p) => p.id);

  const entriesRaw = await prisma.timeEntry.findMany({
    where: { userId: { in: ids }, date: { gte: start, lte: end } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      userId: true,
      date: true,
      category: true,
      plannedHours: true,
      actualHours: true,
      project: { select: { name: true } },
      document: { select: { number: true, name: true } },
      milestone: { select: { name: true } },
    },
  });

  const entries = entriesRaw.map((e) => ({
    userId: e.userId,
    date: e.date,
    plannedHours: Number(e.plannedHours),
    actualHours: e.actualHours == null ? null : Number(e.actualHours),
  }));

  const rows = buildWorkloadGrid({
    users: people,
    weekStart: start,
    entries,
    dues: dueDocs.map((d) => ({ userId: d.userId, dueAt: d.dueAt })),
    today,
  });

  // Detalhe por usuário/dia: o que compõe as horas e quais documentos vencem.
  const detail = new Map<string, DayItem[]>();
  const push = (uid: string, iso: string, item: DayItem) => {
    const k = `${uid}|${iso}`;
    detail.set(k, [...(detail.get(k) ?? []), item]);
  };
  entriesRaw.forEach((e, i) => {
    const link = e.document
      ? `${e.document.number ? `${e.document.number} — ` : ""}${e.document.name}`
      : (e.milestone?.name ?? e.project?.name ?? "");
    push(e.userId, isoDay(e.date), {
      kind: "hours",
      text: `${formatHours(effectiveHours(entries[i]))} · ${TIME_CATEGORY_LABEL[e.category]}${link ? ` · ${link}` : ""}`,
    });
  });
  for (const d of dueDocs) {
    const doc = d.rev.document;
    push(d.userId, isoDay(calendarDay(d.dueAt)), {
      kind: "doc",
      text: `Vence: ${doc.number ? `${doc.number} — ` : ""}${doc.name} (${doc.project.name})`,
    });
  }

  const prev = isoDay(shiftWeek(start, -1));
  const next = isoDay(shiftWeek(start, 1));
  const isCurrentWeek = isoDay(resolveWeek(undefined, now)) === isoDay(start);
  const q = (s: string) => `${basePath}?semana=${s}${disciplineId ? `&disciplina=${disciplineId}` : ""}`;
  const totalSignals = rows.filter((r) => r.signalCount > 0).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle hint="Horas = o que cada especialista apontou · documento aparece só no dia do vencimento, sem horas">
          Carga da equipe por dia da semana
        </SectionTitle>
        <div className="flex items-center gap-2 text-sm">
          <Link href={q(prev)} aria-label="Semana anterior" className="rounded-md border border-line p-1.5 text-ink-soft hover:bg-canvas">
            <ChevronLeft size={16} />
          </Link>
          <span className="min-w-[150px] text-center tabular-nums text-ink">
            {dayLabel(days[0])} – {dayLabel(end)}
          </span>
          <Link href={q(next)} aria-label="Próxima semana" className="rounded-md border border-line p-1.5 text-ink-soft hover:bg-canvas">
            <ChevronRight size={16} />
          </Link>
          {isCurrentWeek ? null : (
            <Link href={basePath + (disciplineId ? `?disciplina=${disciplineId}` : "")} className="rounded-md border border-line px-2.5 py-1.5 text-ink-soft hover:bg-canvas">
              Hoje
            </Link>
          )}
        </div>
      </div>

      {disciplines.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-faint">Disciplina:</span>
          <Link
            href={q(isoDay(start))}
            className={"rounded-full border px-2.5 py-1 " + (!disciplineId ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-soft hover:bg-canvas")}
          >
            Todas
          </Link>
          {disciplines.map((dc) => (
            <Link
              key={dc.id}
              href={`${basePath}?semana=${isoDay(start)}&disciplina=${dc.id}`}
              title={dc.name}
              className={"rounded-full border px-2.5 py-1 " + (disciplineId === dc.id ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-soft hover:bg-canvas")}
            >
              {dc.tag}
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Empty>Nenhum especialista ativo{disciplineId ? " nesta disciplina" : ""}.</Empty>
      ) : (
        <>
          <p className="text-xs text-ink-faint">
            {totalSignals === 0
              ? "Nenhum sinal na semana."
              : `${totalSignals} de ${rows.length} com sinais — use como pauta de conversa com o especialista, não como cobrança.`}
          </p>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <ResizableTable id="workload-grid" className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-faint">
                  <ResizableCell as="th" resizeKey="especialista" defaultWidth={200} className="px-4 py-2.5 text-left font-medium">
                    Especialista
                  </ResizableCell>
                  {days.map((d) => (
                    <ResizableCell
                      as="th"
                      key={isoDay(d)}
                      resizeKey={`dia-${isoDay(d)}`}
                      defaultWidth={90}
                      className={"px-2 py-2.5 text-center font-medium " + (isoDay(d) === isoDay(today) ? "text-ink" : "")}
                    >
                      {dayLabel(d)}
                    </ResizableCell>
                  ))}
                  <ResizableCell as="th" resizeKey="semana" defaultWidth={90} className="px-3 py-2.5 text-right font-medium">
                    Semana
                  </ResizableCell>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.user.name} size={24} />
                        <span className="truncate text-ink">{r.user.name}</span>
                      </div>
                      {r.signals.length > 0 ? (
                        <ul className="mt-1.5 space-y-0.5">
                          {r.signals.map((s: WorkloadSignal) => (
                            <li key={s} className="flex items-start gap-1 text-[11px] text-amber-700">
                              <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                              {WORKLOAD_SIGNAL_LABEL[s]}
                              {s === "OVERDUE" ? ` (${r.overdueCount})` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                    {r.days.map((c) => {
                      const items = detail.get(`${r.user.id}|${c.iso}`) ?? [];
                      return (
                        <td key={c.iso} className="px-1.5 py-2 text-center">
                          <details className="group">
                            <summary className="cursor-pointer list-none">
                              <div className={"rounded-md px-1 py-1.5 tabular-nums " + cellTone(c.pct, c.hours)}>
                                <div className="text-sm font-medium">{c.hours === 0 ? "—" : pctText(c.pct)}</div>
                                <div className="text-[11px] opacity-80">{c.hours === 0 ? "sem horas" : formatHours(c.hours)}</div>
                              </div>
                              {c.dueCount > 0 ? (
                                <div className="mt-1 rounded bg-blue-50 px-1 text-[11px] text-blue-800">
                                  {c.dueCount} doc{c.dueCount > 1 ? "s" : ""} vence{c.dueCount > 1 ? "m" : ""}
                                </div>
                              ) : null}
                            </summary>
                            {items.length > 0 ? (
                              <ul className="mt-1 space-y-1 rounded-md border border-line bg-surface p-2 text-left text-[11px] text-ink-soft">
                                {items.map((it, i) => (
                                  <li key={i} className={it.kind === "doc" ? "text-blue-800" : ""}>{it.text}</li>
                                ))}
                              </ul>
                            ) : null}
                          </details>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="font-medium">{pctText(r.weekPct)}</div>
                      <div className="text-[11px] text-ink-faint">{formatHours(r.weekHours)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResizableTable>
          </div>
          <p className="text-xs text-ink-faint">
            Capacidade fixa de 8 h/dia (férias e licenças ainda não entram). Célula vermelha = acima de 100%.
          </p>
        </>
      )}
    </section>
  );
}
