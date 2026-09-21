"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { projectVisibility } from "@/lib/visibility";
import { isTimeCategory, isWeekday, parseDay, parseHours } from "@/lib/timesheet";
import type { DeleteResult } from "@/components/delete-button";

/**
 * Apontamento de horas. Só o próprio especialista grava e edita as suas horas
 * (decisão de 21/09/2026): toda escrita filtra por `userId` da sessão, nunca
 * por um id vindo do formulário. Nem o coordenador lança no lugar de outro.
 */

export interface HoursFormState {
  error?: string;
  ok?: boolean;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

const ROLES = ["ADMIN", "MANAGER", "SPECIALIST"] as const;

/**
 * O vínculo é opcional e chega como "p:<id>" (projeto), "m:<id>" (tarefa) ou
 * "d:<id>" (documento). Só vale o que o usuário enxerga: a visibilidade do
 * projeto é a mesma do resto do sistema.
 */
async function resolveLink(
  user: { id: string; role: string; organizationId: string },
  raw: string,
): Promise<
  | { projectId: string | null; milestoneId: string | null; documentId: string | null }
  | { error: string }
> {
  const none = { projectId: null, milestoneId: null, documentId: null };
  if (!raw) return none;
  const kind = raw.slice(0, 2);
  const id = raw.slice(2);
  if (!id) return { error: "Vínculo inválido." };
  const visible = projectVisibility(user);

  if (kind === "p:") {
    const p = await prisma.project.findFirst({ where: { id, ...visible }, select: { id: true } });
    return p ? { ...none, projectId: p.id } : { error: "Projeto não encontrado." };
  }
  if (kind === "m:") {
    const m = await prisma.milestone.findFirst({
      where: { id, project: visible },
      select: { id: true, projectId: true },
    });
    return m
      ? { projectId: m.projectId, milestoneId: m.id, documentId: null }
      : { error: "Tarefa não encontrada." };
  }
  if (kind === "d:") {
    const d = await prisma.document.findFirst({
      where: { id, project: visible },
      select: { id: true, projectId: true },
    });
    return d
      ? { projectId: d.projectId, milestoneId: null, documentId: d.id }
      : { error: "Documento não encontrado." };
  }
  return { error: "Vínculo inválido." };
}

/** Lança horas PREVISTAS num dia útil. Pode ser dia passado (ajuste retroativo). */
export async function createTimeEntry(
  _prev: HoursFormState,
  formData: FormData,
): Promise<HoursFormState> {
  const user = await requireRole([...ROLES]);

  const date = parseDay(str(formData, "date"));
  if (!date) return { error: "Data inválida." };
  if (!isWeekday(date)) return { error: "Lance horas em dias úteis (segunda a sexta)." };

  const category = str(formData, "category");
  if (!isTimeCategory(category)) return { error: "Escolha o tipo de atividade." };

  const parsed = parseHours(str(formData, "hours"));
  if ("error" in parsed) return { error: parsed.error };

  const link = await resolveLink(user, str(formData, "link"));
  if ("error" in link) return { error: link.error };

  const note = str(formData, "note").slice(0, 300) || null;

  await prisma.timeEntry.create({
    data: {
      userId: user.id,
      date,
      category,
      plannedHours: parsed.hours,
      note,
      ...link,
    },
  });

  revalidatePath("/hours");
  return { ok: true };
}

/**
 * Ajusta o REALIZADO de um lançamento. Campo vazio limpa o ajuste e o
 * lançamento volta a valer pelo previsto.
 */
export async function updateActualHours(
  _prev: HoursFormState,
  formData: FormData,
): Promise<HoursFormState> {
  const user = await requireRole([...ROLES]);

  const id = str(formData, "entryId");
  if (!id) return { error: "Lançamento não identificado." };

  const raw = str(formData, "actualHours");
  let actualHours: number | null = null;
  if (raw) {
    const parsed = parseHours(raw);
    if ("error" in parsed) return { error: parsed.error };
    actualHours = parsed.hours;
  }

  const { count } = await prisma.timeEntry.updateMany({
    where: { id, userId: user.id },
    data: { actualHours },
  });
  if (count === 0) return { error: "Lançamento não encontrado." };

  revalidatePath("/hours");
  return { ok: true };
}

export async function deleteTimeEntry(formData: FormData): Promise<DeleteResult> {
  const user = await requireRole([...ROLES]);

  const id = str(formData, "entryId");
  if (!id) return { error: "Lançamento não identificado." };

  const { count } = await prisma.timeEntry.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return { error: "Lançamento não encontrado." };

  revalidatePath("/hours");
  return { ok: true };
}
