import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { MeetingReport } from "@/lib/reports";
import { MEETING_TOPIC_CATEGORIES, meetingCategoryLabel, topicResponsibleLabel } from "@/lib/meetings";
import { fmtDate, fmtDateTime, COLORS } from "./pdf-kit";

/**
 * Ata no padrão de formulário controlado do cliente (MRS) — visual
 * ajustado (22/09/2026) para o modelo real da MRS enviado em PDF
 * ("Padrão Ata.pdf"): título emoldurado, bloco de identificação em grade,
 * barra teal (#006666, cor extraída por amostragem de pixel do PDF
 * original) para "Ata de Reunião e Lista De Ações" e para as seções,
 * cabeçalho de tabela em preto, grade cinza (#A6A6A6) nas células — e
 * a mesma divisão em duas páginas (Lista de Presença / Ata).
 *
 * Ajuste só de estilo, por decisão do usuário: os CAMPOS continuam os que
 * o DataPulse já coleta hoje (participante: nome/empresa/e-mail/modo; tópico nas
 * 4 seções da ata MRS — Assuntos Gerais, Planejamento, Engenharia, Outros —
 * com subtítulo opcional em teal, Responsável/Data/Sts como no original). O PDF real da MRS tem campos que o DataPulse não
 * tem ainda (contato/presença do participante, "Tipo de Reunião",
 * seções de título livre, "Cópias para", "Anexos da Reunião") — essas
 * seções sem dado correspondente foram deixadas de fora em vez de
 * aparecerem sempre vazias. "Tipo de Reunião" reaproveita `title`.
 */

const TEAL = "#006666";
const GRID = "#A6A6A6";
const BLACK = "#111111";

const cs = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: "#1A1A1A",
    paddingTop: 26,
    paddingBottom: 34,
    paddingHorizontal: 26,
  },
  titleBox: {
    borderWidth: 1,
    borderColor: GRID,
    paddingVertical: 6,
    alignItems: "center",
  },
  titleText: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  metaBlock: {
    flexDirection: "row",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: GRID,
  },
  metaCol: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: GRID,
    padding: 5,
    justifyContent: "center",
  },
  metaColLast: { flex: 1, padding: 5, justifyContent: "center" },
  metaLine: { fontSize: 8.5, marginBottom: 2 },
  metaLabel: { fontFamily: "Helvetica-Bold" },
  tealBarCenter: {
    backgroundColor: TEAL,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: GRID,
    paddingVertical: 4,
    alignItems: "center",
  },
  tealBarCenterText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 9 },
  tealBar: {
    backgroundColor: TEAL,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: GRID,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tealBarText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 9 },
  blackBar: {
    backgroundColor: BLACK,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: GRID,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  blackBarText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8 },
  footer: {
    position: "absolute",
    left: 26,
    right: 26,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: COLORS.faint,
  },
});

type Header = MeetingReport["header"];

function TitleBox({ children }: { children: string }) {
  return (
    <View style={cs.titleBox}>
      <Text style={cs.titleText}>{children}</Text>
    </View>
  );
}

/** Bloco Doc.Nº / Resp. / Tipo de Reunião | Projeto / Local | Data — igual nas duas páginas. */
function IdentificationBlock({ h }: { h: Header }) {
  return (
    <>
      <View style={cs.metaBlock}>
        <View style={cs.metaCol}>
          <Text style={cs.metaLine}>
            <Text style={cs.metaLabel}>Doc.Nº.: </Text>
            {h.number != null ? String(h.number) : "-"}
          </Text>
          <Text style={cs.metaLine}>
            <Text style={cs.metaLabel}>Resp.: </Text>
            {h.preparedBy || "-"}
          </Text>
          <Text style={cs.metaLine}>
            <Text style={cs.metaLabel}>Tipo de Reunião: </Text>
            {h.title || "-"}
          </Text>
        </View>
        <View style={cs.metaCol}>
          <Text style={cs.metaLine}>
            <Text style={cs.metaLabel}>Projeto: </Text>
            {h.projectName}
          </Text>
          <Text style={cs.metaLine}>
            <Text style={cs.metaLabel}>Local: </Text>
            {h.location || "-"}
          </Text>
        </View>
        <View style={cs.metaColLast}>
          <Text style={cs.metaLine}>
            <Text style={cs.metaLabel}>Data: </Text>
            {fmtDate(h.date)}
          </Text>
          {h.startTime ? <Text style={cs.metaLine}>{h.startTime}</Text> : null}
        </View>
      </View>
      <View style={cs.tealBarCenter}>
        <Text style={cs.tealBarCenterText}>Ata de Reunião e Lista De Ações</Text>
      </View>
    </>
  );
}

interface Col<T> {
  header: string;
  w: number;
  align?: "left" | "center" | "right";
  render: (row: T) => React.ReactNode;
}

/** Tabela com grade cinza e cabeçalho branco — como no formulário original. */
function GridTable<T>({
  columns,
  rows,
  keyOf,
  minRows = 0,
}: {
  columns: Col<T>[];
  rows: T[];
  keyOf: (row: T, i: number) => string;
  minRows?: number;
}) {
  const padRows = Math.max(0, minRows - rows.length);
  const cellStyle = (i: number, w: number) => ({
    flexGrow: w,
    flexBasis: 0,
    borderRightWidth: i < columns.length - 1 ? 1 : 0,
    borderRightColor: GRID,
    padding: 3,
  });
  return (
    <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: GRID }}>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: GRID }} fixed>
        {columns.map((c, i) => (
          <View key={c.header} style={cellStyle(i, c.w)}>
            <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: c.align ?? "center" }}>
              {c.header}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((r, i) => (
        <View
          key={keyOf(r, i)}
          style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: GRID }}
          wrap={false}
        >
          {columns.map((c, ci) => {
            const content = c.render(r);
            return (
              <View key={c.header} style={cellStyle(ci, c.w)}>
                {typeof content === "string" || typeof content === "number" ? (
                  <Text style={{ fontSize: 8, textAlign: c.align ?? "left" }}>{content}</Text>
                ) : (
                  content
                )}
              </View>
            );
          })}
        </View>
      ))}
      {Array.from({ length: padRows }).map((_, i) => (
        <View
          key={`pad-${i}`}
          style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: GRID, minHeight: 13 }}
        >
          {columns.map((c, ci) => (
            <View key={c.header} style={cellStyle(ci, c.w)} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Colunas da tabela da ata no padrão MRS: Item | Descrição | Responsável | Data | Sts. */
const TOPIC_COLS = [
  { header: "Item", w: 0.6 },
  { header: "Descrição", w: 6.4 },
  { header: "Responsável", w: 1.6 },
  { header: "Data", w: 1 },
  { header: "Sts", w: 0.6 },
] as const;

const SECTION_GRAY = "#767171";

function topicCell(i: number) {
  return {
    flexGrow: TOPIC_COLS[i].w,
    flexBasis: 0,
    borderRightWidth: i < TOPIC_COLS.length - 1 ? 1 : 0,
    borderRightColor: GRID,
    padding: 3,
    justifyContent: "center" as const,
  };
}

/** Status como círculo: vazio = em aberto, cheio = concluído, cinza = cancelado. */
function StatusCircle({ status }: { status: string }) {
  const s = status.toUpperCase();
  const fill = s.startsWith("CONCLU") ? BLACK : s === "CANCELADO" ? GRID : "#FFFFFF";
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, borderWidth: 0.8, borderColor: BLACK, backgroundColor: fill }} />
    </View>
  );
}

function Footer({ docTitle, generatedAt }: { docTitle: string; generatedAt: Date }) {
  return (
    <View style={cs.footer} fixed>
      <Text>
        {docTitle} · Gerado pelo DataPulse em {fmtDateTime(generatedAt)}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
    </View>
  );
}

export function MeetingReportClientPdf({ report }: { report: MeetingReport }) {
  const h = report.header;
  const docTitle = `Ata de Reuniao - ${h.title || h.projectName}`;

  return (
    <Document title={docTitle} author="DataPulse" creator="DataPulse" producer="DataPulse">
      {/* Página 1 — Lista de presença */}
      <Page size="A4" style={cs.page}>
        <TitleBox>LISTA DE PRESENÇA</TitleBox>
        <IdentificationBlock h={h} />

        <View style={cs.tealBar}>
          <Text style={cs.tealBarText}>Participantes</Text>
        </View>
        <GridTable
          columns={[
            { header: "Nome", w: 2.4, align: "left", render: (p) => p.name },
            { header: "Empresa", w: 1.2, render: (p) => p.company ?? "-" },
            { header: "E-mail", w: 2.4, render: (p) => p.email ?? "-" },
            { header: "Modo", w: 1.4, render: (p) => p.mode ?? "-" },
          ]}
          rows={report.participants}
          keyOf={(p, i) => `${p.name}-${i}`}
          minRows={8}
        />

        {h.subject ? (
          <>
            <View style={[cs.tealBar, { marginTop: 10 }]}>
              <Text style={cs.tealBarText}>Pauta</Text>
            </View>
            <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: GRID, padding: 6 }}>
              <Text style={{ fontSize: 9 }}>{h.subject}</Text>
            </View>
          </>
        ) : null}

        <Footer docTitle={docTitle} generatedAt={report.generatedAt} />
      </Page>

      {/* Página 2 — Ata (desenvolvimento por categoria) */}
      <Page size="A4" style={cs.page}>
        <TitleBox>ATA DE REUNIÃO</TitleBox>
        <IdentificationBlock h={h} />

        <View style={{ flexDirection: "row", borderWidth: 1, borderTopWidth: 0, borderColor: GRID }} fixed>
          {TOPIC_COLS.map((c, i) => (
            <View
              key={c.header}
              style={{
                flexGrow: c.w,
                flexBasis: 0,
                backgroundColor: TEAL,
                borderRightWidth: i < TOPIC_COLS.length - 1 ? 1 : 0,
                borderRightColor: GRID,
                padding: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 7.5,
                  fontFamily: "Helvetica-Bold",
                  color: "#FFFFFF",
                  textAlign: c.header === "Descrição" ? "left" : "center",
                }}
              >
                {c.header}
              </Text>
            </View>
          ))}
        </View>

        {MEETING_TOPIC_CATEGORIES.map((cat, catIndex) => {
          const group = report.topicGroups.find((g) => g.category === cat);
          const n = catIndex + 1;
          return (
            <View key={cat}>
              <View style={{ flexDirection: "row", backgroundColor: SECTION_GRAY, borderWidth: 1, borderTopWidth: 0, borderColor: GRID }} wrap={false}>
                <View style={{ flexGrow: TOPIC_COLS[0].w, flexBasis: 0, padding: 3 }}>
                  <Text style={{ ...cs.blackBarText, textAlign: "center" }}>{n}</Text>
                </View>
                <View style={{ flexGrow: TOPIC_COLS.slice(1).reduce((a, c) => a + c.w, 0), flexBasis: 0, padding: 3 }}>
                  <Text style={cs.blackBarText}>{meetingCategoryLabel(cat)}</Text>
                </View>
              </View>
              {(group?.items ?? []).map((t, i) => (
                <View
                  key={`${cat}-${i}`}
                  style={{ flexDirection: "row", borderWidth: 1, borderTopWidth: 0, borderColor: GRID }}
                  wrap={false}
                >
                  <View style={topicCell(0)}>
                    <Text style={{ fontSize: 8, textAlign: "center" }}>{`${n}.${i + 1}`}</Text>
                  </View>
                  <View style={topicCell(1)}>
                    {t.title ? (
                      <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 1 }}>{t.title}</Text>
                    ) : null}
                    <Text style={{ fontSize: 8, textAlign: "justify" }}>
                      {t.date ? <Text style={{ fontFamily: "Helvetica-Bold" }}>{`${fmtDate(t.date)}: `}</Text> : null}
                      {t.description}
                    </Text>
                  </View>
                  <View style={topicCell(2)}>
                    <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "center" }}>
                      {topicResponsibleLabel(t)}
                    </Text>
                  </View>
                  <View style={topicCell(3)}>
                    <Text style={{ fontSize: 8, textAlign: "center" }}>{t.dueDate ? fmtDate(t.dueDate) : ""}</Text>
                  </View>
                  <View style={topicCell(4)}>
                    <StatusCircle status={t.status} />
                  </View>
                </View>
              ))}
            </View>
          );
        })}

        {h.diverseSubjects ? (
          <>
            <View style={[cs.tealBar, { marginTop: 10 }]}>
              <Text style={cs.tealBarText}>Assuntos diversos</Text>
            </View>
            <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: GRID, padding: 6 }}>
              <Text style={{ fontSize: 9 }}>{h.diverseSubjects}</Text>
            </View>
          </>
        ) : null}

        <Footer docTitle={docTitle} generatedAt={report.generatedAt} />
      </Page>
    </Document>
  );
}
