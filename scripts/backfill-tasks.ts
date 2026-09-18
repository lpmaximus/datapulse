/**
 * Roda uma vez, depois da migração que transformou "marco" em tarefa.
 *
 * Uso: npx tsx scripts/backfill-tasks.ts
 *
 * 1. Tarefas com término real passam a "Concluída" (100%).
 * 2. Se existir o projeto de demonstração, preenche responsáveis, datas,
 *    status e um impedimento (só se ainda não foi preenchido).
 */
import { prisma } from "../lib/prisma";
import { applyDemoTaskDetails, backfillDoneTasks } from "../prisma/demo-tasks";

async function main() {
  const done = await backfillDoneTasks(prisma);
  console.log(`${done} tarefa(s) com término real marcadas como Concluída.`);

  const demo = await applyDemoTaskDetails(prisma);
  console.log(demo ? "Projeto de demonstração preenchido." : "Projeto de demonstração: nada a fazer.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
