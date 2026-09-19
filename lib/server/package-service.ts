import { prisma } from "@/lib/prisma";
import {
  PACKAGE_TYPE,
  buildDeadlineChange,
  isPackageType,
  startOfDayUTC,
  validateParentLink,
} from "@/lib/tasks";
import { projectPackageStatus, type DocumentStatus } from "@/lib/documents";
import { recomputeRollup, type Db } from "@/lib/server/rollup";

/**
 * Pacote de revisão = Tarefa (tabela Milestone, type "Pacote de revisão") que
 * agrupa as revisões de documento emitidas juntas, como no ACC.
 *
 * O estado do pacote (status, avanço, prazo) é PROJEÇÃO das revisões dentro
 * dele — nunca digitado. Toda ação que muda uma revisão chama
 * `recomputePackages` com os pacotes afetados; isso também propaga para o
 * Marco pai (rollup).
 */

/** Recalcula um pacote a partir das suas revisões e propaga ao Marco pai. */
export async function recomputePackage(milestoneId: string, db: Db = prisma) {
  const pkg = await db.milestone.findUnique({
    where: { id: milestoneId },
    select: {
      id: true,
      type: true,
      parentId: true,
      plannedDate: true,
      forecastDate: true,
      impediments: { where: { resolvedAt: null }, select: { id: true }, take: 1 },
      documentRevisions: {
        select: {
          status: true,
          dueAt: true,
          analyzedAt: true,
          sequence: true,
          document: { select: { revisions: { select: { sequence: true } } } },
        },
      },
    },
  });
  if (!pkg || !isPackageType(pkg.type)) return;

  const revisions = pkg.documentRevisions.map((r) => ({
    status: r.status as DocumentStatus,
    dueAt: r.dueAt,
    analyzedAt: r.analyzedAt,
    hasSuccessor: r.document.revisions.some((o) => o.sequence > r.sequence),
  }));

  const result = projectPackageStatus(revisions, { blocked: pkg.impediments.length > 0 });
  const change = buildDeadlineChange(pkg.forecastDate, result.forecastDate);

  await db.milestone.update({
    where: { id: pkg.id },
    data: {
      status: result.status,
      progress: result.progress,
      forecastDate: result.forecastDate,
      actualDate: result.actualDate,
      // Primeira data conhecida vira a linha de base do pacote.
      ...(pkg.plannedDate === null && result.forecastDate
        ? { plannedDate: result.forecastDate }
        : {}),
    },
  });

  if (change) {
    await db.deadlineChange.create({
      data: {
        milestoneId: pkg.id,
        fromDate: change.fromDate,
        toDate: change.toDate,
        reason: "Recalculado a partir das revisões do pacote.",
      },
    });
  }

  if (pkg.parentId) await recomputeRollup(pkg.parentId, db);
}

/** Recalcula vários pacotes (ignora nulos e repetidos). */
export async function recomputePackages(
  ids: (string | null | undefined)[],
  db: Db = prisma,
) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  for (const id of unique) await recomputePackage(id, db);
}

/**
 * Cria um pacote de revisão dentro de um Marco. O Marco pai é OBRIGATÓRIO.
 * `projectId` deve ter sido confirmado como da organização de quem chama.
 */
export async function createPackage(
  input: {
    projectId: string;
    marcoId: string;
    name: string;
    plannedDate?: Date | null;
    assigneeId?: string | null;
  },
  db: Db = prisma,
): Promise<{ error: string } | { id: string }> {
  if (!input.marcoId) return { error: "Escolha o marco do pacote." };
  if (!input.name.trim()) return { error: "Informe o nome do pacote." };

  const marco = await db.milestone.findUnique({
    where: { id: input.marcoId },
    select: { id: true, projectId: true, kind: true, parentId: true },
  });
  if (!marco) return { error: "Marco selecionado não encontrado." };
  const error = validateParentLink({ projectId: input.projectId, kind: "TASK" }, marco);
  if (error) return { error };

  const created = await db.milestone.create({
    data: {
      projectId: input.projectId,
      parentId: marco.id,
      name: input.name.trim(),
      kind: "TASK",
      type: PACKAGE_TYPE,
      status: "NOT_STARTED",
      plannedDate: input.plannedDate ?? null,
      forecastDate: input.plannedDate ?? null,
      assigneeId: input.assigneeId ?? null,
    },
    select: { id: true },
  });
  await recomputeRollup(marco.id, db);
  return { id: created.id };
}

/**
 * Confirma que `packageId` é um pacote (não cancelado) do projeto e da
 * organização informados. Revisão nova só pode ser emitida num pacote válido.
 */
export async function assertPackageUsable(
  packageId: string,
  projectId: string,
  organizationId: string,
  db: Db = prisma,
): Promise<string | null> {
  if (!packageId) return "Escolha o pacote de revisão em que este documento é emitido.";
  const pkg = await db.milestone.findFirst({
    where: { id: packageId, project: { organizationId } },
    select: { projectId: true, type: true, status: true, parentId: true },
  });
  if (!pkg || !isPackageType(pkg.type)) return "Pacote de revisão não encontrado.";
  if (pkg.projectId !== projectId) return "O pacote escolhido é de outro projeto.";
  if (!pkg.parentId) return "O pacote precisa estar dentro de um marco.";
  if (pkg.status === "CANCELLED") return "Este pacote foi cancelado.";
  return null;
}

/* ------------------------------------------------------------------------ */
/* Legado: agrupar revisões sem pacote                                       */
/* ------------------------------------------------------------------------ */

export const LEGACY_MARCO_NAME = "Legado — documentos existentes";

function fmtDay(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Agrupa revisões que ainda não têm pacote: por projeto, dia de emissão e
 * disciplina do documento. Cada projeto ganha um Marco "Legado — documentos
 * existentes". Idempotente: só toca revisões com `milestoneId` nulo.
 */
export async function groupLegacyRevisionsIntoPackages(
  db: Db = prisma,
  scope: { organizationId?: string; projectId?: string } = {},
): Promise<{ projects: number; packages: number; revisions: number }> {
  const orphans = await db.documentRevision.findMany({
    where: {
      milestoneId: null,
      document: {
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(scope.organizationId ? { project: { organizationId: scope.organizationId } } : {}),
      },
    },
    select: {
      id: true,
      issuedAt: true,
      createdAt: true,
      document: {
        select: {
          projectId: true,
          discipline: { select: { id: true, tag: true } },
        },
      },
    },
  });

  const byProject = new Map<string, typeof orphans>();
  for (const o of orphans) {
    const list = byProject.get(o.document.projectId) ?? [];
    list.push(o);
    byProject.set(o.document.projectId, list);
  }

  let packages = 0;
  const touched: string[] = [];

  for (const [projectId, revs] of byProject) {
    // Marco do legado: um por projeto, reaproveitado se já existir.
    let marco = await db.milestone.findFirst({
      where: { projectId, kind: "MILESTONE", name: LEGACY_MARCO_NAME },
      select: { id: true },
    });
    if (!marco) {
      marco = await db.milestone.create({
        data: {
          projectId,
          name: LEGACY_MARCO_NAME,
          kind: "MILESTONE",
          type: "Documentos",
          status: "NOT_STARTED",
        },
        select: { id: true },
      });
    }

    const groups = new Map<string, { name: string; ids: string[] }>();
    for (const r of revs) {
      const day = r.issuedAt ? startOfDayUTC(r.issuedAt) : null;
      const disc = r.document.discipline;
      const key = `${day ? day.toISOString() : "sem-data"}|${disc?.id ?? "sem-disc"}`;
      const name = `Emissão ${day ? fmtDay(day) : "sem data"} — ${disc?.tag ?? "sem disciplina"}`;
      const g = groups.get(key) ?? { name, ids: [] };
      g.ids.push(r.id);
      groups.set(key, g);
    }

    for (const g of groups.values()) {
      // Reaproveita pacote do legado com o mesmo nome (rodar duas vezes não duplica).
      let pkg = await db.milestone.findFirst({
        where: { projectId, parentId: marco.id, type: PACKAGE_TYPE, name: g.name },
        select: { id: true },
      });
      if (!pkg) {
        pkg = await db.milestone.create({
          data: {
            projectId,
            parentId: marco.id,
            name: g.name,
            kind: "TASK",
            type: PACKAGE_TYPE,
            status: "NOT_STARTED",
          },
          select: { id: true },
        });
        packages += 1;
      }
      await db.documentRevision.updateMany({
        where: { id: { in: g.ids }, milestoneId: null },
        data: { milestoneId: pkg.id },
      });
      touched.push(pkg.id);
    }
  }

  await recomputePackages(touched, db);

  return { projects: byProject.size, packages, revisions: orphans.length };
}
