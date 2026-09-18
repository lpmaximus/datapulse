import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, SectionTitle } from "@/components/ui";
import { ImportForm } from "@/components/import-form";
import { ReadOnlyBanner } from "@/components/task-ui";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireRole(["ADMIN", "MANAGER"], `/projects/${id}/import`);
  const project = await prisma.project.findFirst({
    where: { id, organizationId: me.organizationId },
    select: { id: true, name: true, status: true },
  });
  if (!project) notFound();

  return (
    <div className="space-y-8">
      <section>
        <Link href={`/projects/${id}`} className="text-xs text-ink-faint hover:text-ink-soft">
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Importar sinais sistêmicos
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Camada 1. Não existe template obrigatório: o parser reconhece nomes de
          coluna comuns em português e inglês, com ou sem acento.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          {project.status === "ACTIVE" ? (
            <ImportForm projectId={project.id} />
          ) : (
            <ReadOnlyBanner status={project.status} />
          )}
        </Card>

        <div>
          <SectionTitle>Colunas aceitas</SectionTitle>
          <Card className="text-sm text-ink">
            <ul className="space-y-2">
              <li>
                <strong>Tarefa</strong> <span className="text-ink-soft">(obrigatória)</span> —
                também aceita Marco, Milestone, Atividade, Entrega.
              </li>
              <li>
                <strong>Data planejada</strong> — Prevista, Baseline, Planned Date.
              </li>
              <li>
                <strong>Data real</strong> — Realizada, Actual Date, Término real.
              </li>
              <li>
                <strong>Atraso</strong> — Dias de atraso, Delay, Desvio dias. Se
                ausente, é derivado das duas datas.
              </li>
              <li>
                <strong>Custo previsto / realizado</strong> — Orçamento, Budget,
                Gasto.
              </li>
              <li>
                <strong>Issues abertas</strong> e <strong>Replanejamentos</strong> —
                opcionais, entram como sinais secundários.
              </li>
            </ul>
            <p className="mt-4 text-xs text-ink-soft">
              Datas em dd/mm/aaaa, aaaa-mm-dd ou serial do Excel. Valores em
              R$ 1.234,56 ou 1234.56.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
