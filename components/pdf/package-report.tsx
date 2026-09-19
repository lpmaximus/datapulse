import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { PackageReport } from "@/lib/reports";
import { ACTION_LABEL, type DocumentAction } from "@/lib/documents";
import {
  COLORS,
  Kpi,
  ProgressBar,
  ReportDocument,
  RevisionStatusPill,
  SectionTitle,
  Table,
  TaskStatusPill,
  fmtDate,
  fmtDateTime,
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
 * Pacote de revisão: protocolo da emissão. O que foi enviado, em que pé está
 * cada documento, quanto tempo parou e o trâmite completo. Pode acompanhar a
 * comunicação com o cliente ou a projetista.
 */
export function PackageReportPdf({ report }: { report: PackageReport }) {
  const h = report.header;
  const c = report.counts;

  return (
    <ReportDocument
      docTitle={`Pacote - ${h.name}`}
      title={h.name}
      subtitle={`Ficha do pacote de revisão · ${h.projectName}${h.projectOsNumber ? ` · OS ${h.projectOsNumber}` : ""}`}
      generatedAt={report.generatedAt}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Field label="Marco" value={h.parentName} />
        <Field label="Cliente" value={h.clientName} />
        <Field label="Projetista" value={h.designFirmName} />
        <Field label="Responsável agora" value={h.assigneeName} />
      </View>

      <View style={[s.kpiRow, { marginTop: 6 }]} wrap={false}>
        <View style={s.kpi}>
          <TaskStatusPill status={h.status} />
          <View style={{ marginTop: 6 }}>
            <ProgressBar value={h.progress} width={70} />
          </View>
          <Text style={s.kpiLabel}>Status do pacote</Text>
        </View>
        <View style={s.kpi}>
          <Text style={[s.kpiValue, { color: h.overdue ? COLORS.crit : COLORS.ink, fontSize: 13 }]}>
            {fmtDate(h.actualDate ?? h.forecastDate ?? h.plannedDate)}
          </Text>
          <Text style={s.kpiLabel}>{h.actualDate ? "Concluído em" : "Prazo vigente"}</Text>
          <Text style={s.kpiNote}>
            Planejado {fmtDate(h.plannedDate)}
            {h.slip ? ` (${h.slip > 0 ? "+" : ""}${h.slip} dias)` : ""}
          </Text>
        </View>
        <Kpi value={String(c.total)} label="Revisões no pacote" note={`${c.approved} aprovada(s), ${c.cancelled} cancelada(s)`} />
        <Kpi
          value={String(c.inReview)}
          label="Em análise"
          note={
            c.longestReviewDays != null
              ? `mais antiga: ${c.longestReviewDays} dias (média ${c.averageReviewDays})`
              : "nenhuma na fila"
          }
          color={(c.longestReviewDays ?? 0) >= 14 ? COLORS.crit : COLORS.ink}
        />
        <Kpi value={String(c.returned)} label="Devolvidas ao emissor" note="comentadas ou reprovadas" />
      </View>

      <SectionTitle hint="Cada linha é uma revisão de documento emitida neste pacote.">Documentos do pacote</SectionTitle>
      <Table
        columns={[
          { header: "Documento", w: 4.6, render: (r) => `${r.documentNumber ? r.documentNumber + " - " : ""}${r.documentName}` },
          { header: "Disc.", w: 1, render: (r) => r.disciplineTag ?? "-" },
          { header: "Rev.", w: 0.9, render: (r) => r.name },
          { header: "Status", w: 2.6, render: (r) => <RevisionStatusPill status={r.status} /> },
          { header: "Parecer", w: 2, render: (r) => r.analysisName ?? r.analysisTag ?? "-" },
          { header: "Analista", w: 2, render: (r) => r.specialistName ?? "-" },
          { header: "Emissão", w: 1.4, render: (r) => fmtDate(r.issuedAt) },
          {
            header: "Prazo",
            w: 1.4,
            render: (r) => <Text style={{ color: r.overdue ? COLORS.crit : COLORS.ink }}>{fmtDate(r.dueAt)}</Text>,
          },
          {
            header: "Parado",
            w: 1,
            align: "right",
            render: (r) => (
              <Text style={{ color: (r.days ?? 0) >= 14 ? COLORS.crit : COLORS.ink }}>
                {r.days == null ? "-" : `${r.days}d`}
              </Text>
            ),
          },
        ]}
        rows={report.revisions}
        keyOf={(r) => r.id}
        empty="Este pacote ainda não tem revisões."
      />

      {report.impediments.length > 0 ? (
        <>
          <SectionTitle>Impedimentos abertos</SectionTitle>
          <Table
            columns={[
              { header: "Impedimento", w: 6, render: (i) => i.description },
              { header: "Aguardando", w: 2.5, render: (i) => i.waitingOn ?? "-" },
              { header: "Responsável", w: 2, render: (i) => i.ownerName ?? "-" },
              { header: "Dias", w: 0.9, align: "right", render: (i) => String(i.daysOpen) },
            ]}
            rows={report.impediments}
            keyOf={(i) => i.id}
          />
        </>
      ) : null}

      {report.requests.length > 0 ? (
        <>
          <SectionTitle>Solicitações pendentes</SectionTitle>
          <Table
            columns={[
              { header: "Solicitação", w: 6, render: (r) => r.description },
              { header: "Aguardando", w: 2.5, render: (r) => r.waitingOn ?? "-" },
              {
                header: "Prazo",
                w: 2,
                render: (r) => (
                  <Text style={{ color: r.overdue ? COLORS.crit : COLORS.ink }}>
                    {fmtDate(r.dueAt)}
                    {r.overdue ? " (vencida)" : ""}
                  </Text>
                ),
              },
            ]}
            rows={report.requests}
            keyOf={(r) => r.id}
          />
        </>
      ) : null}

      {report.deadlineChanges.length > 0 ? (
        <>
          <SectionTitle hint="Toda reprogramação fica registrada.">Histórico de prazo</SectionTitle>
          <Table
            columns={[
              { header: "Registrado em", w: 2.2, render: (d) => fmtDateTime(d.createdAt) },
              { header: "De", w: 1.6, render: (d) => fmtDate(d.fromDate) },
              { header: "Para", w: 1.6, render: (d) => fmtDate(d.toDate) },
              { header: "Motivo", w: 6, render: (d) => d.reason ?? "-" },
            ]}
            rows={report.deadlineChanges}
            keyOf={(d) => String(d.createdAt.getTime())}
          />
        </>
      ) : null}

      <SectionTitle hint="Trilha completa do trâmite, em ordem cronológica.">Histórico de trâmite</SectionTitle>
      <Table
        columns={[
          { header: "Data", w: 2.2, render: (t) => fmtDateTime(t.createdAt) },
          { header: "Documento", w: 3.6, render: (t) => `${t.documentNumber ?? t.documentName} ${t.revisionName}` },
          { header: "Evento", w: 2.8, render: (t) => ACTION_LABEL[t.action as DocumentAction] ?? t.action },
          { header: "Por", w: 2, render: (t) => t.actorName ?? "-" },
          { header: "Para", w: 2, render: (t) => t.assignedToName ?? "-" },
          { header: "Dias na etapa", w: 1.2, align: "right", render: (t) => (t.daysInPreviousStage == null ? "-" : String(t.daysInPreviousStage)) },
          { header: "Comentário", w: 4, render: (t) => t.comment ?? "-" },
        ]}
        rows={report.transitions}
        keyOf={(t) => t.id}
        empty="Sem eventos registrados."
      />
    </ReportDocument>
  );
}
