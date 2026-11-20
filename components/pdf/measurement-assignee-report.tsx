/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { COLORS, fmtDate } from "@/components/pdf/pdf-kit";
import type { MeasurementDetail } from "@/lib/server/measurement-service";
import {
  MEASUREMENT_STATUS_LABEL,
  assigneeSummary,
  formatSheetsByFormat,
  normalizeAssignee,
} from "@/lib/measurements";

/**
 * Relatório interno do BM: para quem foram as folhas medidas. Resumo por
 * projetista (folhas por formato, A1 eq, valor) e, abaixo, os documentos de
 * cada um. Serve ao repasse de quem dividiu um doc casado — não vai ao
 * contratante.
 */

const BRL = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const A1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const PCT = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
const NONE = "Sem indicação";

const st = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8, color: COLORS.ink, padding: 28, paddingBottom: 40 },
  issuer: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
  },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  code: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  meta: { marginTop: 6, color: COLORS.soft },
  section: { marginTop: 14, fontSize: 9, fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", backgroundColor: COLORS.ink, marginTop: 4 },
  thText: { color: COLORS.white, fontFamily: "Helvetica-Bold", fontSize: 7, paddingVertical: 4, paddingHorizontal: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  td: { fontSize: 7.5, paddingVertical: 3, paddingHorizontal: 3 },
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.ink },
  group: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderWidth: 0.75,
    borderColor: COLORS.line,
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  groupName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  groupMeta: { fontSize: 7.5, color: COLORS.soft },
  footer: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: COLORS.faint,
  },
});

type Col = { header: string; w: number; align?: "left" | "right" | "center"; size?: number; padRight?: number };

const SUMMARY: Col[] = [
  { header: "PROJETISTA", w: 30 },
  { header: "DOCS", w: 7, align: "right" },
  { header: "FOLHAS POR FORMATO", w: 25 },
  { header: "FOLHAS", w: 8, align: "right" },
  { header: "A1 EQ", w: 10, align: "right" },
  { header: "VALOR", w: 14, align: "right" },
];

const DETAIL: Col[] = [
  { header: "NUM DOC", w: 30, size: 6.5, padRight: 8 },
  { header: "DESCRIÇÃO", w: 28, size: 6.5, padRight: 6 },
  { header: "OS", w: 8 },
  { header: "FORMATO", w: 9, align: "center" },
  { header: "FOLHAS", w: 8, align: "right" },
  { header: "%", w: 6, align: "right" },
  { header: "A1 EQ", w: 8, align: "right" },
  { header: "VALOR", w: 11, align: "right" },
];

function cell(cols: Col[], i: number) {
  const c = cols[i];
  return { flexGrow: c.w, flexBasis: 0, textAlign: c.align ?? ("left" as const) };
}

/** Fonte e respiro próprios da coluna (número e descrição ficam menores, com folga entre si). */
function body(cols: Col[], i: number) {
  const c = cols[i];
  return { ...(c.size ? { fontSize: c.size } : {}), ...(c.padRight ? { paddingRight: c.padRight } : {}) };
}

function Header({ cols }: { cols: Col[] }) {
  return (
    <View style={st.th} wrap={false}>
      {cols.map((c, i) => (
        <Text key={c.header} style={[st.thText, cell(cols, i)]}>
          {c.header}
        </Text>
      ))}
    </View>
  );
}

function Row({ cols, values, bold }: { cols: Col[]; values: string[]; bold?: boolean }) {
  return (
    <View style={bold ? st.totalRow : st.tr} wrap={false}>
      {values.map((v, i) => (
        <Text key={i} style={[st.td, cell(cols, i), body(cols, i), bold ? { fontFamily: "Helvetica-Bold" } : {}]}>
          {v}
        </Text>
      ))}
    </View>
  );
}

export function MeasurementAssigneeReportPdf({ m, generatedAt }: { m: MeasurementDetail; generatedAt: Date }) {
  const formats = m.items.filter((it) => it.kind === "FORMAT");
  const summary = assigneeSummary(formats);
  const keyOf = (name: string | null) => (name ? name.toLocaleLowerCase("pt-BR") : "");
  const total = {
    lines: summary.reduce((a, r) => a + r.lines, 0),
    sheets: summary.reduce((a, r) => a + r.sheets, 0),
    a1: summary.reduce((a, r) => a + r.a1Measured, 0),
    amount: summary.reduce((a, r) => a + r.amount, 0),
  };
  const statusNote =
    m.status === "DRAFT" ? " · RASCUNHO" : m.status === "CANCELLED" ? " · CANCELADO" : m.status === "SUPERSEDED" ? " · SUBSTITUÍDO" : "";

  return (
    <Document title={`${m.code} — por projetista`} author={m.issuer.name} creator="DataPulse" producer="DataPulse">
      <Page size="A4" style={st.page}>
        <Text style={st.issuer}>{m.issuer.name.toUpperCase()}</Text>
        <View style={st.titleRow}>
          <Text style={st.title}>FOLHAS DO BM POR PROJETISTA{statusNote}</Text>
          <Text style={st.code}>{m.code}</Text>
        </View>
        <Text style={st.meta}>
          Cliente: {m.client.name} · {m.periodLabel} · Emissão do BM: {fmtDate(m.issuedAt)}
        </Text>

        <Text style={st.section}>RESUMO</Text>
        <Header cols={SUMMARY} />
        {summary.map((r) => (
          <Row
            key={keyOf(r.name)}
            cols={SUMMARY}
            values={[
              r.name ?? NONE,
              String(r.lines),
              formatSheetsByFormat(r.sheetsByFormat),
              String(r.sheets),
              A1(r.a1Measured),
              BRL(r.amount),
            ]}
          />
        ))}
        <Row
          cols={SUMMARY}
          bold
          values={["TOTAL", String(total.lines), "", String(total.sheets), A1(total.a1), BRL(total.amount)]}
        />

        <Text style={st.section}>DOCUMENTOS POR PROJETISTA</Text>
        {summary.map((r) => {
          const mine = formats.filter((it) => keyOf(normalizeAssignee(it.assigneeName)) === keyOf(r.name));
          return (
            <View key={keyOf(r.name)}>
              <View style={st.group} wrap={false} minPresenceAhead={40}>
                <Text style={st.groupName}>{r.name ?? NONE}</Text>
                <Text style={st.groupMeta}>
                  {formatSheetsByFormat(r.sheetsByFormat)} · {A1(r.a1Measured)} A1 eq · {BRL(r.amount)}
                </Text>
              </View>
              <Header cols={DETAIL} />
              {mine.map((it) => (
                <Row
                  key={it.id}
                  cols={DETAIL}
                  values={[
                    `${it.documentNumber ?? "s/ nº"}${it.revisionName ? `-${it.revisionName}` : ""}`,
                    it.description,
                    it.osNumber ?? "",
                    it.sheetFormat ?? "",
                    it.documentSheetCount && it.documentSheetCount !== it.sheetCount
                      ? `${it.sheetCount} de ${it.documentSheetCount}`
                      : String(it.sheetCount),
                    PCT(it.percent),
                    A1(it.quantity * (it.percent / 100)),
                    BRL(it.amount),
                  ]}
                />
              ))}
            </View>
          );
        })}
        {formats.length === 0 ? <Text style={st.meta}>Este BM não tem documentos (formatos).</Text> : null}

        <View style={st.footer} fixed>
          <Text>
            {m.code} · Uso interno — não enviar ao contratante · Situação: {MEASUREMENT_STATUS_LABEL[m.status]} · Gerado em{" "}
            {fmtDate(generatedAt)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/* ------------------- relação de formatos (sem valores) ------------------- */

const SUMMARY_P: Col[] = [
  { header: "PROJETISTA", w: 28 },
  { header: "DOCS", w: 7, align: "right" },
  { header: "FOLHAS POR FORMATO", w: 30 },
  { header: "FOLHAS", w: 9, align: "right" },
  { header: "A1 EQ", w: 10, align: "right" },
];

const DETAIL_P: Col[] = [
  { header: "NUM DOC", w: 32, size: 6.5, padRight: 8 },
  { header: "DESCRIÇÃO", w: 38, size: 6.5, padRight: 6 },
  { header: "OS", w: 9 },
  { header: "FORMATO", w: 11, align: "center" },
  { header: "FOLHAS", w: 10, align: "right" },
  { header: "A1 EQ", w: 10, align: "right" },
];

/**
 * Relação enviada ao projetista: só os formatos (documentos, formato e
 * folhas) que cabem a ele neste BM. Sem valor do A1, sem %, sem valores em R$
 * — ele cobra na medição dele.
 */
export function MeasurementAssigneeSheetsPdf({
  m,
  person,
  generatedAt,
}: {
  m: MeasurementDetail;
  person: string;
  generatedAt: Date;
}) {
  const key = normalizeAssignee(person)?.toLocaleLowerCase("pt-BR") ?? "";
  const mine = m.items.filter(
    (it) => it.kind === "FORMAT" && (normalizeAssignee(it.assigneeName)?.toLocaleLowerCase("pt-BR") ?? "") === key,
  );
  const r = assigneeSummary(mine)[0];
  const name = r?.name ?? person;
  const statusNote = m.status === "DRAFT" ? " · RASCUNHO" : m.status === "CANCELLED" ? " · CANCELADO" : m.status === "SUPERSEDED" ? " · SUBSTITUÍDO" : "";

  return (
    <Document title={`${m.code} — formatos de ${name}`} author={m.issuer.name} creator="DataPulse" producer="DataPulse">
      <Page size="A4" style={st.page}>
        <Text style={st.issuer}>{m.issuer.name.toUpperCase()}</Text>
        <View style={st.titleRow}>
          <Text style={st.title}>RELAÇÃO DE FORMATOS{statusNote}</Text>
          <Text style={st.code}>{m.code}</Text>
        </View>
        <Text style={st.meta}>
          Projetista: {name} · Cliente: {m.client.name} · {m.periodLabel} · Emissão do BM: {fmtDate(m.issuedAt)}
        </Text>

        <Text style={st.section}>RESUMO</Text>
        <Header cols={SUMMARY_P} />
        {r ? (
          <Row
            cols={SUMMARY_P}
            values={[name, String(r.lines), formatSheetsByFormat(r.sheetsByFormat), String(r.sheets), A1(r.a1Measured)]}
          />
        ) : null}

        <Text style={st.section}>DOCUMENTOS</Text>
        <Header cols={DETAIL_P} />
        {mine.map((it) => (
          <Row
            key={it.id}
            cols={DETAIL_P}
            values={[
              `${it.documentNumber ?? "s/ nº"}${it.revisionName ? `-${it.revisionName}` : ""}`,
              it.description,
              it.osNumber ?? "",
              it.sheetFormat ?? "",
              it.documentSheetCount && it.documentSheetCount !== it.sheetCount
                ? `${it.sheetCount} de ${it.documentSheetCount}`
                : String(it.sheetCount),
              A1(it.quantity * (it.percent / 100)),
            ]}
          />
        ))}
        {mine.length === 0 ? <Text style={st.meta}>Nenhum formato indicado para este projetista neste BM.</Text> : null}

        <View style={st.footer} fixed>
          <Text>
            {m.code} · Relação de formatos de {name} · Gerado em {fmtDate(generatedAt)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
