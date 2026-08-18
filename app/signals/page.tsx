import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Empty } from "@/components/ui";
import { Toolbar, Th, Td, RowCheckbox } from "@/components/table-ui";
import { SignalTabs } from "@/components/signal-tabs";
import { formatCurrency, formatDateTime, toNumber } from "@/lib/format";
import type { HumanSignalTableRow, SystemicSignalTableRow } from "@/types/models";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  CSV: "CSV",
  XLSX: "XLSX",
  GOOGLE_SHEETS: "Google Sheets",
  ACC: "ACC",
  MANUAL: "Manual",
};

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ layer?: string; q?: string }>;
}) {
  const { layer, q } = await searchParams;
  const current = layer === "systemic" ? "systemic" : "human";

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="px-4 pt-4">
        <h1 className="text-xl font-semibold tracking-tight">Sinais</h1>
        <p className="text-sm text-ink-soft">
          Camada 2 (percepção humana) e Camada 1 (dados importados), lado a lado.
        </p>
      </div>

      <div className="mt-3">
        <SignalTabs current={current} />
      </div>

      <div>
        <Toolbar
          placeholder={
            current === "human"
              ? "Pesquisar por marco, projeto ou papel"
              : "Pesquisar por marco, projeto ou origem"
          }
        />
      </div>

      {current === "human" ? <HumanSignalsTable q={q} /> : <SystemicSignalsTable q={q} />}
    </div>
  );
}

async function HumanSignalsTable({ q }: { q?: string }) {
  const signals: HumanSignalTableRow[] = await prisma.humanSignal.findMany({
    where: q
      ? {
          OR: [
            { respondentRole: { contains: q, mode: "insensitive" } },
            { perceivedBottleneck: { contains: q, mode: "insensitive" } },
            { milestone: { name: { contains: q, mode: "insensitive" } } },
            { milestone: { project: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      milestone: {
        select: { id: true, name: true, project: { select: { id: true, name: true } } },
      },
    },
  });

  if (signals.length === 0) {
    return (
      <div className="p-6">
        <Empty>Nenhum sinal humano registrado ainda.</Empty>
      </div>
    );
  }

  return (
    <div className="dp-scroll overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="border-b border-line bg-canvas">
          <tr>
            <Th className="w-8">
              <RowCheckbox />
            </Th>
            <Th className="min-w-[200px]">Marco</Th>
            <Th className="min-w-[160px]">Projeto</Th>
            <Th align="right">Falha</Th>
            <Th align="right">Confiança</Th>
            <Th>Papel</Th>
            <Th className="min-w-[260px]">Gargalo percebido</Th>
            <Th>Travado</Th>
            <Th>Registrado em</Th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
              <Td>
                <RowCheckbox />
              </Td>
              <Td className="max-w-[220px]">
                <Link
                  href={`/projects/${s.milestone.project.id}/milestones/${s.milestone.id}`}
                  className="truncate font-medium text-ink hover:text-accent"
                >
                  {s.milestone.name}
                </Link>
              </Td>
              <Td className="text-ink-soft">{s.milestone.project.name}</Td>
              <Td align="right">{s.failureProbability}%</Td>
              <Td align="right">{s.planConfidence}/5</Td>
              <Td className="text-ink-soft">{s.respondentRole ?? "—"}</Td>
              <Td className="max-w-[320px] truncate text-ink-soft">
                {s.perceivedBottleneck ?? "—"}
              </Td>
              <Td>{s.blockedDecision ? "Sim" : "—"}</Td>
              <Td className="text-ink-faint">{formatDateTime(s.createdAt)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function SystemicSignalsTable({ q }: { q?: string }) {
  const signals: SystemicSignalTableRow[] = await prisma.systemicSignal.findMany({
    where: q
      ? {
          OR: [
            { milestone: { name: { contains: q, mode: "insensitive" } } },
            { milestone: { project: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { referenceDate: "desc" },
    take: 100,
    include: {
      milestone: {
        select: {
          id: true,
          name: true,
          project: { select: { id: true, name: true, currency: true } },
        },
      },
    },
  });

  if (signals.length === 0) {
    return (
      <div className="p-6">
        <Empty>Nenhum sinal sistêmico importado ainda.</Empty>
      </div>
    );
  }

  return (
    <div className="dp-scroll overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="border-b border-line bg-canvas">
          <tr>
            <Th className="w-8">
              <RowCheckbox />
            </Th>
            <Th className="min-w-[200px]">Marco</Th>
            <Th className="min-w-[160px]">Projeto</Th>
            <Th>Origem</Th>
            <Th align="right">Atraso (dias)</Th>
            <Th align="right">Custo previsto</Th>
            <Th align="right">Custo realizado</Th>
            <Th align="right">Issues</Th>
            <Th>Referência</Th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
              <Td>
                <RowCheckbox />
              </Td>
              <Td className="max-w-[220px]">
                <Link
                  href={`/projects/${s.milestone.project.id}/milestones/${s.milestone.id}`}
                  className="truncate font-medium text-ink hover:text-accent"
                >
                  {s.milestone.name}
                </Link>
              </Td>
              <Td className="text-ink-soft">{s.milestone.project.name}</Td>
              <Td className="text-ink-soft">{SOURCE_LABEL[s.source] ?? s.source}</Td>
              <Td align="right">{s.delayDays ?? "—"}</Td>
              <Td align="right">
                {formatCurrency(toNumber(s.plannedCost), s.milestone.project.currency)}
              </Td>
              <Td align="right">
                {formatCurrency(toNumber(s.actualCost), s.milestone.project.currency)}
              </Td>
              <Td align="right">{s.openIssues ?? "—"}</Td>
              <Td className="text-ink-faint">{formatDateTime(s.referenceDate)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
