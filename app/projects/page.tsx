import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleProjectStatus } from "@/app/actions/projects";
import { Button, DRIBadge, Empty } from "@/components/ui";
import { Toolbar, Th, Td, RowCheckbox, StatusToggle, StatusDot, CollapsibleGroup, RowActions } from "@/components/table-ui";
import { formatCurrency, formatDate, toNumber } from "@/lib/format";
import type { ProjectTableRow } from "@/types/models";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

function summarize(p: ProjectTableRow) {
  const projectScore = p.driScores[0]?.score ?? 0;
  const hasData = p.driScores.length > 0 && p._count.milestones > 0;

  let dominant: { name: string; score: number } | null = null;
  let humanSignals = 0;
  let systemicSignals = 0;
  let economicImpact = 0;

  for (const m of p.milestones) {
    const score = m.driScores[0]?.score ?? 0;
    if (!dominant || score > dominant.score) dominant = { name: m.name, score };
    humanSignals += m._count.humanSignals;
    systemicSignals += m._count.systemicSignals;
    economicImpact += toNumber(m.economicImpact) ?? 0;
  }

  return { projectScore, hasData, dominant, humanSignals, systemicSignals, economicImpact };
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const projects: ProjectTableRow[] = await prisma.project.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { client: { contains: q, mode: "insensitive" } },
            { sector: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { milestones: true } },
      driScores: { where: { milestoneId: null }, orderBy: { calculatedAt: "desc" }, take: 1 },
      milestones: {
        select: {
          id: true,
          name: true,
          economicImpact: true,
          driScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
          _count: { select: { humanSignals: true, systemicSignals: true } },
        },
      },
    },
  });

  const withData = projects.filter((p) => summarize(p).hasData);
  const drafts = projects.filter((p) => !summarize(p).hasData);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <h1 className="text-xl font-semibold tracking-tight">Projetos</h1>
        <Link href="/projects/new">
          <Button>
            <Plus size={15} />
            Criar
          </Button>
        </Link>
      </div>

      <div className="mt-3">
        <Toolbar placeholder="Pesquisar por nome, cliente ou setor" />
      </div>

      {projects.length === 0 ? (
        <div className="p-6">
          <Empty>Nenhum projeto encontrado. Crie o primeiro em &ldquo;Criar&rdquo;.</Empty>
        </div>
      ) : (
        <div className="dp-scroll overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-canvas">
              <tr>
                <Th className="w-8">
                  <RowCheckbox />
                </Th>
                <Th className="w-10">Ativar/des</Th>
                <Th className="min-w-[220px]">Nome</Th>
                <Th>Status</Th>
                <Th>DRI</Th>
                <Th className="min-w-[200px]">Restrição dominante</Th>
                <Th align="right">Impacto econômico</Th>
                <Th align="right">Marcos</Th>
                <Th align="right">Sinais humanos</Th>
                <Th align="right">Sinais sistêmicos</Th>
                <Th>Atualizado</Th>
              </tr>
            </thead>
            <tbody>
              <CollapsibleGroup label="projeto(s) sem dados suficientes" count={drafts.length}>
                {drafts.map((p) => (
                  <ProjectRow key={p.id} project={p} />
                ))}
              </CollapsibleGroup>

              {withData.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project: p }: { project: ProjectTableRow }) {
  const { projectScore, hasData, dominant, humanSignals, systemicSignals, economicImpact } =
    summarize(p);

  return (
    <tr className="group border-b border-line last:border-0 hover:bg-canvas/60">
      <Td>
        <RowCheckbox />
      </Td>
      <Td>
        <StatusToggle
          action={toggleProjectStatus}
          id={p.id}
          fieldName="projectId"
          checked={p.status === "ACTIVE"}
          disabled={p.status === "CLOSED"}
        />
      </Td>
      <Td className="max-w-[280px]">
        <Link href={`/projects/${p.id}`} className="font-medium text-ink hover:text-accent">
          {p.name}
        </Link>
        <p className="truncate text-xs text-ink-faint">
          {[p.client, p.sector].filter(Boolean).join(" · ") || "Sem cliente definido"}
        </p>
        <RowActions>
          <Link href={`/projects/${p.id}`}>Ver detalhes</Link>
          <Link href={`/projects/${p.id}/import`}>Importar</Link>
        </RowActions>
      </Td>
      <Td>
        <StatusDot status={hasData ? p.status : "ERROR"} />
      </Td>
      <Td>{hasData ? <DRIBadge score={projectScore} showLabel={false} /> : <span className="text-ink-faint">—</span>}</Td>
      <Td className="max-w-[220px]">
        {dominant && dominant.score > 0 ? (
          <span className="truncate text-ink-soft">{dominant.name}</span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </Td>
      <Td align="right">{formatCurrency(economicImpact || null, p.currency)}</Td>
      <Td align="right">{p._count.milestones}</Td>
      <Td align="right">{humanSignals}</Td>
      <Td align="right">{systemicSignals}</Td>
      <Td className="text-ink-faint">
        {p.driScores[0] ? formatDate(p.driScores[0].calculatedAt) : "—"}
      </Td>
    </tr>
  );
}
