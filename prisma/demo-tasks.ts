import type { PrismaClient } from "@prisma/client";

const DAY = 86_400_000;
const day = (offset: number) => {
  const d = new Date(Date.now() + offset * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export const DEMO_PROJECT_NAME = "Subestação Norte — Fase 2";

/**
 * Converte tarefas que já tinham término real em "Concluída".
 *
 * A migração cria `status` com padrão "A fazer" para todas as linhas; sem
 * isto, uma tarefa entregue meses atrás apareceria como pendente no Painel.
 */
export async function backfillDoneTasks(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.milestone.updateMany({
    where: { actualDate: { not: null }, status: "NOT_STARTED" },
    data: { status: "DONE", progress: 100 },
  });
  return count;
}

/**
 * Preenche responsável, início, status e avanço nas tarefas do projeto de
 * demonstração, mais um impedimento — para o Painel ter o que mostrar.
 * Só age se as tarefas ainda estão intocadas (nenhuma com início definido).
 */
export async function applyDemoTaskDetails(prisma: PrismaClient): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { name: DEMO_PROJECT_NAME },
    select: { id: true, milestones: { select: { id: true, name: true, startDate: true } } },
  });
  if (!project) return false;
  if (project.milestones.some((m) => m.startDate)) return false;

  const users = await prisma.user.findMany({
    where: { email: { in: ["carlos@datapulse.local", "bruna@datapulse.local", "diego@datapulse.local", "ana@datapulse.local"] } },
    select: { id: true, email: true },
  });
  const by = (email: string) => users.find((u) => u.email === email)?.id ?? null;

  const plan: Record<string, Parameters<PrismaClient["milestone"]["update"]>[0]["data"]> = {
    "Liberação do projeto executivo": {
      kind: "TASK",
      status: "IN_REVIEW",
      progress: 80,
      startDate: day(-90),
      assigneeId: by("carlos@datapulse.local"),
    },
    "Chegada dos transformadores": {
      kind: "TASK",
      status: "BLOCKED",
      progress: 30,
      startDate: day(-30),
      assigneeId: by("bruna@datapulse.local"),
    },
    "Licença ambiental de instalação": {
      kind: "MILESTONE",
      status: "DONE",
      progress: 100,
      assigneeId: by("ana@datapulse.local"),
    },
    "Montagem eletromecânica": {
      kind: "TASK",
      status: "NOT_STARTED",
      progress: 0,
      startDate: day(50),
      assigneeId: by("diego@datapulse.local"),
    },
  };

  for (const m of project.milestones) {
    const data = plan[m.name];
    if (data) await prisma.milestone.update({ where: { id: m.id }, data });
  }

  const transformadores = project.milestones.find((m) => m.name === "Chegada dos transformadores");
  if (transformadores) {
    await prisma.impediment.create({
      data: {
        milestoneId: transformadores.id,
        description: "Fornecedor ainda não confirmou a data de embarque dos transformadores",
        waitingOn: "Fornecedor",
        ownerId: by("bruna@datapulse.local"),
        createdAt: day(-9),
      },
    });
  }
  return true;
}
