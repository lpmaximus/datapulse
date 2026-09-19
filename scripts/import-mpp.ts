/**
 * Carga de um cronograma do MS Project (XML) como Marcos e Tarefas de um
 * projeto que já existe no DataPulse.
 *
 *   npx tsx scripts/import-mpp.ts "examples/Cronograma.mpp.xml" --projeto "Viaduto Tereza Cristina" --dry
 *   npx tsx scripts/import-mpp.ts "examples/Cronograma.mpp.xml" --projeto "Viaduto Tereza Cristina"
 *
 * Opções:
 *   --projeto "N"          nome do projeto (sem diferenciar maiúsculas/acentos) — obrigatório
 *   --organizacao "N"      só necessário se o nome existir em mais de uma organização
 *   --dry                  só mostra o que seria criado, não grava nada
 *   --linha-base-mpp       planejado = linha de base 0 do MS Project e previsto = datas atuais
 *                          (padrão: as datas atuais do arquivo são a linha de base)
 *   --substituir           apaga as tarefas atuais do projeto antes de carregar
 *
 * Sem --substituir, o script se recusa a gravar num projeto que já tem tarefas.
 * A interpretação do arquivo mora em `lib/parse-mpp.ts` (módulo puro e testado).
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseMppXml, planFromMpp } from "../lib/parse-mpp";
import { rollupMilestone } from "../lib/tasks";
import { recalculateProjectDRI } from "../lib/server/dri-service";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const option = (n: string, fallback = "") => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const file = argv.find((a) => !a.startsWith("--") && /\.xml$/i.test(a));
const DRY = flag("dry");
const REPLACE = flag("substituir");
const PROJECT = option("projeto");
const ORG = option("organizacao");

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

async function main(): Promise<void> {
  if (!file) throw new Error("Informe o arquivo .xml exportado do MS Project.");
  if (!PROJECT) throw new Error('Informe o projeto: --projeto "Nome do projeto".');

  const { tasks } = parseMppXml(readFileSync(file, "utf8"));
  const plan = planFromMpp(tasks, { useMppBaseline: flag("linha-base-mpp") });

  console.log(`Cronograma: ${plan.projectName || "(sem nome)"}`);
  console.log(`  ${plan.markers.length} marcos, ${plan.tasks.length} tarefas`);
  for (const m of plan.markers) {
    const filhas = plan.tasks.filter((t) => t.parent === m.name);
    console.log(`  ■ ${m.name}  [prazo ${fmt(m.plannedDate)}]  ${filhas.length} tarefa(s)`);
  }
  const semMarco = plan.tasks.filter((t) => !t.parent);
  if (semMarco.length) console.log(`  Tarefas sem marco: ${semMarco.map((t) => t.name).join("; ")}`);
  for (const w of plan.warnings) console.log(`  ! ${w}`);

  const all = await prisma.project.findMany({
    where: ORG ? { organization: { name: ORG } } : {},
    select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } },
  });
  const found = all.filter((p) => norm(p.name) === norm(PROJECT));
  if (found.length !== 1) {
    console.error(
      found.length === 0
        ? `\nNenhum projeto chamado "${PROJECT}". Projetos existentes:`
        : `\nMais de um projeto chamado "${PROJECT}" — use --organizacao. Encontrados:`,
    );
    for (const p of found.length ? found : all) console.error(`  - ${p.name}  (${p.organization.name})`);
    process.exit(1);
  }
  const project = found[0];
  console.log(`\nProjeto de destino: ${project.name}  (${project.organization.name})`);

  const existing = await prisma.milestone.count({ where: { projectId: project.id } });
  if (existing > 0 && !REPLACE) {
    console.error(`O projeto já tem ${existing} tarefa(s). Use --substituir para apagá-las antes da carga.`);
    process.exit(1);
  }
  if (DRY) {
    console.log(`\n--dry: nada foi gravado.${existing ? ` (--substituir apagaria ${existing} tarefa(s).)` : ""}`);
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      if (existing > 0) {
        const r = await tx.milestone.deleteMany({ where: { projectId: project.id } });
        console.log(`Tarefas anteriores apagadas: ${r.count}`);
      }

      const idByName = new Map<string, string>();
      for (const m of plan.markers) {
        const row = await tx.milestone.create({
          data: {
            projectId: project.id,
            name: m.name,
            kind: "MILESTONE",
            plannedDate: m.plannedDate,
          },
          select: { id: true },
        });
        idByName.set(m.name, row.id);
      }

      await tx.milestone.createMany({
        data: plan.tasks.map((t) => ({
          projectId: project.id,
          name: t.name,
          kind: t.kind,
          parentId: t.parent ? idByName.get(t.parent)! : null,
          status: t.status,
          progress: t.progress,
          startDate: t.startDate,
          plannedDate: t.plannedDate,
          forecastDate: t.forecastDate,
        })),
      });

      // Status, avanço e prazo previsto de cada Marco vêm das filhas.
      for (const m of plan.markers) {
        const id = idByName.get(m.name)!;
        const filhas = await tx.milestone.findMany({
          where: { parentId: id },
          select: {
            kind: true, status: true, progress: true,
            startDate: true, plannedDate: true, forecastDate: true, actualDate: true,
          },
        });
        if (filhas.length === 0) continue;
        const r = rollupMilestone(filhas);
        await tx.milestone.update({
          where: { id },
          data: { status: r.status, progress: r.progress, forecastDate: r.forecastDate, actualDate: r.actualDate },
        });
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  console.log(`\nCriados: ${plan.markers.length} marcos e ${plan.tasks.length} tarefas.`);
  await recalculateProjectDRI(project.id);
  console.log("DRI do projeto recalculado.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
