/**
 * Parse da planilha "CONTROLE MASTER" — o controle documental que a equipe já
 * mantém no Excel, com duas abas que importam:
 *
 * - `ANEXO`      — os cadastros (projetos, projetistas, disciplinas, códigos
 *                  de análise, equipe de análise). É a fonte de referência.
 * - `BANCO DADOS`— um lançamento por análise: documento, revisão, analista,
 *                  parecer e as três datas (envio, prazo, solução).
 *
 * Módulo puro: recebe matrizes de células e devolve o plano de carga. Não
 * importa Prisma nem lê arquivo — assim a interpretação da planilha, que é a
 * parte sujeita a erro, fica testável linha a linha.
 *
 * Duas decisões que mudam o resultado:
 *
 * 1. **Cada linha é um round de análise, não um documento.** A mesma revisão
 *    aparece mais de uma vez quando voltou a ser analisada. Agrupar por
 *    (projeto, documento, revisão) e ordenar por data de envio reconstrói o
 *    histórico; tratar cada linha como registro novo o destruiria.
 * 2. **Sem parecer = ainda em análise.** É o que a coluna ATIV já diz, e o
 *    cruzamento bate: toda linha ATIV=SIM está sem parecer.
 */

import type { AnalysisEffect, DocumentStatus } from "./documents";

export type Grid = unknown[][];

export interface MasterPerson {
  name: string;
  email: string;
}

export interface MasterDiscipline {
  tag: string;
  name: string;
}

export interface MasterAnalysisCode {
  tag: string;
  name: string;
  effect: AnalysisEffect;
}

export interface MasterProject {
  /** Código do projeto no controle da equipe (COD_LP), ex.: "MRS016-CON26". */
  os: string;
  name: string;
  designFirm: string | null;
  /** Número da OS contratual, quando existe. */
  serviceOrder: string | null;
  /** Tem lançamento na aba BANCO DADOS. */
  hasDocuments: boolean;
}

/** Um ciclo de análise da mesma revisão — uma linha da planilha. */
export interface MasterRound {
  issuedAt: Date | null;
  dueAt: Date | null;
  analyzedAt: Date | null;
  analyst: string | null;
  analysisTag: string | null;
  notes: string | null;
}

export interface MasterRevision {
  name: string;
  sequence: number;
  status: DocumentStatus;
  analysisTag: string | null;
  analyst: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  analyzedAt: Date | null;
  notes: string | null;
  rounds: MasterRound[];
}

export interface MasterDocument {
  projectOs: string;
  /** Código sem a extensão do arquivo — é assim que o documento é citado. */
  number: string;
  /** Nome do arquivo como está na planilha. */
  name: string;
  /** Sigla do tipo, extraída do código (DE, MC, MP, PQ…). */
  type: string | null;
  disciplineTag: string | null;
  revisions: MasterRevision[];
}

export interface MasterPlan {
  disciplines: MasterDiscipline[];
  analysisCodes: MasterAnalysisCode[];
  designFirms: string[];
  people: MasterPerson[];
  projects: MasterProject[];
  documents: MasterDocument[];
  warnings: string[];
  stats: {
    rows: number;
    documents: number;
    revisions: number;
    rounds: number;
    open: number;
  };
}

/* --------------------------- células e datas ---------------------------- */

function text(row: unknown[], i: number): string {
  const v = row?.[i];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/** Serial do Excel: dias desde 30/12/1899, em UTC para não escorregar um dia. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(EXCEL_EPOCH + Math.round(value) * 86_400_000);
  }
  const s = String(value).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
    return new Date(Date.UTC(year, Number(m) - 1, Number(d)));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Comparação tolerante a acento, caixa e espaço — para casar nomes digitados. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** "MARIA OLIVEIRA (MALU)" → "maria.oliveira@dominio". */
export function emailFor(name: string, domain: string): string {
  const slug = normalizeName(name.replace(/\(.*?\)/g, ""))
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .split(" ")
    .filter(Boolean)
    .join(".");
  return `${slug || "sem.nome"}@${domain}`;
}

/** "Luiz Paulo" a partir de "LUIZ PAULO" — a planilha é toda em caixa alta. */
export function titleCase(value: string): string {
  const minor = new Set(["de", "da", "do", "das", "dos", "e"]);
  return value
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) =>
      i > 0 && minor.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1),
    )
    .join(" ");
}

/** "V10" → 10; usado só para ordenar as revisões. */
function revisionOrder(name: string): number {
  const m = name.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

const EFFECT_BY_TAG: Record<string, AnalysisEffect> = {
  APR: "APPROVES",
  REJ: "REJECTS",
  COM: "COMMENTS",
  CLD: "CANCELS",
};

const STATUS_BY_EFFECT: Record<AnalysisEffect, DocumentStatus> = {
  APPROVES: "APPROVED",
  APPROVES_WITH_COMMENTS: "APPROVED",
  COMMENTS: "COMMENTED",
  REJECTS: "REJECTED",
  CANCELS: "CANCELLED",
};

/* ------------------------------- ANEXO ---------------------------------- */

/** Índices das colunas da aba ANEXO (0-based), na ordem em que estão lá. */
const ANEXO = {
  firstDataRow: 3,
  project: { os: 4, title: 5, serviceOrder: 6, designFirm: 7 },
  analysis: { tag: 19, name: 20 },
  team: { name: 26 },
  discipline: { tag: 28, name: 29 },
} as const;

/* ---------------------------- BANCO DADOS -------------------------------- */

const BANCO = {
  firstDataRow: 4,
  active: 1,
  issuedAt: 3,
  projectOs: 5,
  projectName: 6,
  document: 7,
  revision: 8,
  disciplineTag: 9,
  disciplineName: 10,
  analyst: 11,
  analysis: 12,
  dueAt: 13,
  analyzedAt: 15,
  notes: 16,
} as const;

/**
 * Lê as duas abas e devolve o plano de carga.
 *
 * `emailDomain` é usado para gerar o e-mail de quem só existe como nome na
 * planilha. Use um domínio não roteável: são contas de teste, e um endereço
 * plausível num domínio real acabaria recebendo mensagem de verdade.
 */
export function parseMaster(
  banco: Grid,
  anexo: Grid,
  emailDomain = "mrs.local",
): MasterPlan {
  const warnings: string[] = [];

  /* --- cadastros do ANEXO --- */

  const disciplines: MasterDiscipline[] = [];
  const analysisCodes: MasterAnalysisCode[] = [];
  const people: MasterPerson[] = [];
  const projectsByOs = new Map<string, MasterProject>();
  const designFirms = new Set<string>();
  /** "APROVADO" → "APR": a aba BANCO DADOS grava o nome, não a sigla. */
  const tagByAnalysisName = new Map<string, string>();

  for (let i = ANEXO.firstDataRow; i < anexo.length; i += 1) {
    const row = anexo[i] ?? [];

    const dTag = text(row, ANEXO.discipline.tag);
    const dName = text(row, ANEXO.discipline.name);
    if (dTag && dName) disciplines.push({ tag: dTag.toUpperCase(), name: dName });

    const aTag = text(row, ANEXO.analysis.tag).toUpperCase();
    const aName = text(row, ANEXO.analysis.name);
    if (aTag && aName) {
      const effect = EFFECT_BY_TAG[aTag];
      if (!effect) {
        warnings.push(`Código de análise "${aTag}" sem efeito conhecido — ignorado.`);
      } else {
        analysisCodes.push({ tag: aTag, name: aName, effect });
        tagByAnalysisName.set(normalizeName(aName), aTag);
      }
    }

    const person = text(row, ANEXO.team.name);
    if (person) {
      people.push({
        name: titleCase(person),
        email: emailFor(person, emailDomain),
      });
    }

    const os = text(row, ANEXO.project.os);
    const title = text(row, ANEXO.project.title);
    if (os && title) {
      const firm = text(row, ANEXO.project.designFirm) || null;
      if (firm) designFirms.add(firm);
      projectsByOs.set(os.toUpperCase(), {
        os,
        name: title,
        designFirm: firm,
        serviceOrder: text(row, ANEXO.project.serviceOrder) || null,
        hasDocuments: false,
      });
    }
  }

  /* --- lançamentos --- */

  const disciplineNames = new Map<string, string>();
  for (const d of disciplines) disciplineNames.set(d.tag, d.name);

  interface Grouped {
    doc: MasterDocument;
    rounds: Map<string, MasterRound[]>;
  }
  const grouped = new Map<string, Grouped>();
  let rows = 0;
  let rounds = 0;

  for (let i = BANCO.firstDataRow; i < banco.length; i += 1) {
    const row = banco[i] ?? [];
    const os = text(row, BANCO.projectOs).toUpperCase();
    const file = text(row, BANCO.document);
    if (!os || !file) continue;
    rows += 1;

    const lineNo = i + 1;

    let project = projectsByOs.get(os);
    if (!project) {
      // Projeto lançado sem estar no ANEXO: entra assim mesmo, com o nome da
      // própria linha. Descartar apagaria documentos reais.
      project = {
        os,
        name: text(row, BANCO.projectName) || os,
        designFirm: null,
        serviceOrder: null,
        hasDocuments: false,
      };
      projectsByOs.set(os, project);
      warnings.push(`Projeto ${os} não está no ANEXO — cadastrado pelo lançamento.`);
    }
    project.hasDocuments = true;

    const number = file.replace(/\.[a-z0-9]{2,5}$/i, "");
    // O código termina em <tipo>-<disciplina>-<sequencial>: o tipo é o
    // antepenúltimo segmento (DE, MC, MP, PQ...). Fora desse formato, sem tipo.
    const segments = number.split("-");
    const candidate = segments.length >= 4 ? segments[segments.length - 3] : "";
    const type = /^[A-Za-z]{2,3}$/.test(candidate) ? candidate.toUpperCase() : null;

    let revision = text(row, BANCO.revision).toUpperCase();
    if (!revision) {
      revision = "V1";
      warnings.push(`Linha ${lineNo} (${file}) sem revisão — assumida V1.`);
    }

    const disciplineTag = text(row, BANCO.disciplineTag).toUpperCase() || null;
    if (disciplineTag && !disciplineNames.has(disciplineTag)) {
      disciplineNames.set(disciplineTag, text(row, BANCO.disciplineName) || disciplineTag);
      disciplines.push({
        tag: disciplineTag,
        name: text(row, BANCO.disciplineName) || disciplineTag,
      });
      warnings.push(`Disciplina ${disciplineTag} não está no ANEXO — cadastrada.`);
    }

    const analysisName = text(row, BANCO.analysis);
    let analysisTag: string | null = null;
    if (analysisName) {
      analysisTag = tagByAnalysisName.get(normalizeName(analysisName)) ?? null;
      if (!analysisTag) {
        warnings.push(
          `Linha ${lineNo}: parecer "${analysisName}" não existe no ANEXO — revisão fica em análise.`,
        );
      }
    }

    // Agrupa por ARQUIVO, não pelo código: o mesmo codigo costuma existir em
    // .dwg, .pdf e .ifc, e cada arquivo tem seu próprio ciclo de análise na
    // planilha. Agrupar pelo código fundiria análises de arquivos diferentes
    // e inventaria retrabalho que não houve.
    const key = `${os} ${file}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        doc: {
          projectOs: os,
          number,
          name: file,
          type,
          disciplineTag,
          revisions: [],
        },
        rounds: new Map(),
      };
      grouped.set(key, entry);
    }

    const round: MasterRound = {
      issuedAt: toDate(row[BANCO.issuedAt]),
      dueAt: toDate(row[BANCO.dueAt]),
      analyzedAt: toDate(row[BANCO.analyzedAt]),
      analyst: text(row, BANCO.analyst) ? titleCase(text(row, BANCO.analyst)) : null,
      analysisTag,
      notes: text(row, BANCO.notes) || null,
    };

    const list = entry.rounds.get(revision) ?? [];
    // Linha idêntica repetida é digitação em duplicidade, não novo ciclo.
    const identical = list.some(
      (r) =>
        r.issuedAt?.getTime() === round.issuedAt?.getTime() &&
        r.analyzedAt?.getTime() === round.analyzedAt?.getTime() &&
        r.analysisTag === round.analysisTag,
    );
    if (identical) {
      warnings.push(`Linha ${lineNo} (${file} ${revision}) é repetição exata — ignorada.`);
      continue;
    }
    list.push(round);
    entry.rounds.set(revision, list);
    rounds += 1;
  }

  /* --- monta revisões a partir dos rounds --- */

  let open = 0;
  const documents: MasterDocument[] = [];

  for (const { doc, rounds: byRevision } of grouped.values()) {
    const names = [...byRevision.keys()].sort(
      (a, b) => revisionOrder(a) - revisionOrder(b) || a.localeCompare(b),
    );

    doc.revisions = names.map((name, index) => {
      const list = [...(byRevision.get(name) ?? [])].sort(
        (a, b) => (a.issuedAt?.getTime() ?? 0) - (b.issuedAt?.getTime() ?? 0),
      );
      const last = list[list.length - 1];

      const effect = last.analysisTag ? EFFECT_BY_TAG[last.analysisTag] : undefined;
      const status: DocumentStatus = effect ? STATUS_BY_EFFECT[effect] : "IN_REVIEW";
      if (status === "IN_REVIEW") open += 1;

      if (list.length > 1) {
        warnings.push(
          `${doc.number} ${name}: ${list.length} ciclos de análise na mesma revisão.`,
        );
      }

      const notes = [...new Set(list.map((r) => r.notes).filter(Boolean))].join(" | ");

      return {
        name,
        sequence: index,
        status,
        analysisTag: last.analysisTag,
        analyst: last.analyst,
        issuedAt: list[0].issuedAt,
        dueAt: last.dueAt,
        analyzedAt: last.analyzedAt,
        notes: notes || null,
        rounds: list,
      };
    });

    // Aprovada e sucedida por outra revisão vira substituída — comentada ou
    // reprovada preserva o desfecho, que é o motivo da revisão seguinte.
    for (let i = 0; i < doc.revisions.length - 1; i += 1) {
      if (doc.revisions[i].status === "APPROVED") {
        doc.revisions[i].status = "SUPERSEDED";
      }
    }

    documents.push(doc);
  }

  documents.sort(
    (a, b) => a.projectOs.localeCompare(b.projectOs) || a.number.localeCompare(b.number),
  );

  const projects = [...projectsByOs.values()].sort((a, b) => a.os.localeCompare(b.os));

  return {
    disciplines,
    analysisCodes,
    designFirms: [...designFirms].sort(),
    people,
    projects,
    documents,
    warnings,
    stats: {
      rows,
      documents: documents.length,
      revisions: documents.reduce((acc, d) => acc + d.revisions.length, 0),
      rounds,
      open,
    },
  };
}
