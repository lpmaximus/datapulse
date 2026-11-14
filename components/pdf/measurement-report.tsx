/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { COLORS, fmtDate } from "@/components/pdf/pdf-kit";
import type { MeasurementDetail } from "@/lib/server/measurement-service";
import { MEASUREMENT_STATUS_LABEL } from "@/lib/measurements";

/**
 * Boletim de Medição no layout que a projetista já usava em planilha
 * (BM-IDG-OUT-NOV 2026-R00): emissor no topo, bloco "Resumo da medição" e
 * tabela com A1 equivalente por linha, agrupada por OS. Sai em nome do
 * emissor (razão social da organização), não do DataPulse.
 */

const BRL = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const A1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const PCT = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const st = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8, color: COLORS.ink, padding: 28, paddingBottom: 40 },
  issuer: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  taxId: { fontSize: 8, color: COLORS.soft, marginTop: 2 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
  },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  code: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  summary: { flexDirection: "row", gap: 16, marginTop: 10 },
  box: { flexGrow: 1, flexBasis: 0, borderWidth: 0.75, borderColor: COLORS.line, borderRadius: 3 },
  boxTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.soft,
    backgroundColor: COLORS.surface,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.line,
  },
  kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5, paddingHorizontal: 6 },
  k: { color: COLORS.soft },
  v: { fontFamily: "Helvetica-Bold" },
  table: { marginTop: 12 },
  th: { flexDirection: "row", backgroundColor: COLORS.ink },
  thText: { color: COLORS.white, fontFamily: "Helvetica-Bold", fontSize: 7, paddingVertical: 4, paddingHorizontal: 3 },
  group: {
    backgroundColor: COLORS.surface,
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  td: { fontSize: 7.5, paddingVertical: 3, paddingHorizontal: 3 },
  subtotal: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 3, paddingHorizontal: 4 },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.ink,
  },
  totalText: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  notes: { marginTop: 8, fontSize: 8, color: COLORS.soft },
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

const COLS: { header: string; w: number; align?: "left" | "right" | "center" }[] = [
  { header: "ID", w: 3 },
  { header: "Nº SERVIÇO", w: 6 },
  { header: "SE/OSG", w: 5 },
  { header: "DATA EXEC.", w: 7 },
  { header: "NUM DOC", w: 20 },
  { header: "DESCRIÇÃO", w: 26 },
  { header: "FORMATO", w: 5, align: "center" },
  { header: "QUANT.", w: 5, align: "right" },
  { header: "%", w: 5, align: "right" },
  { header: "A1 EQ", w: 6, align: "right" },
  { header: "VALOR TOTAL", w: 9, align: "right" },
];

function cell(i: number) {
  const c = COLS[i];
  return { flexGrow: c.w, flexBasis: 0, textAlign: c.align ?? ("left" as const) };
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <View style={st.kv}>
      <Text style={st.k}>{k}</Text>
      <Text style={st.v}>{v}</Text>
    </View>
  );
}

export function MeasurementReportPdf({ m, generatedAt }: { m: MeasurementDetail; generatedAt: Date }) {
  const groups: { key: string; title: string; items: MeasurementDetail["items"] }[] = [];
  for (const it of m.items) {
    const key = it.kind === "OTHER" ? "__other" : it.projectId ?? "__none";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        title:
          it.kind === "OTHER"
            ? "OUTROS SERVIÇOS"
            : `${it.osNumber ? `OS ${it.osNumber} · ` : ""}${(it.projectName ?? "").toUpperCase()}`,
        items: [],
      };
      groups.push(g);
    }
    g.items.push(it);
  }
  groups.sort((a, b) => (a.key === "__other" ? 1 : b.key === "__other" ? -1 : 0));

  const code = m.code;
  const month = `${MONTH[m.issuedAt.getUTCMonth()]}/${String(m.issuedAt.getUTCFullYear()).slice(2)}`;
  const statusNote = m.status === "DRAFT" ? " · RASCUNHO" : m.status === "CANCELLED" ? " · CANCELADO" : m.status === "SUPERSEDED" ? " · SUBSTITUÍDO" : "";
  let seq = 0;

  return (
    <Document title={code} author={m.issuer.name} creator="DataPulse" producer="DataPulse">
      <Page size="A4" orientation="landscape" style={st.page}>
        <Text style={st.issuer}>{m.issuer.name.toUpperCase()}</Text>
        {m.issuer.taxId ? <Text style={st.taxId}>CPF/CNPJ: {m.issuer.taxId}</Text> : null}

        <View style={st.titleRow}>
          <Text style={st.title}>BOLETIM DE MEDIÇÃO DE SERVIÇOS{statusNote}</Text>
          <Text style={st.code}>{month}</Text>
        </View>

        <View style={st.summary}>
          <View style={st.box}>
            <Text style={st.boxTitle}>IDENTIFICAÇÃO</Text>
            <Kv k="Número BM" v={code} />
            <Kv k="Cliente" v={m.client.name} />
            <Kv k="Período de medição" v={m.periodLabel} />
            <Kv k="Data de emissão" v={fmtDate(m.issuedAt)} />
          </View>
          <View style={st.box}>
            <Text style={st.boxTitle}>RESUMO MEDIÇÃO</Text>
            <Kv k="Valor medição anterior" v={m.previousTotal ? BRL(m.previousTotal) : "-"} />
            <Kv k="Valor A1 equivalente" v={m.totals.uniformA1Price != null ? BRL(m.totals.uniformA1Price) : "conforme item"} />
            <Kv k="Quant. A1 equiv." v={A1(m.totals.a1Measured)} />
            <Kv k="Total formatos" v={BRL(m.totals.formats)} />
            <Kv k="Total outros" v={m.totals.others ? BRL(m.totals.others) : "-"} />
            <Kv k="Total medição período" v={BRL(m.totals.total)} />
          </View>
        </View>

        <View style={st.table}>
          <View style={st.th} fixed>
            {COLS.map((c, i) => (
              <Text key={c.header} style={[st.thText, cell(i)]}>
                {c.header}
              </Text>
            ))}
          </View>
          {groups.map((g) => {
            const sub = g.items.reduce((a, it) => a + it.amount, 0);
            return (
              <View key={g.key}>
                <Text style={st.group} minPresenceAhead={20}>
                  {g.title}
                </Text>
                {g.items.map((it) => {
                  seq += 1;
                  const fmt = it.kind === "FORMAT";
                  const values = [
                    String(seq),
                    it.serviceNumber ?? "",
                    it.seOsg ?? "",
                    fmtDate(it.executionDate),
                    `${it.documentNumber ?? ""}${it.revisionName ? `-${it.revisionName}` : ""}`,
                    it.description,
                    fmt ? it.sheetFormat ?? "" : it.unit ?? "",
                    fmt ? String(it.sheetCount) : it.quantity.toLocaleString("pt-BR"),
                    PCT(it.percent),
                    fmt ? A1(it.quantity * (it.percent / 100)) : "",
                    BRL(it.amount),
                  ];
                  return (
                    <View key={it.id} style={st.tr} wrap={false}>
                      {values.map((v, i) => (
                        <Text key={i} style={[st.td, cell(i)]}>
                          {v === "-" ? "" : v}
                        </Text>
                      ))}
                    </View>
                  );
                })}
                {groups.length > 1 ? (
                  <View style={st.subtotal}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>Subtotal: {BRL(sub)}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={st.total} wrap={false}>
          <Text style={st.totalText}>TOTAL GERAL</Text>
          <Text style={st.totalText}>{BRL(m.totals.total)}</Text>
        </View>
        {m.notes ? <Text style={st.notes}>Nota: {m.notes}</Text> : null}

        <View style={st.footer} fixed>
          <Text>
            {code} · Situação: {MEASUREMENT_STATUS_LABEL[m.status]} · Valores em reais (BRL) · Gerado em {fmtDate(generatedAt)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
