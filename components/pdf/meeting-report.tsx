import React from "react";
import { meetingCategoryLabel } from "@/lib/meetings";
import { Text, View } from "@react-pdf/renderer";
import type { MeetingReport } from "@/lib/reports";
import {
  COLORS,
  ReportDocument,
  SectionTitle,
  Table,
  fmtDate,
  s,
} from "./pdf-kit";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ marginRight: 18, marginBottom: 4 }}>
      <Text style={{ fontSize: 7, color: COLORS.faint }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 9 }}>{value || "-"}</Text>
    </View>
  );
}

/**
 * Ata de reunião no modelo DataPulse: cabeçalho, pauta, participantes,
 * desenvolvimento por categoria e as pendências (Solicitações) que a
 * reunião gerou. Sem o rótulo de formulário controlado de nenhum cliente —
 * esse é o modelo do cliente (meeting-report-client.tsx).
 */
export function MeetingReportPdf({ report }: { report: MeetingReport }) {
  const h = report.header;

  return (
    <ReportDocument
      docTitle={`Reuniao - ${h.title || h.projectName}`}
      title={h.title || h.subject || "Reunião de acompanhamento"}
      subtitle={`${h.projectName}${h.projectOsNumber ? ` · OS ${h.projectOsNumber}` : ""}${h.parentName ? ` · ${h.parentName}` : ""}`}
      generatedAt={report.generatedAt}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Field label="Data" value={fmtDate(h.date)} />
        <Field label="Horário" value={h.startTime} />
        <Field label="Local" value={h.location} />
        <Field label="Elaborado por" value={h.preparedBy} />
        {h.number != null ? <Field label="Número da ata" value={String(h.number)} /> : null}
        <Field label="Cliente" value={h.clientName} />
        <Field label="Projetista" value={h.designFirmName} />
      </View>

      {h.subject ? (
        <>
          <SectionTitle>Pauta</SectionTitle>
          <Text style={{ fontSize: 9 }}>{h.subject}</Text>
        </>
      ) : null}

      <SectionTitle hint={`${report.participants.length} pessoa(s)`}>Participantes</SectionTitle>
      <Table
        columns={[
          { header: "Nome", w: 3, render: (p) => p.name },
          { header: "Empresa", w: 2, render: (p) => p.company ?? "-" },
          { header: "E-mail", w: 3, render: (p) => p.email ?? "-" },
          { header: "Como participou", w: 2, render: (p) => p.mode ?? "-" },
        ]}
        rows={report.participants}
        keyOf={(p, i) => `${p.name}-${i}`}
        empty="Nenhum participante registrado."
      />

      {h.summary ? (
        <>
          <SectionTitle>Resumo</SectionTitle>
          <Text style={{ fontSize: 9 }}>{h.summary}</Text>
        </>
      ) : null}

      <SectionTitle hint="Registro do que foi discutido, por categoria">Desenvolvimento</SectionTitle>
      {report.topicGroups.length === 0 ? (
        <Text style={s.empty}>Nenhum tópico registrado.</Text>
      ) : (
        report.topicGroups.map((g) => (
          <View key={g.category} style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: COLORS.soft, marginTop: 4, marginBottom: 2 }}>
              {meetingCategoryLabel(g.category)}
            </Text>
            <Table
              columns={[
                { header: "Data", w: 1, render: (t) => fmtDate(t.date) },
                { header: "O que", w: 4, render: (t) => (t.title ? `${t.title} — ${t.description}` : t.description) },
                { header: "Quem", w: 1.6, render: (t) => t.responsible ?? "-" },
                { header: "Quando", w: 1, render: (t) => fmtDate(t.dueDate) },
                { header: "Status", w: 1.2, render: (t) => t.status },
              ]}
              rows={g.items}
              keyOf={(t, i) => `${g.category}-${i}`}
            />
          </View>
        ))
      )}

      {h.diverseSubjects ? (
        <>
          <SectionTitle>Assuntos diversos</SectionTitle>
          <Text style={{ fontSize: 9 }}>{h.diverseSubjects}</Text>
        </>
      ) : null}

      <SectionTitle hint={`${report.requests.length} pendência(s) geradas nesta reunião`}>
        Pendências (Solicitações)
      </SectionTitle>
      <Table
        columns={[
          { header: "Pendência", w: 3.4, render: (r) => r.description },
          { header: "Depende de", w: 1.6, render: (r) => r.waitingOn ?? "-" },
          { header: "Responsável", w: 1.6, render: (r) => r.ownerName ?? "-" },
          { header: "Prazo", w: 1, render: (r) => fmtDate(r.dueAt) },
          { header: "Status", w: 1.2, render: (r) => r.status },
        ]}
        rows={report.requests}
        keyOf={(r) => r.id}
        empty="Nenhuma pendência gerada nesta reunião."
        rowStyle={(r) => (r.overdue ? { backgroundColor: COLORS.critBg } : {})}
      />
    </ReportDocument>
  );
}
