import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import {
  AccReauthRequiredError,
  getValidAccessToken,
  type AccConnectionRow,
} from "./connection";
import {
  createDailyRequest,
  downloadJobFile,
  getLatestSuccessfulJob,
  hubIdToAccountId,
  listJobFiles,
} from "./data-connector";
import {
  matchCostToMilestones,
  parseAccCost,
  summarizeAccIssues,
} from "./parse-acc";

/** Projeto do DataPulse vinculado a um projeto do ACC. */
interface AccLinkedProject {
  id: string;
  accProjectId: string | null;
  milestones: { id: string; name: string }[];
}

export interface AccSyncResult {
  connectionId: string;
  hubId: string;
  status: "OK" | "FAILED" | "REAUTH_REQUIRED" | "SKIPPED";
  message: string;
  projectsSynced: number;
  signalsWritten: number;
}

function csvToRecords(text: string): Record<string, unknown>[] {
  return Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  }).data;
}

/** Escolhe um arquivo do job por sufixo, tolerante a prefixo de projeto. */
function findFile(files: string[], suffix: string): string | null {
  return files.find((f) => f.toLowerCase().endsWith(suffix.toLowerCase())) ?? null;
}

/**
 * Sincroniza uma conexão ACC.
 *
 * Fluxo: garante token válido → garante que existe um request diário →
 * pega o job concluído mais recente → baixa cost/issues → grava SystemicSignal
 * com source ACC → recalcula o DRI dos projetos afetados.
 *
 * Nota importante sobre o escopo dos dados: o ACC não expõe cronograma, então
 * os sinais gravados aqui trazem custo e issues, sem datas. O componente de
 * prazo do DRI segue alimentado pela planilha. Ver lib/acc/parse-acc.ts.
 */
export async function syncAccConnection(
  connection: AccConnectionRow,
  now = new Date(),
): Promise<AccSyncResult> {
  const base = {
    connectionId: connection.id,
    hubId: connection.hubId,
    projectsSynced: 0,
    signalsWritten: 0,
  };

  const linkedProjects: AccLinkedProject[] = await prisma.project.findMany({
    where: {
      accConnectionId: connection.id,
      accProjectId: { not: null },
      status: "ACTIVE",
    },
    select: {
      id: true,
      accProjectId: true,
      milestones: { select: { id: true, name: true } },
    },
  });

  if (linkedProjects.length === 0) {
    return {
      ...base,
      status: "SKIPPED",
      message: "Nenhum projeto ativo vinculado a um projeto do ACC.",
    };
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(connection, now);
  } catch (error) {
    if (error instanceof AccReauthRequiredError) {
      return {
        ...base,
        status: "REAUTH_REQUIRED",
        message: error.message,
      };
    }
    throw error;
  }

  const accountId = hubIdToAccountId(connection.hubId);

  try {
    // 1. Garante o request recorrente (criado uma vez, reaproveitado sempre).
    let requestId = connection.dataRequestId;
    if (!requestId) {
      const created = await createDailyRequest({
        accessToken,
        accountId,
        projectIds: linkedProjects
          .map((p: AccLinkedProject) => p.accProjectId)
          .filter((id: string | null): id is string => Boolean(id)),
      });
      requestId = created.id;
      await prisma.accConnection.update({
        where: { id: connection.id },
        data: { dataRequestId: requestId },
      });

      return {
        ...base,
        status: "OK",
        message:
          "Request de extração criado no ACC. O primeiro job leva alguns minutos; o próximo ciclo já lê os dados.",
      };
    }

    // 2. Job concluído mais recente.
    const job = await getLatestSuccessfulJob({ accessToken, accountId, requestId });
    if (!job) {
      return {
        ...base,
        status: "OK",
        message: "Nenhum job concluído ainda no ACC. Nada a importar neste ciclo.",
      };
    }

    if (job.id === connection.lastJobId) {
      return {
        ...base,
        status: "OK",
        message: "Job mais recente já importado. Nada novo.",
      };
    }

    // 3. Baixa os CSVs relevantes.
    const files = await listJobFiles({ accessToken, accountId, jobId: job.id });
    const costFile = findFile(files, "cost_budgets.csv");
    const issuesFile = findFile(files, "issues_issues.csv");

    const costRows = costFile
      ? parseAccCost(
          csvToRecords(
            await downloadJobFile({
              accessToken,
              accountId,
              jobId: job.id,
              fileName: costFile,
            }),
          ),
        )
      : [];

    const issueSummary = issuesFile
      ? summarizeAccIssues(
          csvToRecords(
            await downloadJobFile({
              accessToken,
              accountId,
              jobId: job.id,
              fileName: issuesFile,
            }),
          ),
        )
      : null;

    // 4. Grava sinais por marco.
    const referenceDate = job.completedAt ? new Date(job.completedAt) : now;
    let signalsWritten = 0;

    for (const project of linkedProjects) {
      const matched = matchCostToMilestones(costRows, project.milestones);

      const data = project.milestones
        .map((m: { id: string; name: string }) => {
          const cost = matched.get(m.id);
          // Sem custo casado e sem issues, não há sinal a registrar para o marco.
          if (!cost && !issueSummary) return null;

          return {
            milestoneId: m.id,
            source: "ACC" as const,
            referenceDate,
            plannedCost: cost?.plannedCost ?? null,
            actualCost: cost?.actualCost ?? null,
            // Issues são do projeto, não do marco: replicar o total em cada
            // marco distorceria o DRI. Só anexamos onde houve custo casado.
            openIssues: cost && issueSummary ? issueSummary.openIssues : null,
            raw: {
              jobId: job.id,
              accProjectId: project.accProjectId,
              matchedCostName: cost?.name ?? null,
              issuesTotal: issueSummary?.total ?? null,
            } as object,
          };
        })
        .filter((d): d is Exclude<typeof d, null> => d !== null);

      if (data.length > 0) {
        await prisma.systemicSignal.createMany({ data });
        signalsWritten += data.length;
      }

      await recalculateProjectDRI(project.id, now);
    }

    await prisma.accConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: now,
        lastSyncStatus: "OK",
        lastSyncError: null,
        lastJobId: job.id,
      },
    });

    return {
      ...base,
      status: "OK",
      projectsSynced: linkedProjects.length,
      signalsWritten,
      message: `Job ${job.id} importado: ${signalsWritten} sinal(is) em ${linkedProjects.length} projeto(s).`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida.";

    await prisma.accConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: now, lastSyncStatus: "FAILED", lastSyncError: message },
    });

    return { ...base, status: "FAILED", message };
  }
}

export async function syncAllAccConnections(now = new Date()): Promise<AccSyncResult[]> {
  const connections: AccConnectionRow[] = await prisma.accConnection.findMany({
    select: {
      id: true,
      hubId: true,
      hubName: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
      dataRequestId: true,
      lastJobId: true,
    },
  });

  const results: AccSyncResult[] = [];
  for (const c of connections) {
    results.push(await syncAccConnection(c, now));
  }
  return results;
}
