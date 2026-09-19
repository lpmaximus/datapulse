/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import {
  Document,
  Page,
  Path,
  Rect,
  Svg,
  Line,
  Circle,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { BAND_LABEL, type DRIBand } from "@/lib/dri";
import { TASK_STATUS_LABEL, PROJECT_STATUS_LABEL } from "@/lib/tasks";
import { STATUS_LABEL } from "@/lib/documents";

/**
 * Peças comuns dos relatórios em PDF (@react-pdf/renderer).
 *
 * Fonte: Helvetica embutida no PDF (WinAnsi) — cobre acentuação do português.
 * Por isso os textos evitam setas e símbolos fora do Latin-1.
 */

export const COLORS = {
  ink: "#0F172A",
  soft: "#475569",
  faint: "#94A3B8",
  line: "#E2E8F0",
  surface: "#F8FAFC",
  accent: "#1D4ED8",
  white: "#FFFFFF",
  ok: "#15803D",
  okBg: "#DCFCE7",
  watch: "#B45309",
  watchBg: "#FEF3C7",
  high: "#C2410C",
  highBg: "#FFEDD5",
  crit: "#B91C1C",
  critBg: "#FEE2E2",
  gray: "#64748B",
  grayBg: "#E2E8F0",
  purple: "#6D28D9",
  purpleBg: "#EDE9FE",
};

export const BAND_COLORS: Record<DRIBand, { fg: string; bg: string }> = {
  low: { fg: COLORS.ok, bg: COLORS.okBg },
  watch: { fg: COLORS.watch, bg: COLORS.watchBg },
  high: { fg: COLORS.high, bg: COLORS.highBg },
  critical: { fg: COLORS.crit, bg: COLORS.critBg },
};

const TASK_STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  NOT_STARTED: { fg: COLORS.gray, bg: COLORS.grayBg },
  IN_PROGRESS: { fg: COLORS.watch, bg: COLORS.watchBg },
  IN_REVIEW: { fg: COLORS.purple, bg: COLORS.purpleBg },
  BLOCKED: { fg: COLORS.crit, bg: COLORS.critBg },
  DONE: { fg: COLORS.ok, bg: COLORS.okBg },
  CANCELLED: { fg: COLORS.gray, bg: COLORS.grayBg },
};

const REVISION_STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  DRAFT: { fg: COLORS.gray, bg: COLORS.grayBg },
  IN_REVIEW: { fg: COLORS.purple, bg: COLORS.purpleBg },
  APPROVED: { fg: COLORS.ok, bg: COLORS.okBg },
  COMMENTED: { fg: COLORS.high, bg: COLORS.highBg },
  REJECTED: { fg: COLORS.crit, bg: COLORS.critBg },
  SUPERSEDED: { fg: COLORS.gray, bg: COLORS.grayBg },
  CANCELLED: { fg: COLORS.gray, bg: COLORS.grayBg },
};

export const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.ink,
    paddingTop: 34,
    paddingBottom: 44,
    paddingHorizontal: 34,
  },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 8, color: COLORS.accent, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  meta: { fontSize: 8, color: COLORS.faint },
  title: { fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 6 },
  subtitle: { fontSize: 10, color: COLORS.soft, marginTop: 3 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: COLORS.accent, marginTop: 10, marginBottom: 12 },
  h2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 2,
  },
  hint: { fontSize: 8, color: COLORS.faint, marginBottom: 6 },
  kpiRow: { flexDirection: "row", gap: 8 },
  kpi: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 9,
    backgroundColor: COLORS.surface,
  },
  kpiValue: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  kpiLabel: { fontSize: 7.5, color: COLORS.soft, marginTop: 2 },
  kpiNote: { fontSize: 7, color: COLORS.faint, marginTop: 1 },
  th: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  thText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: COLORS.soft, padding: 4 },
  td: { fontSize: 8.5, padding: 4, justifyContent: "center" },
  empty: {
    fontSize: 9,
    color: COLORS.faint,
    padding: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.line,
    borderRadius: 4,
  },
  footer: {
    position: "absolute",
    left: 34,
    right: 34,
    bottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.faint,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    paddingTop: 5,
  },
});

/* ------------------------------------------------------------------------ */
/* Formatação                                                                */
/* ------------------------------------------------------------------------ */

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d);
}

export function fmtDateTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null) return "-";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function fmtDelta(n: number | null | undefined): string {
  if (n == null) return "-";
  if (Math.abs(n) < 0.1) return "0,0";
  return `${n > 0 ? "+" : "-"}${Math.abs(n).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
}

/** Cor da variação: subir DRI é ruim (vermelho), cair é bom (verde). */
export function deltaColor(n: number | null | undefined): string {
  if (n == null || Math.abs(n) < 0.1) return COLORS.faint;
  return n > 0 ? COLORS.crit : COLORS.ok;
}

export const taskStatusLabel = (k: string) =>
  (TASK_STATUS_LABEL as Record<string, string>)[k] ?? k;
export const projectStatusLabel = (k: string) =>
  (PROJECT_STATUS_LABEL as Record<string, string>)[k] ?? k;
export const revisionStatusLabel = (k: string) =>
  (STATUS_LABEL as Record<string, string>)[k] ?? k;

export const HEALTH_LABEL: Record<string, string> = {
  ON_TRACK: "No prazo",
  WATCH: "Atenção",
  LATE: "Atrasado",
  NO_DATA: "Sem cronograma",
};

export const HEALTH_COLORS: Record<string, { fg: string; bg: string }> = {
  ON_TRACK: { fg: COLORS.ok, bg: COLORS.okBg },
  WATCH: { fg: COLORS.watch, bg: COLORS.watchBg },
  LATE: { fg: COLORS.crit, bg: COLORS.critBg },
  NO_DATA: { fg: COLORS.gray, bg: COLORS.grayBg },
};

/* ------------------------------------------------------------------------ */
/* Componentes                                                               */
/* ------------------------------------------------------------------------ */

export function Pill({
  label,
  fg,
  bg,
}: {
  label: string;
  fg: string;
  bg: string;
}) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 8,
        paddingVertical: 1.5,
        paddingHorizontal: 6,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: fg, fontSize: 7.5, fontFamily: "Helvetica-Bold" }}>{label}</Text>
    </View>
  );
}

export function TaskStatusPill({ status }: { status: string }) {
  const c = TASK_STATUS_COLORS[status] ?? TASK_STATUS_COLORS.NOT_STARTED;
  return <Pill label={taskStatusLabel(status)} fg={c.fg} bg={c.bg} />;
}

export function RevisionStatusPill({ status }: { status: string }) {
  const c = REVISION_STATUS_COLORS[status] ?? REVISION_STATUS_COLORS.DRAFT;
  return <Pill label={revisionStatusLabel(status)} fg={c.fg} bg={c.bg} />;
}

export function HealthPill({ health }: { health: string }) {
  const c = HEALTH_COLORS[health] ?? HEALTH_COLORS.NO_DATA;
  return <Pill label={HEALTH_LABEL[health] ?? health} fg={c.fg} bg={c.bg} />;
}

export function DriPill({ score, band }: { score: number | null; band: DRIBand | null }) {
  if (score == null || band == null) return <Text style={{ color: COLORS.faint }}>-</Text>;
  const c = BAND_COLORS[band];
  return <Pill label={`${fmtNum(score)} ${BAND_LABEL[band]}`} fg={c.fg} bg={c.bg} />;
}

export function Kpi({
  value,
  label,
  note,
  color,
}: {
  value: string;
  label: string;
  note?: string;
  color?: string;
}) {
  return (
    <View style={s.kpi}>
      <Text style={[s.kpiValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      {note ? <Text style={s.kpiNote}>{note}</Text> : null}
    </View>
  );
}

export function ProgressBar({ value, width = 60 }: { value: number | null; width?: number }) {
  if (value == null) return <Text style={{ color: COLORS.faint }}>-</Text>;
  const v = Math.max(0, Math.min(100, value));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Svg width={width} height={6}>
        <Rect x={0} y={0} width={width} height={6} rx={3} fill={COLORS.line} />
        {v > 0 ? <Rect x={0} y={0} width={(width * v) / 100} height={6} rx={3} fill={COLORS.accent} /> : null}
      </Svg>
      <Text style={{ fontSize: 8 }}>{v}%</Text>
    </View>
  );
}

export interface Column<T> {
  header: string;
  /** Peso relativo da coluna (flexGrow). */
  w: number;
  align?: "left" | "right" | "center";
  render: (row: T, index: number) => React.ReactNode;
}

export function Table<T>({
  columns,
  rows,
  keyOf,
  empty,
  rowStyle,
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string;
  empty?: string;
  rowStyle?: (row: T) => React.ComponentProps<typeof View>["style"];
}) {
  if (rows.length === 0) return <Text style={s.empty}>{empty ?? "Nada a informar."}</Text>;
  const cell = (c: Column<T>) => ({
    flexGrow: c.w,
    flexBasis: 0,
    textAlign: c.align ?? "left",
    alignItems:
      c.align === "right" ? ("flex-end" as const) : c.align === "center" ? ("center" as const) : ("flex-start" as const),
  });
  return (
    <View>
      <View style={s.th} fixed>
        {columns.map((c) => (
          <Text key={c.header} style={[s.thText, cell(c)]}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={keyOf(r, i)} style={[s.tr, rowStyle?.(r) ?? {}]} wrap={false}>
          {columns.map((c) => {
            const content = c.render(r, i);
            return (
              <View key={c.header} style={[s.td, cell(c)]}>
                {typeof content === "string" || typeof content === "number" ? (
                  <Text style={{ textAlign: c.align ?? "left" }}>{content}</Text>
                ) : (
                  content
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <View wrap={false} minPresenceAhead={60}>
      <Text style={s.h2}>{children}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : <View style={{ height: 4 }} />}
    </View>
  );
}

/** Linha de tendência do DRI, com faixas de referência (35 / 55 / 75). */
export function Sparkline({
  points,
  width = 240,
  height = 60,
}: {
  points: { score: number; calculatedAt: Date }[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <Text style={{ fontSize: 8, color: COLORS.faint }}>Histórico insuficiente para tendência.</Text>;
  }
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = (i: number) => pad + (w * i) / (points.length - 1);
  const y = (v: number) => pad + h - (h * Math.max(0, Math.min(100, v))) / 100;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <View>
      <Svg width={width} height={height}>
        {[35, 55, 75].map((t) => (
          <Line key={t} x1={pad} x2={width - pad} y1={y(t)} y2={y(t)} stroke={COLORS.line} strokeWidth={0.5} />
        ))}
        <Path d={d} stroke={COLORS.accent} strokeWidth={1.5} fill="none" />
        <Circle cx={x(points.length - 1)} cy={y(last.score)} r={2.5} fill={COLORS.accent} />
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", width }}>
        <Text style={{ fontSize: 7, color: COLORS.faint }}>{fmtDate(points[0].calculatedAt)}</Text>
        <Text style={{ fontSize: 7, color: COLORS.faint }}>{fmtDate(last.calculatedAt)}</Text>
      </View>
    </View>
  );
}

/** Moldura padrão: cabeçalho, corpo e rodapé com paginação. */
export function ReportDocument({
  title,
  subtitle,
  docTitle,
  generatedAt,
  orientation = "portrait",
  children,
}: {
  title: string;
  subtitle?: string;
  docTitle: string;
  generatedAt: Date;
  orientation?: "portrait" | "landscape";
  children: React.ReactNode;
}) {
  return (
    <Document title={docTitle} author="DataPulse" creator="DataPulse" producer="DataPulse">
      <Page size="A4" orientation={orientation} style={s.page}>
        <View style={s.brandRow}>
          <Text style={s.brand}>DATAPULSE</Text>
          <Text style={s.meta}>Gerado em {fmtDateTime(generatedAt)}</Text>
        </View>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        <View style={s.rule} />
        {children}
        <View style={s.footer} fixed>
          <Text>{docTitle}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
