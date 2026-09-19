/**
 * Leitura de cronograma do MS Project (XML "MSPDI", exportado por
 * Arquivo > Salvar como > XML) e conversão para o modelo do DataPulse:
 * Marco → Tarefa, só dois níveis. Módulo puro — sem Prisma nem Next —
 * testado em test/parse-mpp.test.mjs.
 *
 * O cronograma tem até 7 níveis de resumo; o DataPulse tem 2. A regra:
 *
 *   - cada tarefa-resumo de nível 2 (filha direta do projeto) vira um MARCO;
 *   - toda tarefa "folha" abaixo dele vira uma TAREFA daquele marco, e os
 *     resumos intermediários (níveis 3+) entram como prefixo do nome
 *     ("Drenagem profunda › Lado Direto - E1 › Imprimação"), porque o mesmo
 *     nome se repete em vários grupos e sem o contexto ele não identifica nada;
 *   - folha de nível 2 (sem grupo) de um só dia, ou marcada como marco no
 *     MS Project, vira um MARCO sem filhas; as demais viram TAREFA sem marco.
 */

export interface MppTask {
  uid: number;
  name: string;
  /** OutlineLevel: 1 = o próprio projeto. */
  level: number;
  summary: boolean;
  milestone: boolean;
  /** Datas como "YYYY-MM-DD" (o horário do MS Project é ignorado). */
  start: string | null;
  finish: string | null;
  baselineStart: string | null;
  baselineFinish: string | null;
  percentComplete: number;
}

export interface PlanTask {
  /** Ordem original no cronograma, para reproduzir a sequência. */
  order: number;
  name: string;
  kind: "TASK" | "MILESTONE";
  /** Nome do Marco pai (null = sem marco). */
  parent: string | null;
  startDate: Date | null;
  plannedDate: Date | null;
  forecastDate: Date | null;
  progress: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE";
}

export interface PlanMarker {
  order: number;
  name: string;
  plannedDate: Date | null;
}

export interface MppPlan {
  projectName: string;
  markers: PlanMarker[];
  tasks: PlanTask[];
  warnings: string[];
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decode(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? decode(m[1]).trim() : null;
}

function day(s: string | null): string | null {
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** Lê as tarefas do XML na ordem em que aparecem (a ordem do cronograma). */
export function parseMppXml(xml: string): { projectName: string; tasks: MppTask[] } {
  // O namespace costuma ser o padrão, mas alguns exportadores prefixam as tags.
  const clean = xml.replace(/<(\/?)[A-Za-z0-9_]+:/g, "<$1");
  const tasksBlock = clean.match(/<Tasks>([\s\S]*?)<\/Tasks>/);
  if (!tasksBlock) throw new Error("O arquivo não tem <Tasks>: não parece um XML do MS Project.");

  const tasks: MppTask[] = [];
  for (const m of tasksBlock[1].matchAll(/<Task>([\s\S]*?)<\/Task>/g)) {
    const block = m[1];

    // Linha de base 0 (a "Salvar linha de base" padrão do MS Project).
    let baselineStart: string | null = null;
    let baselineFinish: string | null = null;
    for (const b of block.matchAll(/<Baseline>([\s\S]*?)<\/Baseline>/g)) {
      if (tag(b[1], "Number") === "0") {
        baselineStart = day(tag(b[1], "Start"));
        baselineFinish = day(tag(b[1], "Finish"));
      }
    }

    // Blocos aninhados repetem tags (Start, Finish, Name...): tirar antes de ler o nível da tarefa.
    const flat = block
      .replace(/<Baseline>[\s\S]*?<\/Baseline>/g, "")
      .replace(/<PredecessorLink>[\s\S]*?<\/PredecessorLink>/g, "")
      .replace(/<ExtendedAttribute>[\s\S]*?<\/ExtendedAttribute>/g, "")
      .replace(/<TimephasedData>[\s\S]*?<\/TimephasedData>/g, "");

    if (tag(flat, "IsNull") === "1") continue;
    const name = tag(flat, "Name");
    const level = Number(tag(flat, "OutlineLevel"));
    if (!name || !Number.isFinite(level)) continue;

    tasks.push({
      uid: Number(tag(flat, "UID")),
      name,
      level,
      summary: tag(flat, "Summary") === "1",
      milestone: tag(flat, "Milestone") === "1",
      start: day(tag(flat, "Start")),
      finish: day(tag(flat, "Finish")),
      baselineStart,
      baselineFinish,
      percentComplete: Number(tag(flat, "PercentComplete") ?? 0) || 0,
    });
  }

  const root = tasks.find((t) => t.level === 1);
  const title = tag(clean.replace(/<Tasks>[\s\S]*<\/Tasks>/, ""), "Title") || tag(clean.replace(/<Tasks>[\s\S]*<\/Tasks>/, ""), "Name");
  return { projectName: title || root?.name || "", tasks };
}

const utc = (s: string | null): Date | null => (s ? new Date(`${s}T00:00:00.000Z`) : null);

export interface PlanOptions {
  /**
   * Como ler as datas. Por padrão as datas ATUAIS do cronograma são a linha de
   * base do DataPulse (o arquivo é a "Nova LB"). Com `useMppBaseline`, a linha
   * de base 0 do MS Project vira o planejado e as datas atuais viram o previsto.
   */
  useMppBaseline?: boolean;
}

/** Converte as tarefas do MS Project em Marcos e Tarefas do DataPulse. */
export function planFromMpp(tasks: MppTask[], opts: PlanOptions = {}): MppPlan {
  const markers: PlanMarker[] = [];
  const out: PlanTask[] = [];
  const warnings: string[] = [];

  const dates = (t: MppTask) => {
    if (opts.useMppBaseline && t.baselineFinish) {
      return {
        startDate: utc(t.baselineStart ?? t.start),
        plannedDate: utc(t.baselineFinish),
        forecastDate: t.finish && t.finish !== t.baselineFinish ? utc(t.finish) : null,
      };
    }
    return { startDate: utc(t.start), plannedDate: utc(t.finish), forecastDate: null };
  };

  const progress = (t: MppTask) => {
    const p = Math.max(0, Math.min(100, Math.round(t.percentComplete)));
    return {
      progress: p >= 100 ? 100 : p,
      status: (p >= 100 ? "DONE" : p > 0 ? "IN_PROGRESS" : "NOT_STARTED") as PlanTask["status"],
    };
  };

  const path: string[] = []; // resumos de nível 3+ que estão abertos
  let marker: string | null = null;
  let projectName = "";
  const usedMarkers = new Set<string>();
  const usedTasks = new Map<string, number>();

  const uniqueTaskName = (parent: string | null, name: string): string => {
    const key = `${parent ?? ""}\u0000${name}`;
    const n = (usedTasks.get(key) ?? 0) + 1;
    usedTasks.set(key, n);
    if (n === 1) return name;
    warnings.push(`Nome repetido no mesmo marco: "${name}" (ocorrência ${n}) — numerado para não confundir.`);
    return `${name} (${n})`;
  };

  tasks.forEach((t, order) => {
    if (t.level === 1) {
      projectName = t.name;
      return;
    }
    if (t.level === 2) {
      path.length = 0;
      marker = null;
      const isMarker = t.summary || t.milestone || (!!t.start && t.start === t.finish);
      if (t.summary || isMarker) {
        let name = t.name;
        if (usedMarkers.has(name)) {
          warnings.push(`Marco repetido: "${name}" — renomeado.`);
          name = `${name} (2)`;
        }
        usedMarkers.add(name);
        markers.push({ order, name, plannedDate: dates(t).plannedDate });
        // Marco sem filhas é ponto de controle; marco com filhas é só o grupo.
        if (t.summary) marker = name;
        return;
      }
      // Folha de nível 2 com duração: tarefa avulsa, sem marco.
      out.push({
        order,
        name: uniqueTaskName(null, t.name),
        kind: "TASK",
        parent: null,
        ...dates(t),
        ...progress(t),
      });
      return;
    }

    // Nível 3+: mantém a pilha de resumos abertos (índice 0 = nível 3).
    path.length = Math.min(path.length, t.level - 3);
    if (t.summary) {
      path[t.level - 3] = t.name;
      return;
    }
    const label = [...path, t.name].join(" › ");
    out.push({
      order,
      name: uniqueTaskName(marker, label),
      kind: "TASK",
      parent: marker,
      ...dates(t),
      ...progress(t),
    });
  });

  for (const t of out) {
    if (t.startDate && t.plannedDate && t.startDate > t.plannedDate) {
      warnings.push(`Início depois do término em "${t.name}" — início ajustado para o término.`);
      t.startDate = t.plannedDate;
    }
  }

  return { projectName, markers, tasks: out, warnings };
}
