import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { Empty } from "@/components/ui";
import { ResizableTable, Toolbar, Th, Td, RowCheckbox } from "@/components/table-ui";
import { SignalTabs } from "@/components/signal-tabs";
import { formatCurrency, formatDateTime, toNumber } from "@/lib/format";
import type { HumanSignalTableRow, SystemicSignalTableRow } from "@/types/models";
import { projectVisibility } from "@/lib/visibility";
import type { SessionUser } from "@/lib/session";

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
  const user = await requireUser("/signals");
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
              ? "Pesquisar por tarefa, projeto ou papel"
              : "Pesquisar por tarefa, projeto ou origem"
          }
        />
      </div>

      {current === "human" ? (
        <HumanSignalsTable q={q} user={user} />
      ) : (
        <SystemicSignalsTable q={q} user={user} />
      )}
    </div>
  );
}

async function HumanSignalsTable({ q, user }: { q?: string; user: SessionUser }) {
  const signals: HumanSignalTableRow[] = await prisma.humanSignal.findMany({
    where: {
      milestone: { project: projectVisibility(user) },
      ...(q
        ? {
            OR: [
              { respondentRole: { contains: q, mode: "insensitive" } },
              { perceivedBottleneck: { contains: q, mode: "insensitive" } },
              { milestone: { name: { contains: q, mode: "insensitive" } } },
              { milestone: { project: { name: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
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
      <ResizableTable id="signals-human" className="w-full border-collapse">
        <thead className="bg-surface">
          <tr>
            <Th className="w-8">
              <RowCheckbox />
            </Th>
            <Th className="min-w-[200px]">Tarefa</Th>
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
                  href={`/projects/${s.milestone.project.id}/tasks/${s.milestone.id}`}
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
      </ResizableTable>
    </div>
  );
}

async function SystemicSignalsTable({ q, user }: { q?: string; user: SessionUser }) {
  const signals: SystemicSignalTableRow[] = await prisma.systemicSignal.findMany({
    where: {
      milestone: { project: projectVisibility(user) },
      ...(q
        ? {
            OR: [
              { milestone: { name: { contains: q, mode: "insensitive" } } },
              { milestone: { project: { name: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
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
      <ResizableTable id="signals-systemic" className="w-full border-collapse">
        <thead className="bg-surface">
          <tr>
            <Th className="w-8">
              <RowCheckbox />
            </Th>
            <Th className="min-w-[200px]">Tarefa</Th>
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
                  href={`/projects/${s.milestone.project.id}/tasks/${s.milestone.id}`}
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
      </ResizableTable>
    </div>
  );
}
