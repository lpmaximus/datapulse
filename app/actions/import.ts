"use server";

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseRows, type ParsedRow } from "@/lib/parse-systemic";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import { normalizeHeader } from "@/lib/parse-systemic";
import { requireRole } from "@/lib/authz";
import { projectIsWritable, READONLY_MESSAGE } from "@/lib/server/project-guard";

export interface ImportState {
  ok?: boolean;
  error?: string;
  imported?: number;
  createdMilestones?: number;
  warnings?: string[];
  detectedColumns?: Record<string, string | null>;
}

function toRecords(buffer: Buffer, filename: string): Record<string, unknown>[] {
  const isCsv = /\.(csv|txt)$/i.test(filename);

  if (isCsv) {
    const text = buffer.toString("utf-8");
    // Cliente brasileiro costuma exportar CSV com ";" — deixa o Papa detectar.
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      delimitersToGuess: [",", ";", "\t", "|"],
    });
    return parsed.data;
  }

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

/**
 * Camada 1 — importa planilha de cronograma/custo.
 *
 * Tarefas são casadas por nome normalizado; nomes novos viram tarefas novas,
 * para o cliente não precisar cadastrar nada antes de subir a primeira planilha.
 */
export async function importSystemicSignals(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const projectId = String(formData.get("projectId") ?? "");
  const file = formData.get("file");

  if (!projectId) return { error: "Projeto não identificado." };
  if (!(await projectIsWritable(projectId, me.organizationId))) return { error: READONLY_MESSAGE };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo CSV ou XLSX." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: "Arquivo acima de 8 MB. Divida a planilha ou remova abas extras." };
  }

  let records: Record<string, unknown>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    records = toRecords(buffer, file.name);
  } catch {
    return { error: "Não consegui ler o arquivo. Confirme que é um CSV ou XLSX válido." };
  }

  const { rows, errors, detectedColumns } = parseRows(records);
  if (rows.length === 0) {
    return {
      error:
        errors[0]?.message ??
        "Nenhuma linha aproveitável. Verifique se há colunas de tarefa e de data/custo.",
      detectedColumns,
    };
  }

  const source = /\.(csv|txt)$/i.test(file.name) ? "CSV" : "XLSX";
  const referenceDate = new Date();

  const existing = await prisma.milestone.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const byName = new Map<string, string>(
    existing.map((m: { id: string; name: string }) => [normalizeHeader(m.name), m.id]),
  );

  let createdMilestones = 0;
  const toCreate: { row: ParsedRow; milestoneId: string }[] = [];

  for (const row of rows) {
    const key = normalizeHeader(row.milestoneName);
    let milestoneId: string | undefined = byName.get(key);

    if (milestoneId === undefined) {
      const created: { id: string } = await prisma.milestone.create({
        data: {
          projectId,
          name: row.milestoneName,
          plannedDate: row.plannedDate,
          actualDate: row.actualDate,
        },
        select: { id: true },
      });
      milestoneId = created.id;
      byName.set(key, milestoneId);
      createdMilestones += 1;
    }

    toCreate.push({ row, milestoneId });
  }

  await prisma.systemicSignal.createMany({
    data: toCreate.map(({ row, milestoneId }) => ({
      milestoneId,
      source,
      referenceDate,
      plannedDate: row.plannedDate,
      actualDate: row.actualDate,
      delayDays: row.delayDays,
      plannedCost: row.plannedCost,
      actualCost: row.actualCost,
      openIssues: row.openIssues,
      replanCount: row.replanCount,
      raw: row.raw as object,
    })),
  });

  // Mantém as datas da tarefa em dia com a última importação.
  await Promise.all(
    toCreate
      .filter(({ row }) => row.plannedDate || row.actualDate)
      .map(({ row, milestoneId }) =>
        prisma.milestone.update({
          where: { id: milestoneId },
          data: {
            ...(row.plannedDate ? { plannedDate: row.plannedDate } : {}),
            ...(row.actualDate ? { actualDate: row.actualDate } : {}),
          },
        }),
      ),
  );

  await recalculateProjectDRI(projectId);
  revalidatePath(`/projects/${projectId}`);

  return {
    ok: true,
    imported: toCreate.length,
    createdMilestones,
    warnings: errors.map((e) => `Linha ${e.line}: ${e.message}`),
    detectedColumns,
  };
}
