"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import type { Criticality } from "@/lib/dri";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optDate(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createProject(formData: FormData): Promise<void> {
  const name = str(formData, "name");
  if (!name) redirect("/projects/new?error=nome-obrigatorio");

  const project = await prisma.project.create({
    data: {
      name,
      client: str(formData, "client") || null,
      sector: str(formData, "sector") || null,
      startsAt: optDate(formData, "startsAt"),
      endsAt: optDate(formData, "endsAt"),
    },
  });

  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}

export async function createMilestone(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  const name = str(formData, "name");
  if (!projectId || !name) {
    redirect(`/projects/${projectId}?error=marco-invalido`);
  }

  const impactRaw = str(formData, "economicImpact");
  const impact = impactRaw ? Number(impactRaw.replace(/[^\d.-]/g, "")) : null;

  await prisma.milestone.create({
    data: {
      projectId,
      name,
      type: str(formData, "type") || null,
      criticality: (str(formData, "criticality") || "MEDIUM") as Criticality,
      economicImpact: impact != null && Number.isFinite(impact) ? impact : null,
      plannedDate: optDate(formData, "plannedDate"),
      forecastDate: optDate(formData, "forecastDate"),
    },
  });

  await recalculateProjectDRI(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/milestones");
}

/** Recálculo manual — útil na demo, sem esperar o cron. */
export async function recalculateNow(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  if (!projectId) return;
  await recalculateProjectDRI(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

/**
 * Alterna ACTIVE/PAUSED direto da tabela — mesma UX do toggle "Ativar/des"
 * do gerenciador de referência. CLOSED não é alcançável por aqui de propósito
 * (é um estado terminal, não um "desligar" reversível).
 */
export async function toggleProjectStatus(formData: FormData): Promise<void> {
  const projectId = str(formData, "projectId");
  if (!projectId) return;

  const next = formData.get("active") === "on" ? "ACTIVE" : "PAUSED";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project || project.status === "CLOSED") return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: next },
  });

  revalidatePath("/projects");
  revalidatePath("/");
}
