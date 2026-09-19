import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { PortfolioReport, PortfolioRow } from "@/lib/reports";
import {
  COLORS,
  DriPill,
  HealthPill,
  Kpi,
  ProgressBar,
  ReportDocument,
  SectionTitle,
  Table,
  deltaColor,
  fmtDelta,
  fmtNum,
  projectStatusLabel,
  s,
  type Column,
} from "./pdf-kit";

/**
 * Carteira: uma página de leitura para reunião de acompanhamento.
 * Responde "onde estão as restrições?" e "o que piorou desde a semana passada?".
 */
export function PortfolioReportPdf({ report }: { report: PortfolioReport }) {
  const t = report.totals;

  const columns: Column<PortfolioRow>[] = [
    {
      header: "Projeto",
      w: 4,
      render: (r) => (
        <View>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{r.name}</Text>
          <Text style={{ fontSize: 7.5, color: COLORS.faint }}>
            {[r.clientName, r.status !== "ACTIVE" ? projectStatusLabel(r.status) : null]
              .filter(Boolean)
              .join(" · ") || " "}
          </Text>
        </View>
      ),
    },
    { header: "DRI", w: 3, render: (r) => <DriPill score={r.dri} band={r.band} /> },
    {
      header: "Var. 7d",
      w: 1.2,
      align: "right",
      render: (r) => (
        <Text style={{ color: deltaColor(r.delta), fontFamily: "Helvetica-Bold" }}>{fmtDelta(r.delta)}</Text>
      ),
    },
    { header: "Cronograma", w: 2.6, render: (r) => <HealthPill health={r.health} /> },
    { header: "Avanço", w: 2.2, render: (r) => <ProgressBar value={r.progress} width={44} /> },
    { header: "Atrasadas", w: 1.3, align: "right", render: (r) => String(r.overdueTasks) },
    { header: "Impedim.", w: 1.3, align: "right", render: (r) => String(r.openImpediments) },
    { header: "Solic. venc.", w: 1.5, align: "right", render: (r) => String(r.overdueRequests) },
    { header: "Em análise 14d+", w: 2, align: "right", render: (r) => String(r.stalledReviews) },
    { header: "Restrição dominante", w: 4, render: (r) => r.dominant ?? "-" },
  ];

  return (
    <ReportDocument
      docTitle="Relatório da carteira"
      title="Relatório da carteira"
      subtitle={`${t.projects} projeto(s), ${t.active} ativo(s). Ordenado do maior DRI para o menor: quem precisa de atenção vem primeiro.`}
      generatedAt={report.generatedAt}
      orientation="landscape"
    >
      <View style={s.kpiRow}>
        <Kpi value={fmtNum(t.averageDri)} label="DRI médio (ativos)" note="0 a 100, maior = pior" />
        <Kpi
          value={String(t.critical + t.high)}
          label="Projetos em restrição"
          note={`${t.critical} dominante, ${t.high} provável`}
          color={t.critical + t.high > 0 ? COLORS.crit : COLORS.ok}
        />
        <Kpi
          value={String(t.late)}
          label="Cronograma atrasado"
          color={t.late > 0 ? COLORS.crit : COLORS.ok}
        />
        <Kpi
          value={String(t.openImpediments)}
          label="Impedimentos abertos"
          color={t.openImpediments > 0 ? COLORS.high : COLORS.ok}
        />
        <Kpi
          value={String(t.overdueRequests)}
          label="Solicitações vencidas"
          color={t.overdueRequests > 0 ? COLORS.high : COLORS.ok}
        />
        <Kpi
          value={String(t.stalledReviews)}
          label="Revisões paradas"
          note="em análise há 14 dias ou mais"
          color={t.stalledReviews > 0 ? COLORS.high : COLORS.ok}
        />
      </View>

      {report.worsened.length > 0 ? (
        <>
          <SectionTitle hint="Projetos cujo DRI subiu em relação a cerca de 7 dias atrás.">
            O que piorou
          </SectionTitle>
          <Table
            columns={[
              { header: "Projeto", w: 5, render: (r: PortfolioRow) => r.name },
              { header: "DRI atual", w: 3, render: (r: PortfolioRow) => <DriPill score={r.dri} band={r.band} /> },
              {
                header: "Variação",
                w: 1.5,
                align: "right",
                render: (r: PortfolioRow) => (
                  <Text style={{ color: deltaColor(r.delta), fontFamily: "Helvetica-Bold" }}>{fmtDelta(r.delta)}</Text>
                ),
              },
              { header: "Restrição dominante", w: 6, render: (r: PortfolioRow) => r.dominant ?? "-" },
            ]}
            rows={report.worsened}
            keyOf={(r) => r.id}
          />
        </>
      ) : null}

      <SectionTitle hint="DRI e indicadores operacionais de cada projeto.">Todos os projetos</SectionTitle>
      <Table
        columns={columns}
        rows={report.rows}
        keyOf={(r) => r.id}
        empty="Nenhum projeto visível para este usuário."
      />
      <Text style={[s.hint, { marginTop: 8 }]}>
        DRI (DataPulse Restriction Index): 0 a 100, mede onde o projeto trava. Faixas: até 35 estável, 35 a 55 atenção, 55 a 75
        restrição provável, acima de 75 restrição dominante. Projetos sem DRI ainda não tiveram cálculo.
      </Text>
    </ReportDocument>
  );
}
