import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { MeetingReport } from "@/lib/reports";
import { MEETING_TOPIC_CATEGORIES } from "@/lib/meetings";
import { COLORS, ReportDocument, SectionTitle, Table, fmtDate } from "./pdf-kit";

function BlockField({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ marginRight: 16, marginBottom: 6, minWidth: 90 }}>
      <Text style={{ fontSize: 7, color: COLORS.faint }}>{label}</Text>
      <Text style={{ fontSize: 9 }}>{value || "-"}</Text>
    </View>
  );
}

function ParticipantColumn({ rows }: { rows: { name: string; company: string | null; mode: string | null }[] }) {
  return (
    <Table
      columns={[
        { header: "Participantes", w: 3, render: (p) => p.name },
        { header: "Empresa", w: 1.6, render: (p) => p.company ?? "-" },
        { header: "Assinatura", w: 1.6, render: (p) => p.mode ?? "-" },
      ]}
      rows={rows}
      keyOf={(p, i) => `${p.name}-${i}`}
      empty=""
    />
  );
}

/**
 * Ata no padrão de formulário controlado do cliente (ex.: MRS,
 * FOR-DPO-0040) — mesma forma do documento em Excel que a organização usa
 * hoje: bloco de identificação, participantes em duas colunas com
 * "assinatura", pauta e desenvolvimento sempre com as 5 categorias fixas
 * (Segurança, Meio Ambiente, Qualidade, Planejamento, Engenharia), mesmo
 * vazias. `header.meetingFormCode` traz o código/validade/classificação —
 * cadastrado no cliente (Cadastros > Clientes), não fixo no código.
 */
export function MeetingReportClientPdf({ report }: { report: MeetingReport }) {
  const h = report.header;
  const half = Math.ceil(report.participants.length / 2);
  const colA = report.participants.slice(0, half);
  const colB = report.participants.slice(half);
  const outros = report.topicGroups.find((g) => g.category === "OUTROS");

  return (
    <ReportDocument
      docTitle={`Ata de Reuniao - ${h.title || h.projectName}`}
      title="Formulário — Ata de Reunião"
      subtitle={h.meetingFormCode ?? undefined}
      generatedAt={report.generatedAt}
    >
      <Text style={{ fontSize: 7.5, color: COLORS.faint, marginBottom: 8 }}>
        Consulte os GEDs e certifique-se de que esta é a versão atual deste documento.
      </Text>

      <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8 }}>
        {h.title || h.subject || h.projectName}
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: COLORS.line,
          paddingVertical: 6,
        }}
      >
        <BlockField label="Data de realização" value={fmtDate(h.date)} />
        <BlockField label="Local" value={h.location} />
        <BlockField label="Horário" value={h.startTime} />
        <BlockField label="Elaborado por" value={h.preparedBy} />
        <BlockField label="Número da Ata" value={h.number != null ? String(h.number) : null} />
        <BlockField label="Cliente" value={h.clientName} />
      </View>

      <SectionTitle>Participantes</SectionTitle>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <ParticipantColumn rows={colA} />
        </View>
        <View style={{ flex: 1 }}>
          <ParticipantColumn rows={colB} />
        </View>
      </View>

      <SectionTitle>Pauta</SectionTitle>
      <Text style={{ fontSize: 9 }}>{h.subject || "-"}</Text>

      <SectionTitle>Desenvolvimento</SectionTitle>
      {MEETING_TOPIC_CATEGORIES.map((cat) => {
        const group = report.topicGroups.find((g) => g.category === cat);
        return (
          <View key={cat} style={{ marginBottom: 6 }} wrap={false}>
            <Text
              style={{
                fontSize: 8,
                fontFamily: "Helvetica-Bold",
                backgroundColor: COLORS.surface,
                padding: 3,
                borderWidth: 1,
                borderColor: COLORS.line,
              }}
            >
              {cat}
            </Text>
            {group && group.items.length > 0 ? (
              <Table
                columns={[
                  { header: "Data", w: 1, render: (t) => fmtDate(t.date) },
                  { header: "O que?", w: 4, render: (t) => t.description },
                  { header: "Quem?", w: 1.6, render: (t) => t.responsible ?? "-" },
                  { header: "Quando?", w: 1, render: (t) => fmtDate(t.dueDate) },
                  { header: "Status", w: 1.2, render: (t) => t.status },
                ]}
                rows={group.items}
                keyOf={(t, i) => `${cat}-${i}`}
              />
            ) : null}
          </View>
        );
      })}
      {outros ? (
        <View style={{ marginBottom: 6 }}>
          <Text
            style={{
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              backgroundColor: COLORS.surface,
              padding: 3,
              borderWidth: 1,
              borderColor: COLORS.line,
            }}
          >
            OUTROS
          </Text>
          <Table
            columns={[
              { header: "Data", w: 1, render: (t) => fmtDate(t.date) },
              { header: "O que?", w: 4, render: (t) => t.description },
              { header: "Quem?", w: 1.6, render: (t) => t.responsible ?? "-" },
              { header: "Quando?", w: 1, render: (t) => fmtDate(t.dueDate) },
              { header: "Status", w: 1.2, render: (t) => t.status },
            ]}
            rows={outros.items}
            keyOf={(t, i) => `outros-${i}`}
          />
        </View>
      ) : null}

      {h.diverseSubjects ? (
        <>
          <SectionTitle>Assuntos diversos</SectionTitle>
          <Text style={{ fontSize: 9 }}>{h.diverseSubjects}</Text>
        </>
      ) : null}
    </ReportDocument>
  );
}
