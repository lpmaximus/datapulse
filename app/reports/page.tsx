import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { Card, DRIBadge, Empty, SectionTitle } from "@/components/ui";
import { ResizableTable, Th, Td } from "@/components/table-ui";
import { formatDate } from "@/lib/format";
import type { ProjectDriHistoryRow } from "@/types/models";
import { ArrowDown, ArrowUp, FileDown, Minus } from "lucide-react";
import { projectVisibility } from "@/lib/visibility";

export const dynamic = "force-dynamic";

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 0.1) {
    return (
      <span className="inline-flex items-center gap-1 text-ink-faint">
        <Minus size={13} /> 0,0
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={
        up
          ? "inline-flex items-center gap-1 text-red-600"
          : "inline-flex items-center gap-1 text-green-600"
      }
    >
      {up ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      {Math.abs(value).toFixed(1)}
    </span>
  );
}

/**
 * Compara o DRI mais recente de cada projeto contra o snapshot mais próximo
 * de 7 dias atrás. Sem ambição de BI completo — o objetivo é responder
 * "o que piorou esta semana", que é a pergunta que importa para o piloto.
 */
export default async function ReportsPage() {
  const user = await requireUser("/reports");

  const projects: ProjectDriHistoryRow[] = await prisma.project.findMany({
    where: projectVisibility(user),
    select: {
      id: true,
      name: true,
      clientRef: { select: { id: true, name: true } },
      driScores: {
        where: { milestoneId: null },
        orderBy: { calculatedAt: "desc" },
        take: 30,
        select: { score: true, calculatedAt: true },
      },
    },
  });

  const WEEK_MS = 7 * 86_400_000;
  const now = Date.now();

  const rows = projects
    .filter((p) => p.driScores.length > 0)
    .map((p) => {
      const latest = p.driScores[0];
      const target = now - WEEK_MS;
      const previous = p.driScores.reduce((closest, s) => {
        const d = Math.abs(s.calculatedAt.getTime() - target);
        const closestD = closest ? Math.abs(closest.calculatedAt.getTime() - target) : Infinity;
        return d < closestD && s.calculatedAt.getTime() !== latest.calculatedAt.getTime()
          ? s
          : closest;
      }, null as (typeof p.driScores)[number] | null);

      return {
        project: p,
        latest,
        previous,
        delta: previous ? latest.score - previous.score : 0,
      };
    })
    .sort((a, b) => b.delta - a.delta);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Variação do DRI na última semana — onde a restrição está se agravando.
        </p>
      </div>

      <div>
        <SectionTitle hint="Abrem em PDF, com os dados do momento e só do que você enxerga.">
          Relatórios em PDF
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm font-medium">Carteira</p>
            <p className="mt-1 text-sm text-ink-soft">
              Todos os projetos lado a lado: DRI, o que piorou na semana, atrasos, impedimentos,
              solicitações vencidas e revisões paradas. Para a reunião de acompanhamento.
            </p>
            <a
              href="/api/reports/portfolio"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <FileDown size={15} /> Gerar PDF da carteira
            </a>
          </Card>
          <Card>
            <p className="text-sm font-medium">Status do projeto</p>
            <p className="mt-1 text-sm text-ink-soft">
              Restrições dominantes, cronograma, impedimentos, solicitações e situação documental.
              Também serve para enviar ao cliente. Use o botão na tabela abaixo ou na página do projeto.
            </p>
          </Card>
          <Card>
            <p className="text-sm font-medium">Ficha do pacote</p>
            <p className="mt-1 text-sm text-ink-soft">
              Protocolo de uma emissão: documentos, pareceres, tempo parado em análise e trâmite
              completo. Abra o pacote em Documentos e use o botão &quot;Ficha PDF&quot;.
            </p>
          </Card>
        </div>
      </div>

      <div>
        <SectionTitle hint={`${rows.length} projeto(s) com histórico`}>
          Maiores variações
        </SectionTitle>

        {rows.length === 0 ? (
          <Empty>
            Ainda não há histórico suficiente. O relatório fica útil a partir do
            segundo recálculo do DRI (o cron roda 1x/dia).
          </Empty>
        ) : (
          <Card className="overflow-hidden p-0">
            <ResizableTable id="reports-variations" className="w-full border-collapse">
              <thead className="bg-surface">
                <tr>
                  <Th className="min-w-[220px]">Projeto</Th>
                  <Th>DRI atual</Th>
                  <Th>Variação (7 dias)</Th>
                  <Th>Comparado a</Th>
                  <Th>Relatório</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.project.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                    <Td className="max-w-[260px]">
                      <Link
                        href={`/projects/${r.project.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {r.project.name}
                      </Link>
                      {r.project.clientRef ? (
                        <p className="truncate text-xs text-ink-faint">
                          {r.project.clientRef.name}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <DRIBadge score={r.latest.score} showLabel={false} />
                    </Td>
                    <Td>
                      <Delta value={r.delta} />
                    </Td>
                    <Td className="text-ink-faint">
                      {r.previous ? formatDate(r.previous.calculatedAt) : "sem comparação"}
                    </Td>
                    <Td>
                      <a
                        href={`/api/reports/project/${r.project.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        <FileDown size={14} /> PDF
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ResizableTable>
          </Card>
        )}
      </div>
    </div>
  );
}
