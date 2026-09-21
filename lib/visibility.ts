import type { Prisma } from "@prisma/client";

/**
 * Quais projetos cada papel enxerga. Função pura (sem banco) para ser testada.
 *
 * ADMIN e MANAGER veem a carteira inteira da organização. Especialista e
 * Executivo só veem projeto em que são gerente, membro alocado, responsável
 * por alguma tarefa, dono de alguma solicitação, responsável por algum
 * documento, especialista designado para analisar alguma revisão ou
 * destinatário de uma delegação de análise pendente. Fora
 * disso o projeto "não existe" para eles — os filtros abaixo entram na
 * própria consulta, então um id colado na URL dá "não encontrado".
 */
export function projectVisibility(user: {
  id: string;
  role: string;
  organizationId: string;
}): Prisma.ProjectWhereInput {
  const base: Prisma.ProjectWhereInput = { organizationId: user.organizationId };
  if (user.role === "ADMIN" || user.role === "MANAGER") return base;
  return {
    ...base,
    OR: [
      { managerId: user.id },
      { members: { some: { userId: user.id } } },
      { milestones: { some: { assigneeId: user.id } } },
      { requests: { some: { ownerId: user.id } } },
      { documents: { some: { responsibleId: user.id } } },
      // Designado para analisar uma revisão precisa alcançar o projeto dela,
      // mesmo sem ser responsável pelo documento (base da delegação de análise).
      { documents: { some: { revisions: { some: { specialistId: user.id } } } } },
      // Destinatário de uma delegação pendente precisa abrir o projeto para
      // decidir se aceita (depois de aceitar, vale a condição acima).
      {
        documents: {
          some: {
            revisions: {
              some: { delegations: { some: { toUserId: user.id, status: "PENDING" } } },
            },
          },
        },
      },
      // Convocado para avaliar (Camada 2) precisa alcançar a tarefa.
      { milestones: { some: { signalRequests: { some: { assigneeId: user.id, status: "PENDING" } } } } },
    ],
  };
}

/** Executivo só lê: nenhuma ação de gravação. */
export function canWrite(user: { role: string }): boolean {
  return user.role !== "EXECUTIVE";
}
