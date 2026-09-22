"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireWriter, canManageProjects } from "@/lib/authz";
import { projectIsWritable, READONLY_MESSAGE } from "@/lib/server/project-guard";
import { canSeeProject } from "@/lib/server/project-access";
import { projectVisibility } from "@/lib/visibility";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optDate(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export interface MeetingFormState {
  ok?: boolean;
  error?: string;
  at?: number;
  meetingId?: string;
}

function revalidateMeeting(projectId: string, milestoneId?: string | null, meetingId?: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/meetings`);
  if (meetingId) revalidatePath(`/projects/${projectId}/meetings/${meetingId}`);
  if (milestoneId) revalidatePath(`/projects/${projectId}/tasks/${milestoneId}`);
}

/**
 * Linhas de participantes/tópicos chegam em arrays paralelos (um input por
 * coluna, repetido por linha, na ordem em que aparecem no formulário — sem
 * precisar de índice no nome do campo). Descarta a linha em branco.
 */
function zipParticipants(fd: FormData) {
  const names = fd.getAll("participantName").map(String);
  const companies = fd.getAll("participantCompany").map(String);
  const modes = fd.getAll("participantMode").map(String);
  const rows: { name: string; company: string | null; mode: string | null; order: number }[] = [];
  names.forEach((name, i) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    rows.push({
      name: trimmed,
      company: companies[i]?.trim() || null,
      mode: modes[i]?.trim() || null,
      order: rows.length,
    });
  });
  return rows;
}

function zipTopics(fd: FormData) {
  const categories = fd.getAll("topicCategory").map(String);
  const dates = fd.getAll("topicDate").map(String);
  const descriptions = fd.getAll("topicDescription").map(String);
  const responsibles = fd.getAll("topicResponsible").map(String);
  const dueDates = fd.getAll("topicDueDate").map(String);
  const statuses = fd.getAll("topicStatus").map(String);
  const rows: {
    category: string | null;
    date: Date | null;
    description: string;
    responsible: string | null;
    dueDate: Date | null;
    status: string;
    order: number;
  }[] = [];
  descriptions.forEach((description, i) => {
    const trimmed = description.trim();
    if (!trimmed) return;
    const d = dates[i]?.trim();
    const due = dueDates[i]?.trim();
    rows.push({
      category: categories[i]?.trim() || null,
      date: d ? new Date(d + "T00:00:00.000Z") : null,
      description: trimmed,
      responsible: responsibles[i]?.trim() || null,
      dueDate: due ? new Date(due + "T00:00:00.000Z") : null,
      status: statuses[i]?.trim() || "INFORMATIVO",
      order: rows.length,
    });
  });
  return rows;
}

async function validateMilestone(milestoneId: string, projectId: string): Promise<boolean> {
  const task = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
  return !!task && task.projectId === projectId;
}

/**
 * Cria a ata de uma reunião — cabeçalho (data, local, horário, elaborado
 * por), pauta, participantes e os tópicos discutidos. Pendências que
 * precisam de dono e prazo não nascem aqui: viram Solicitação à parte,
 * vinculada pela reunião (Request.meetingId).
 */
export async function createMeeting(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const user = await requireWriter();
  const projectId = str(formData, "projectId");
  if (!projectId) return { error: "Projeto não identificado." };
  if (!(await canSeeProject(user, projectId))) return { error: "Projeto não encontrado." };
  if (!(await projectIsWritable(projectId, user.organizationId))) return { error: READONLY_MESSAGE };

  const date = optDate(formData, "date");
  if (!date) return { error: "Informe a data da reunião." };

  const milestoneId = str(formData, "milestoneId") || null;
  if (milestoneId && !(await validateMilestone(milestoneId, projectId))) {
    return { error: "Tarefa selecionada não pertence a este projeto." };
  }

  const meeting = await prisma.meeting.create({
    data: {
      projectId,
      milestoneId,
      date,
      title: str(formData, "title") || null,
      location: str(formData, "location") || null,
      startTime: str(formData, "startTime") || null,
      preparedBy: str(formData, "preparedBy") || null,
      number: optInt(formData, "number"),
      subject: str(formData, "subject") || null,
      diverseSubjects: str(formData, "diverseSubjects") || null,
      summary: str(formData, "summary") || null,
      externalUrl: str(formData, "externalUrl") || null,
      teamsJoinUrl: str(formData, "teamsJoinUrl") || null,
      createdById: user.id,
      participants: { create: zipParticipants(formData) },
      topics: { create: zipTopics(formData) },
    },
  });

  // Agenda semanal: cria as próximas ocorrências já com data reservada,
  // repetindo o cabeçalho (local, horário, marco). Cada uma é um registro
  // independente — a ata de cada uma se preenche depois, na hora.
  const repeatWeeks = optInt(formData, "repeatWeeks") ?? 1;
  if (repeatWeeks > 1) {
    const baseNumber = optInt(formData, "number");
    const extra = Array.from({ length: Math.min(repeatWeeks, 52) - 1 }, (_, i) => {
      const nextDate = new Date(date.getTime() + (i + 1) * 7 * 86_400_000);
      return {
        projectId,
        milestoneId,
        date: nextDate,
        title: str(formData, "title") || null,
        location: str(formData, "location") || null,
        startTime: str(formData, "startTime") || null,
        preparedBy: str(formData, "preparedBy") || null,
        number: baseNumber != null ? baseNumber + i + 1 : null,
        subject: str(formData, "subject") || null,
        teamsJoinUrl: str(formData, "teamsJoinUrl") || null,
        createdById: user.id,
      };
    });
    if (extra.length > 0) await prisma.meeting.createMany({ data: extra });
  }

  revalidateMeeting(projectId, milestoneId, meeting.id);
  return { ok: true, at: Date.now(), meetingId: meeting.id };
}

async function loadMeeting(meetingId: string, user: { id: string; role: string; organizationId: string }) {
  return prisma.meeting.findFirst({
    where: { id: meetingId, project: projectVisibility(user) },
    select: {
      id: true,
      projectId: true,
      milestoneId: true,
      createdById: true,
      project: { select: { status: true } },
    },
  });
}

/** Edita a ata inteira — substitui participantes e tópicos pela lista enviada. */
export async function updateMeeting(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const user = await requireWriter();
  const meetingId = str(formData, "meetingId");
  if (!meetingId) return { error: "Reunião não identificada." };

  const meeting = await loadMeeting(meetingId, user);
  if (!meeting) return { error: "Reunião não encontrada." };
  if (meeting.project.status !== "ACTIVE") return { error: READONLY_MESSAGE };
  if (!canManageProjects(user) && meeting.createdById !== user.id) {
    return { error: "Só o gerente ou quem registrou a reunião podem editá-la." };
  }

  const date = optDate(formData, "date");
  if (!date) return { error: "Informe a data da reunião." };

  const milestoneId = str(formData, "milestoneId") || null;
  if (milestoneId && !(await validateMilestone(milestoneId, meeting.projectId))) {
    return { error: "Tarefa selecionada não pertence a este projeto." };
  }

  await prisma.$transaction([
    prisma.meetingParticipant.deleteMany({ where: { meetingId } }),
    prisma.meetingTopic.deleteMany({ where: { meetingId } }),
    prisma.meeting.update({
      where: { id: meetingId },
      data: {
        milestoneId,
        date,
        title: str(formData, "title") || null,
        location: str(formData, "location") || null,
        startTime: str(formData, "startTime") || null,
        preparedBy: str(formData, "preparedBy") || null,
        number: optInt(formData, "number"),
        subject: str(formData, "subject") || null,
        diverseSubjects: str(formData, "diverseSubjects") || null,
        summary: str(formData, "summary") || null,
        externalUrl: str(formData, "externalUrl") || null,
        teamsJoinUrl: str(formData, "teamsJoinUrl") || null,
        participants: { create: zipParticipants(formData) },
        topics: { create: zipTopics(formData) },
      },
    }),
  ]);

  revalidateMeeting(meeting.projectId, meeting.milestoneId, meetingId);
  if (milestoneId && milestoneId !== meeting.milestoneId) {
    revalidatePath(`/projects/${meeting.projectId}/tasks/${milestoneId}`);
  }
  return { ok: true, at: Date.now(), meetingId };
}

export interface DeleteResult {
  ok?: boolean;
  error?: string;
}

/**
 * Exclui a reunião e a ata (participantes, tópicos). Solicitações nascidas
 * dela não são excluídas — só perdem o vínculo (Request.meetingId → null),
 * porque a pendência continua valendo mesmo sem a ata que a originou.
 */
export async function deleteMeeting(formData: FormData): Promise<DeleteResult> {
  const user = await requireWriter();
  const meetingId = str(formData, "meetingId");
  if (!meetingId) return { error: "Reunião não identificada." };

  const meeting = await loadMeeting(meetingId, user);
  if (!meeting) return { error: "Reunião não encontrada." };
  if (meeting.project.status !== "ACTIVE") return { error: READONLY_MESSAGE };
  if (!canManageProjects(user) && meeting.createdById !== user.id) {
    return { error: "Só o gerente ou quem registrou a reunião podem excluí-la." };
  }

  await prisma.meeting.delete({ where: { id: meetingId } });
  revalidateMeeting(meeting.projectId, meeting.milestoneId, meetingId);
  return { ok: true };
}
