import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ProjectReport, ProjectTaskRow } from "@/lib/reports";
import {
  COLORS,
  DriPill,
  HealthPill,
  Kpi,
  ProgressBar,
  ReportDocument,
  SectionTitle,
  Sparkline,
  Table,
  TaskStatusPill,
  deltaColor,
  fmtDate,
  fmtDelta,
  fmtNum,
  projectStatusLabel,
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
 * Projeto: relatório de status. Serve à reunião interna e, sem alterações,
 * ao cliente: o que está travando, o prazo, o que se espera de quem.
 */
export function ProjectReportPdf({ report }: { report: ProjectReport }) {
  const p = report.project;
  const c = report.counts;
  const docs = report.documents;

  return (
    <ReportDocument
      docTitle={`Status do projeto - ${p.name}`}
      title={p.name}
      subtitle={`Relatório de status do projeto${p.osNumber ? ` · OS ${p.osNumber}` : ""}`}
      generatedAt={report.generatedAt}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Field label="Cliente" value={p.clientName} />
        <Field label="Setor" value={p.sectorName} />
        <Field label="Projetista" value={p.designFirmName} />
        <Field label="Gerente" value={p.managerName} />
        <Field label="Situação" value={projectStatusLabel(p.status)} />
      </View>

      <View style={[s.kpiRow, { marginTop: 6 }]} wrap={false}>
        <View style={[s.kpi, { flexGrow: 2 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={s.kpiValue}>{fmtNum(report.dri.latest)}</Text>
            <DriPill score={report.dri.latest} band={report.dri.band} />
          </View>
          <Text style={s.kpiLabel}>
            DRI atual
            {report.dri.delta != null ? (
              <Text style={{ color: deltaColor(report.dri.delta) }}> ({fmtDelta(report.dri.delta)} em 7 dias)</Text>
            ) : null}
          </Text>
          <View style={{ marginTop: 5 }}>
            <Sparkline points={report.dri.trend} width={150} height={44} />
          </View>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiValue}>{report.progress == null ? "-" : `${report.progress}%`}</Text>
          <Text style={s.kpiLabel}>Avanço físico</Text>
          <Text style={s.kpiNote}>
            {c.done} de {c.tasks} tarefas concluídas
          </Text>
          <View style={{ marginTop: 6 }}>
            <HealthPill health={report.health} />
          </View>
        </View>
        <View style={s.kpi}>
          <Text style={[s.kpiValue, { color: c.overdue > 0 ? COLORS.crit : COLORS.ok }]}>{c.overdue}</Text>
          <Text style={s.kpiLabel}>Tarefas atrasadas</Text>
          <Text style={s.kpiNote}>{c.blocked} impedida(s)</Text>
        </View>
        <View style={s.kpi}>
          <Text style={[s.kpiValue, { color: c.openImpediments > 0 ? COLORS.high : COLORS.ok }]}>
            {c.openImpediments}
          </Text>
          <Text style={s.kpiLabel}>Impedimentos abertos</Text>
          <Text style={s.kpiNote}>
            {c.pendingRequests} solicitação(ões) pendente(s), {c.overdueRequests} vencida(s)
          </Text>
        </View>
      </View>

      <SectionTitle hint="Tarefas em aberto com maior DRI: onde o projeto trava hoje.">
        Restrições dominantes
      </SectionTitle>
      <Table
        columns={[
          { header: "Tarefa", w: 5, render: (t) => t.name },
          { header: "Responsável", w: 2.5, render: (t) => t.assigneeName ?? "-" },
          { header: "Status", w: 2, render: (t) => <TaskStatusPill status={t.status} /> },
          { header: "DRI", w: 1.2, align: "right", render: (t) => fmtNum(t.dri) },
        ]}
        rows={report.constraints}
        keyOf={(t) => t.id}
        empty="Sem tarefas em aberto com DRI calculado."
      />

      <SectionTitle hint="Marcos e suas tarefas. Prazo vigente = previsão, se houver; senão a linha de base.">
        Cronograma
      </SectionTitle>
      <Table<ProjectTaskRow>
        columns={[
          {
            header: "Tarefa",
            w: 5,
            render: (t) => (
              <Text style={{ fontFamily: t.isGroup ? "Helvetica-Bold" : "Helvetica", marginLeft: t.isChild ? 10 : 0 }}>
                {t.name}
                {t.isPackage ? "  [pacote]" : ""}
              </Text>
            ),
          },
          { header: "Responsável", w: 2.2, render: (t) => t.assigneeName ?? "-" },
          { header: "Status", w: 2.3, render: (t) => <TaskStatusPill status={t.status} /> },
          { header: "Avanço", w: 2, render: (t) => <ProgressBar value={t.progress} width={36} /> },
          { header: "Planejado", w: 1.5, render: (t) => fmtDate(t.plannedDate) },
          {
            header: "Previsto / real",
            w: 1.7,
            render: (t) => (
              <Text style={{ color: t.overdue ? COLORS.crit : COLORS.ink }}>
                {fmtDate(t.actualDate ?? t.forecastDate)}
              </Text>
            ),
          },
          {
            header: "Desvio",
            w: 1.1,
            align: "right",
            render: (t) =>
              t.slip == null || t.slip === 0 ? (
                "-"
              ) : (
                <Text style={{ color: t.slip > 0 ? COLORS.crit : COLORS.ok }}>
                  {t.slip > 0 ? "+" : ""}
                  {t.slip}d
                </Text>
              ),
          },
        ]}
        rows={report.tasks}
        keyOf={(t) => t.id}
        empty="Nenhuma tarefa cadastrada."
        rowStyle={(t) => (t.isGroup ? { backgroundColor: COLORS.surface } : undefined)}
      />

      <SectionTitle hint="Bloqueios ativos: o que falta e de quem se depende.">Impedimentos abertos</SectionTitle>
      <Table
        columns={[
          { header: "Tarefa", w: 3, render: (i) => i.taskName },
          { header: "Impedimento", w: 5, render: (i) => i.description },
          { header: "Aguardando", w: 2.2, render: (i) => i.waitingOn ?? "-" },
          { header: "Responsável", w: 2, render: (i) => i.ownerName ?? "-" },
          { header: "Dias", w: 0.9, align: "right", render: (i) => String(i.daysOpen) },
        ]}
        rows={report.impediments}
        keyOf={(i) => i.id}
        empty="Nenhum impedimento aberto."
      />

      <SectionTitle hint="Pendências externas em acompanhamento. Vencidas primeiro.">
        Solicitações pendentes
      </SectionTitle>
      <Table
        columns={[
          { header: "Solicitação", w: 5, render: (r) => r.description },
          { header: "Tarefa", w: 3, render: (r) => r.taskName ?? "-" },
          { header: "Aguardando", w: 2, render: (r) => r.waitingOn ?? "-" },
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
        empty="Nenhuma solicitação pendente."
      />

      <SectionTitle hint="Situação da revisão vigente de cada documento.">Situação documental</SectionTitle>
      {docs.totalDocuments === 0 ? (
        <Text style={s.empty}>Nenhum documento cadastrado.</Text>
      ) : (
        <>
          <View style={s.kpiRow} wrap={false}>
            <Kpi value={String(docs.totalDocuments)} label="Documentos" />
            <Kpi
              value={docs.approvedPct == null ? "-" : `${docs.approvedPct}%`}
              label="Aprovados"
              note={`${docs.approved} documento(s)`}
              color={COLORS.ok}
            />
            <Kpi value={String(docs.inReview)} label="Em análise" note={`${docs.stalled} parado(s) há 14+ dias`} />
            <Kpi value={String(docs.returned)} label="Devolvidos ao emissor" note="aguardam nova revisão" />
            <Kpi value={fmtNum(docs.averageRevisions)} label="Revisões por documento" note="média" />
          </View>
          <View style={{ height: 8 }} />
          <Table
            columns={[
              { header: "Disciplina", w: 3, render: (d) => d.tag },
              { header: "Documentos", w: 2, align: "right", render: (d) => String(d.total) },
              { header: "Aprovados", w: 2, align: "right", render: (d) => String(d.approved) },
              { header: "Em aberto", w: 2, align: "right", render: (d) => String(d.open) },
              {
                header: "Aprovação",
                w: 3,
                render: (d) => <ProgressBar value={d.total ? Math.round((d.approved / d.total) * 100) : 0} width={60} />,
              },
            ]}
            rows={docs.byDiscipline}
            keyOf={(d) => d.tag}
          />
        </>
      )}

      {report.packages.length > 0 ? (
        <>
          <SectionTitle hint="Emissões de documentos. Atrasadas primeiro.">Pacotes de revisão</SectionTitle>
          <Table
            columns={[
              { header: "Pacote", w: 4, render: (k) => k.name },
              { header: "Marco", w: 3, render: (k) => k.parentName ?? "-" },
              { header: "Status", w: 2, render: (k) => <TaskStatusPill status={k.status} /> },
              { header: "Revisões", w: 1.2, align: "right", render: (k) => String(k.revisions) },
              {
                header: "Prazo",
                w: 1.6,
                render: (k) => <Text style={{ color: k.overdue ? COLORS.crit : COLORS.ink }}>{fmtDate(k.dueDate)}</Text>,
              },
            ]}
            rows={report.packages}
            keyOf={(k) => k.id}
          />
        </>
      ) : null}

      {report.reviewQueue.length > 0 ? (
        <>
          <SectionTitle hint="Revisões aguardando parecer, da mais parada para a menos.">Fila de análise</SectionTitle>
          <Table
            columns={[
              { header: "Documento", w: 5, render: (r) => `${r.documentNumber ? r.documentNumber + " - " : ""}${r.documentName}` },
              { header: "Rev.", w: 0.8, render: (r) => r.name },
              { header: "Pacote", w: 3, render: (r) => r.packageName ?? "-" },
              { header: "Analista", w: 2, render: (r) => r.specialistName ?? "-" },
              { header: "Prazo", w: 1.4, render: (r) => fmtDate(r.dueAt) },
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
            rows={report.reviewQueue}
            keyOf={(r) => r.id}
          />
        </>
      ) : null}
    </ReportDocument>
  );
}
