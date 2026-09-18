/**
 * Cliente da Data Connector API do Autodesk Platform Services.
 *
 * Modelo da API: cria-se um *request* (o que extrair e com que frequência);
 * a Autodesk executa *jobs*; cada job concluído expõe CSVs por signed URL.
 * O DataPulse cria um request DAILY e, a cada cron, lê o job mais recente.
 *
 * Limitações confirmadas na documentação:
 * - Só token 3-legged; usuário precisa ser Account Admin/Executive.
 * - NÃO existe service group de cronograma. Os grupos são admin, issues,
 *   rfis, submittals, cost, locations, activities (log de auditoria) etc.
 *   Por isso datas planejadas/reais continuam vindo da planilha.
 * - Os extratos ficam disponíveis por 30 dias no lado da Autodesk.
 */

const APS_BASE = "https://developer.api.autodesk.com";
const DC_BASE = `${APS_BASE}/data-connector/v1`;

/** Grupos que o DataPulse consegue aproveitar hoje. */
export const DATAPULSE_SERVICE_GROUPS = ["cost", "issues"] as const;

export interface AccHub {
  id: string;
  name: string;
}

export interface AccProject {
  id: string;
  name: string;
}

export interface AccJob {
  id: string;
  status: string;
  completionStatus: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AccDataFile {
  name: string;
  size?: number;
  signedUrl: string;
}

class AccApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AccApiError";
  }
}

async function accFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new AccApiError(
      "Rate limit da Autodesk atingido. O próximo ciclo do cron tenta de novo.",
      429,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AccApiError(
      `Autodesk respondeu ${res.status} em ${new URL(url).pathname}${
        body ? `: ${body.slice(0, 200)}` : ""
      }`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

/** Hubs visíveis ao usuário autorizado (Data Management API). */
export async function listHubs(accessToken: string): Promise<AccHub[]> {
  const data = await accFetch<{
    data: { id: string; attributes: { name: string } }[];
  }>(`${APS_BASE}/project/v1/hubs`, accessToken);

  return data.data.map((h) => ({ id: h.id, name: h.attributes.name }));
}

/** Projetos de um hub. */
export async function listProjects(
  accessToken: string,
  hubId: string,
): Promise<AccProject[]> {
  const data = await accFetch<{
    data: { id: string; attributes: { name: string } }[];
  }>(`${APS_BASE}/project/v1/hubs/${encodeURIComponent(hubId)}/projects`, accessToken);

  return data.data.map((p) => ({
    // A Data Connector espera o UUID cru, sem o prefixo "b." usado pela
    // Data Management API.
    id: p.id.replace(/^b\./, ""),
    name: p.attributes.name,
  }));
}

/**
 * Cria um request recorrente diário. Idempotência é responsabilidade de quem
 * chama: guardamos o `dataRequestId` para não criar um request por dia.
 */
export async function createDailyRequest(params: {
  accessToken: string;
  accountId: string;
  projectIds: string[];
  callbackUrl?: string;
}): Promise<{ id: string }> {
  const { accessToken, accountId, projectIds, callbackUrl } = params;

  // effectiveFrom no passado é recusado pela API; usamos alguns minutos à frente.
  const effectiveFrom = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return accFetch<{ id: string }>(
    `${DC_BASE}/accounts/${encodeURIComponent(accountId)}/requests`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        description: "DataPulse — extração diária (Camada 1)",
        isActive: true,
        scheduleInterval: "DAY",
        reoccuringInterval: 1,
        effectiveFrom,
        serviceGroups: [...DATAPULSE_SERVICE_GROUPS],
        projectIdList: projectIds,
        sendEmail: false,
        ...(callbackUrl ? { callbackUrl } : {}),
      }),
    },
  );
}

/** Job concluído com sucesso mais recente de um request. */
export async function getLatestSuccessfulJob(params: {
  accessToken: string;
  accountId: string;
  requestId: string;
}): Promise<AccJob | null> {
  const { accessToken, accountId, requestId } = params;

  const data = await accFetch<{ results: AccJob[] }>(
    `${DC_BASE}/accounts/${encodeURIComponent(accountId)}/requests/${encodeURIComponent(
      requestId,
    )}/jobs?limit=20&sort=desc&sortFields=createdAt`,
    accessToken,
  );

  const done = (data.results ?? []).filter(
    (j) => j.status === "complete" && j.completionStatus === "success",
  );

  return done[0] ?? null;
}

/** Lista os CSVs de um job concluído. */
export async function listJobFiles(params: {
  accessToken: string;
  accountId: string;
  jobId: string;
}): Promise<string[]> {
  const { accessToken, accountId, jobId } = params;

  const data = await accFetch<{ results: { name: string }[] }>(
    `${DC_BASE}/accounts/${encodeURIComponent(accountId)}/jobs/${encodeURIComponent(
      jobId,
    )}/data-listing`,
    accessToken,
  );

  return (data.results ?? []).map((f) => f.name);
}

/**
 * Baixa um CSV do job. A signed URL vale ~60 segundos, então buscamos e
 * consumimos na mesma execução.
 */
export async function downloadJobFile(params: {
  accessToken: string;
  accountId: string;
  jobId: string;
  fileName: string;
}): Promise<string> {
  const { accessToken, accountId, jobId, fileName } = params;

  const meta = await accFetch<AccDataFile>(
    `${DC_BASE}/accounts/${encodeURIComponent(accountId)}/jobs/${encodeURIComponent(
      jobId,
    )}/data/${encodeURIComponent(fileName)}`,
    accessToken,
  );

  const res = await fetch(meta.signedUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new AccApiError(
      `Falha ao baixar ${fileName}: HTTP ${res.status}`,
      res.status,
    );
  }
  return res.text();
}

/** "b.f7c8...": a Data Connector usa o accountId sem o prefixo do hub. */
export function hubIdToAccountId(hubId: string): string {
  return hubId.replace(/^b\./, "");
}

export { AccApiError };
