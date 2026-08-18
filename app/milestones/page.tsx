import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DRIBadge, Empty, CriticalityChip } from "@/components/ui";
import { Toolbar, Th, Td, RowCheckbox, RowActions } from "@/components/table-ui";
import { formatCurrency, formatDate, toNumber } from "@/lib/format";
import type { MilestoneTableRow } from "@/types/models";

export const dynamic = "force-dynamic";

export default async function MilestonesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const milestones: MilestoneTableRow[] = await prisma.milestone.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { type: { contains: q, mode: "insensitive" } },
            { project: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true, currency: true } },
      driScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
      _count: { select: { humanSignals: true, systemicSignals: true } },
    },
  });

  const sorted = [...milestones].sort(
    (a, b) => (b.driScores[0]?.score ?? 0) - (a.driScores[0]?.score ?? 0),
  );

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Marcos</h1>
          <p className="text-sm text-ink-soft">
            Todos os marcos, de todos os projetos, ordenados por restrição.
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Toolbar placeholder="Pesquisar por marco, tipo ou projeto" />
      </div>

      {sorted.length === 0 ? (
        <div className="p-6">
          <Empty>Nenhum marco encontrado.</Empty>
        </div>
      ) : (
        <div className="dp-scroll overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-canvas">
              <tr>
                <Th className="w-8">
                  <RowCheckbox />
                </Th>
                <Th className="min-w-[220px]">Marco</Th>
                <Th className="min-w-[180px]">Projeto</Th>
                <Th>Criticidade</Th>
                <Th>DRI</Th>
                <Th>Planejado</Th>
                <Th>Real</Th>
                <Th align="right">Impacto econômico</Th>
                <Th align="right">Sinais humanos</Th>
                <Th align="right">Sinais sistêmicos</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr
                  key={m.id}
                  className="group border-b border-line last:border-0 hover:bg-canvas/60"
                >
                  <Td>
                    <RowCheckbox />
                  </Td>
                  <Td className="max-w-[260px]">
                    <Link
                      href={`/projects/${m.project.id}/milestones/${m.id}`}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {m.name}
                    </Link>
                    {m.type ? <p className="truncate text-xs text-ink-faint">{m.type}</p> : null}
                    <RowActions>
                      <Link href={`/projects/${m.project.id}/milestones/${m.id}`}>
                        Avaliar agora
                      </Link>
                    </RowActions>
                  </Td>
                  <Td className="max-w-[200px]">
                    <Link
                      href={`/projects/${m.project.id}`}
                      className="truncate text-ink-soft hover:text-accent"
                    >
                      {m.project.name}
                    </Link>
                  </Td>
                  <Td>
                    <CriticalityChip value={m.criticality} />
                  </Td>
                  <Td>
                    {m.driScores[0] ? (
                      <DRIBadge score={m.driScores[0].score} showLabel={false} />
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                  <Td className="text-ink-faint">{formatDate(m.plannedDate)}</Td>
                  <Td className="text-ink-faint">{formatDate(m.actualDate)}</Td>
                  <Td align="right">
                    {formatCurrency(toNumber(m.economicImpact), m.project.currency)}
                  </Td>
                  <Td align="right">{m._count.humanSignals}</Td>
                  <Td align="right">{m._count.systemicSignals}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
