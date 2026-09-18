import Link from "next/link";
import clsx from "clsx";
import { Avatar } from "@/components/task-ui";

const DAY = 86_400_000;

export interface GanttRow {
  id: string;
  label: string;
  sublabel?: string | null;
  href?: string;
  start: Date | null;
  end: Date | null;
  /** Marco: desenha losango na data, sem barra. */
  milestone?: boolean;
  /** Término da linha de base — risco fino quando a previsão deslizou. */
  baselineEnd?: Date | null;
  /** 0–100: parte já executada fica mais escura. */
  progress?: number | null;
  /** Classe de cor da barra (ex.: "bg-st-working"). */
  tone: string;
  owner?: string | null;
  /** Nível de indentação (0 = topo, 1 = tarefa dentro de um marco). */
  depth?: number;
}

function startOfWeekUTC(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // segunda = 0
  return new Date(day.getTime() - dow * DAY);
}

const MONTH = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const DAYMONTH = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "UTC" });

/**
 * Linha do tempo semanal, renderizada no servidor (sem biblioteca).
 *
 * Janela começa na semana anterior a hoje. Barra que começa antes ou termina
 * depois da janela é cortada na borda — a data completa fica no título.
 */
export function GanttChart({
  rows,
  now,
  weeks = 13,
  emptyText = "Nada com datas para mostrar.",
}: {
  rows: GanttRow[];
  now: Date;
  weeks?: number;
  emptyText?: string;
}) {
  const from = new Date(startOfWeekUTC(now).getTime() - 7 * DAY);
  const to = new Date(from.getTime() + weeks * 7 * DAY);
  const span = to.getTime() - from.getTime();
  const pct = (d: Date) => ((d.getTime() - from.getTime()) / span) * 100;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const weekStarts = Array.from({ length: weeks }, (_, i) => new Date(from.getTime() + i * 7 * DAY));
  const months: { label: string; left: number; width: number }[] = [];
  for (const w of weekStarts) {
    const label = MONTH.format(w).replace(".", "");
    const last = months[months.length - 1];
    if (last && last.label === label) last.width += 100 / weeks;
    else months.push({ label, left: pct(w), width: 100 / weeks });
  }
  const todayPct = pct(now);

  const visible = rows.filter((r) => r.end || r.start);

  return (
    <div className="dp-scroll overflow-x-auto">
      <div className="min-w-[760px]">
        {/* cabeçalho */}
        <div className="flex border-b border-line text-xs text-ink-soft">
          <div className="w-56 shrink-0 px-3 py-1.5 font-medium">Item</div>
          <div className="relative flex-1">
            <div className="relative h-6 border-b border-line">
              {months.map((m, i) => (
                <span
                  key={`${m.label}-${i}`}
                  className="absolute top-0 flex h-full items-center border-l border-line pl-1.5 font-medium capitalize text-ink"
                  style={{ left: `${m.left}%`, width: `${m.width}%` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div className="relative h-6">
              {weekStarts.map((w) => (
                <span
                  key={w.toISOString()}
                  className="absolute top-0 flex h-full items-center justify-center border-l border-line tabular-nums text-ink-faint"
                  style={{ left: `${pct(w)}%`, width: `${100 / weeks}%` }}
                >
                  {DAYMONTH.format(w)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-faint">{emptyText}</p>
        ) : (
          visible.map((r) => {
            const start = r.start ?? r.end!;
            const end = r.end ?? r.start!;
            const point = r.milestone || start.getTime() === end.getTime();
            const rawLeft = pct(start);
            const rawRight = pct(new Date(end.getTime() + (point ? 0 : DAY)));
            const left = clamp(rawLeft);
            const right = clamp(rawRight);
            const outside = rawRight < 0 || rawLeft > 100;
            const title = `${r.label}: ${fmt(r.start)} → ${fmt(r.end)}`;

            return (
              <div key={r.id} className="flex border-b border-line last:border-0 hover:bg-canvas/60">
                <div
                  className="flex w-56 shrink-0 items-center gap-2 border-r border-line px-3 py-1.5"
                  style={r.depth ? { paddingLeft: `${12 + r.depth * 14}px` } : undefined}
                >
                  {r.owner !== undefined ? <Avatar name={r.owner} size={22} /> : null}
                  <div className="min-w-0">
                    {r.href ? (
                      <Link href={r.href} className="block truncate text-sm text-ink hover:text-accent">
                        {r.label}
                      </Link>
                    ) : (
                      <span className="block truncate text-sm text-ink">{r.label}</span>
                    )}
                    {r.sublabel ? (
                      <span className="block truncate text-[11px] text-ink-faint">{r.sublabel}</span>
                    ) : null}
                  </div>
                </div>

                <div className="relative h-10 flex-1">
                  {weekStarts.map((w) => (
                    <span
                      key={w.toISOString()}
                      aria-hidden
                      className="absolute inset-y-0 border-l border-line/70"
                      style={{ left: `${pct(w)}%` }}
                    />
                  ))}
                  {todayPct >= 0 && todayPct <= 100 ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 z-10 w-px bg-st-stuck"
                      style={{ left: `${todayPct}%` }}
                    />
                  ) : null}

                  {outside ? (
                    <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-ink-faint">
                      {rawRight < 0 ? `← ${fmt(r.end)}` : ""}
                    </span>
                  ) : point ? (
                    <span
                      title={title}
                      className={clsx("absolute top-1/2 z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45", r.tone)}
                      style={{ left: `${left}%` }}
                    />
                  ) : (
                    <span
                      title={title}
                      className={clsx(
                        "absolute top-1/2 z-20 h-5 -translate-y-1/2 overflow-hidden rounded-full",
                        rawLeft < 0 && "rounded-l-none",
                        rawRight > 100 && "rounded-r-none",
                        r.tone,
                      )}
                      style={{ left: `${left}%`, width: `${Math.max(0.8, right - left)}%` }}
                    >
                      {r.progress != null && r.progress > 0 ? (
                        <span
                          className="absolute inset-y-0 left-0 bg-black/20"
                          style={{ width: `${executedShare(start, end, r.progress, left, right, pct)}%` }}
                        />
                      ) : null}
                    </span>
                  )}

                  {r.baselineEnd &&
                  r.end &&
                  r.baselineEnd.getTime() !== r.end.getTime() &&
                  pct(r.baselineEnd) >= 0 &&
                  pct(r.baselineEnd) <= 100 ? (
                    <span
                      aria-hidden
                      title={`Linha de base: ${fmt(r.baselineEnd)}`}
                      className="absolute top-1.5 bottom-1.5 z-30 w-0.5 bg-ink"
                      style={{ left: `${clamp(pct(new Date(r.baselineEnd.getTime() + DAY)))}%` }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })
        )}

        <div className="flex flex-wrap items-center gap-4 border-t border-line px-3 py-2 text-[11px] text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-px bg-st-stuck" /> hoje
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-ink" /> término da linha de base
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rotate-45 bg-st-purple" /> marco
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-full bg-accent/60" /> parte escura = executado
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Fração da barra *visível* já executada. O avanço vale sobre a duração
 * inteira; se a barra foi cortada na borda da janela, a parte escura precisa
 * ser recalculada sobre o trecho que aparece.
 */
function executedShare(
  start: Date,
  end: Date,
  progress: number,
  left: number,
  right: number,
  pct: (d: Date) => number,
): number {
  const executedAt = new Date(start.getTime() + (end.getTime() + DAY - start.getTime()) * (Math.min(100, progress) / 100));
  const visible = right - left;
  if (visible <= 0) return 0;
  return Math.max(0, Math.min(100, ((pct(executedAt) - left) / visible) * 100));
}

const FMT = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
function fmt(d: Date | null | undefined): string {
  return d ? FMT.format(d) : "—";
}
