/**
 * Exploração SOMENTE LEITURA do ACC — prova de conceito do monitoramento de
 * revisões e issues por documento.
 *
 *   npm run acc:explore                              lista conexões e projetos
 *   npm run acc:explore -- --projeto "trecho do nome" [opções]
 *
 * Opções:
 *   --organizacao "N"   filtra a conexão pela organização (se houver várias)
 *   --projeto "T"       nome (parcial) ou UUID do projeto do ACC a explorar
 *   --max-itens N       quantos arquivos ter as versões consultadas (padrão 80)
 *   --profundidade N    níveis de subpasta a percorrer (padrão 6)
 *   --sem-issues        não consulta issues
 *
 * O que faz: usa o token já guardado em AccConnection (renova se preciso),
 * percorre as pastas do projeto, lista cada arquivo com suas versões, e lê as
 * issues em bruto. Nada é gravado no ACC. A única escrita é no banco do
 * DataPulse, e só quando o refresh do token precisa rotacionar (comportamento
 * normal de getValidAccessToken).
 *
 * Saída em out/acc-explore/ (dado real de cliente — não versionar).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { getValidAccessToken, type AccConnectionRow } from "../lib/acc/connection";

const prisma = new PrismaClient();
const APS = "https://developer.api.autodesk.com";

/* ------------------------------ argumentos ------------------------------- */
const argv = process.argv.slice(2);
function opt(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const flag = (name: string) => argv.includes(`--${name}`);
const MAX_ITEMS = Number(opt("max-itens") ?? 80);
const MAX_DEPTH = Number(opt("profundidade") ?? 6);

/* -------------------------------- HTTP ----------------------------------- */
async function api<T = any>(token: string, url: string, tries = 4): Promise<T> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 429 && attempt < tries) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} em ${new URL(url).pathname} — ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }
  throw new Error("inalcançável");
}

/** Segue links.next da JSON:API até o fim. */
async function paged(token: string, firstUrl: string): Promise<{ data: any[]; included: any[] }> {
  const data: any[] = [];
  const included: any[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const page: any = await api(token, url);
    data.push(...(page.data ?? []));
    included.push(...(page.included ?? []));
    url = page.links?.next?.href;
  }
  return { data, included };
}

/* ------------------------------- percurso -------------------------------- */
interface FileRow {
  path: string;
  name: string;
  itemId: string;
  versions: {
    number: number;
    name: string;
    createdAt: string;
    createdBy: string;
    modifiedAt: string;
    modifiedBy: string;
    urn: string;
  }[];
}

async function main() {
  const org = opt("organizacao");
  const connections = await prisma.accConnection.findMany({
    where: org ? { organization: { name: org } } : undefined,
    include: { organization: { select: { name: true } } },
  });

  if (connections.length === 0) {
    console.log("Nenhuma AccConnection no banco. Autorize o hub em /settings/acc primeiro.");
    return;
  }
  if (connections.length > 1 && !org) {
    console.log("Há mais de uma conexão; use --organizacao. Disponíveis:");
    for (const c of connections) console.log(` - ${c.organization.name}  (${c.hubName ?? c.hubId})`);
    return;
  }

  const c = connections[0];
  console.log(`Hub: ${c.hubName ?? "?"} (${c.hubId}) | org: ${c.organization.name}`);
  console.log(`Refresh token expira em: ${c.refreshTokenExpiresAt.toISOString()}`);

  const row: AccConnectionRow = {
    id: c.id,
    hubId: c.hubId,
    hubName: c.hubName,
    accessTokenEnc: c.accessTokenEnc,
    refreshTokenEnc: c.refreshTokenEnc,
    accessTokenExpiresAt: c.accessTokenExpiresAt,
    refreshTokenExpiresAt: c.refreshTokenExpiresAt,
    dataRequestId: c.dataRequestId,
    lastJobId: c.lastJobId,
  };
  const token = await getValidAccessToken(row);

  // Projetos (ids com prefixo "b." — formato da Data Management API).
  const projects: { data: { id: string; attributes: { name: string } }[] } = await api(
    token,
    `${APS}/project/v1/hubs/${encodeURIComponent(c.hubId)}/projects?page[limit]=200`,
  );
  const wanted = opt("projeto");
  if (!wanted) {
    console.log(`\n${projects.data.length} projeto(s) visíveis:`);
    for (const p of projects.data) console.log(` - ${p.attributes.name}   [${p.id}]`);
    console.log('\nEscolha um e rode: npm run acc:explore -- --projeto "trecho do nome"');
    return;
  }

  const w = wanted.toLowerCase();
  const found = projects.data.filter(
    (p) => p.attributes.name.toLowerCase().includes(w) || p.id.toLowerCase().includes(w),
  );
  if (found.length !== 1) {
    console.log(`"${wanted}" casou com ${found.length} projeto(s):`);
    for (const p of found) console.log(` - ${p.attributes.name} [${p.id}]`);
    return;
  }
  const project = found[0];
  const pid = project.id; // com "b."
  const pidRaw = pid.replace(/^b\./, "");
  console.log(`\nProjeto: ${project.attributes.name} [${pid}]`);

  /* ------------------------------ pastas/arquivos ----------------------- */
  const top: any = await api(
    token,
    `${APS}/project/v1/hubs/${encodeURIComponent(c.hubId)}/projects/${encodeURIComponent(pid)}/topFolders`,
  );
  console.log("Pastas de topo:", top.data.map((f: any) => f.attributes.displayName).join(" | "));

  const files: FileRow[] = [];
  let foldersSeen = 0;

  async function walk(folderId: string, path: string, depth: number) {
    foldersSeen++;
    const { data } = await paged(
      token,
      `${APS}/data/v1/projects/${encodeURIComponent(pid)}/folders/${encodeURIComponent(folderId)}/contents?page[limit]=200`,
    );
    for (const e of data) {
      const name = e.attributes?.displayName ?? e.attributes?.name ?? "?";
      if (e.type === "folders") {
        if (depth < MAX_DEPTH) await walk(e.id, `${path}/${name}`, depth + 1);
      } else if (e.type === "items") {
        files.push({ path, name, itemId: e.id, versions: [] });
      }
    }
  }

  for (const f of top.data) {
    // Ignora a lixeira/pastas de sistema óbvias; o resto entra.
    const n = String(f.attributes.displayName ?? "");
    if (/^(recycle|trash|lixeira)/i.test(n)) continue;
    await walk(f.id, n, 1);
  }
  console.log(`Pastas percorridas: ${foldersSeen} | arquivos encontrados: ${files.length}`);

  /* ------------------------------- versões ------------------------------ */
  const sample = files.slice(0, MAX_ITEMS);
  for (const f of sample) {
    const { data } = await paged(
      token,
      `${APS}/data/v1/projects/${encodeURIComponent(pid)}/items/${encodeURIComponent(f.itemId)}/versions?page[limit]=50`,
    );
    f.versions = data
      .map((v: any) => ({
        number: Number(v.attributes?.versionNumber ?? 0),
        name: String(v.attributes?.name ?? v.attributes?.displayName ?? ""),
        createdAt: String(v.attributes?.createTime ?? ""),
        createdBy: String(v.attributes?.createUserName ?? ""),
        modifiedAt: String(v.attributes?.lastModifiedTime ?? ""),
        modifiedBy: String(v.attributes?.lastModifiedUserName ?? ""),
        urn: String(v.id),
      }))
      .sort((a: any, b: any) => a.number - b.number);
  }

  /* -------------------------------- issues ------------------------------ */
  let issues: any[] = [];
  let issuesError: string | null = null;
  if (!flag("sem-issues")) {
    try {
      let offset = 0;
      for (;;) {
        const page: any = await api(
          token,
          `${APS}/construction/issues/v1/projects/${encodeURIComponent(pidRaw)}/issues?limit=200&offset=${offset}`,
        );
        issues.push(...(page.results ?? []));
        if ((page.results ?? []).length < 200) break;
        offset += 200;
      }
    } catch (e) {
      issuesError = e instanceof Error ? e.message : String(e);
    }
  }

  /* -------------------------------- saída ------------------------------- */
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = "out/acc-explore";
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    `${dir}/${stamp}-files.json`,
    JSON.stringify({ project: project.attributes.name, files: sample }, null, 2),
  );
  writeFileSync(`${dir}/${stamp}-issues.json`, JSON.stringify({ issues, issuesError }, null, 2));

  const csv = ["pasta;arquivo;versoes;ultima_versao;ultima_modificacao;modificado_por"];
  for (const f of sample) {
    const last = f.versions[f.versions.length - 1];
    csv.push(
      [f.path, f.name, f.versions.length, last?.number ?? "", last?.modifiedAt ?? "", last?.modifiedBy ?? ""]
        .map((x) => String(x).replaceAll(";", ","))
        .join(";"),
    );
  }
  writeFileSync(`${dir}/${stamp}-files.csv`, "﻿" + csv.join("\n"));

  console.log(`\n== Arquivos (amostra de ${sample.length}) ==`);
  const multi = sample.filter((f) => f.versions.length > 1).length;
  console.log(`Com mais de uma versão: ${multi}`);
  for (const f of sample.slice(0, 15)) {
    const last = f.versions[f.versions.length - 1];
    console.log(` - ${f.name}  v${last?.number ?? "?"} (${f.versions.length} vers.)  ${last?.modifiedAt ?? ""}`);
  }

  console.log("\n== Issues ==");
  if (issuesError) {
    console.log("Falha ao ler issues:", issuesError);
  } else {
    const byStatus: Record<string, number> = {};
    for (const i of issues) byStatus[i.status ?? "?"] = (byStatus[i.status ?? "?"] ?? 0) + 1;
    console.log(`Total: ${issues.length}`, byStatus);
    const linked = issues.filter(
      (i) => i.linkedDocuments?.length || i.attachments?.length || i.references?.length,
    ).length;
    console.log(`Com algum vínculo a documento no payload: ${linked}`);
    if (issues[0]) console.log("Campos de uma issue:", Object.keys(issues[0]).join(", "));
  }

  console.log(`\nArquivos gravados em ${dir}/ (${stamp}-files.csv, -files.json, -issues.json)`);
}

main()
  .catch((e) => {
    console.error("\nERRO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
