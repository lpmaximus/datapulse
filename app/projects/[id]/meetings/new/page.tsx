import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { isProjectWritable, READONLY_MESSAGE } from "@/lib/tasks";
import { Card } from "@/components/ui";
import { MeetingCreateForm, type MeetingFollowUpPrefill } from "@/components/meeting-forms";
import { projectVisibility } from "@/lib/visibility";
import { topicsToCarryOver } from "@/lib/meetings";
import { formatDate } from "@/lib/format";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export const dynamic = "force-dynamic";

export default async function NewMeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string; from?: string }>;
}) {
  const { id } = await params;
  const { task: milestoneId, from } = await searchParams;
  const user = await requireUser(`/projects/${id}/meetings/new`);

  const project = await prisma.project.findFirst({
    where: { id, ...projectVisibility(user) },
    select: { id: true, name: true, status: true },
  });
  if (!project) notFound();
  if (!isProjectWritable(project.status)) redirect(`/projects/${id}/meetings?error=${encodeURIComponent(READONLY_MESSAGE)}`);

  const tasks = await prisma.milestone.findMany({
    where: { projectId: id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // "Nova reunião a partir desta": repete cabeçalho e participantes da
  // anterior e traz os tópicos em aberto para acompanhamento.
  let prefill: MeetingFollowUpPrefill | undefined;
  if (from) {
    const prev = await prisma.meeting.findFirst({
      where: { id: from, projectId: id },
      select: {
        id: true,
        date: true,
        title: true,
        location: true,
        startTime: true,
        preparedBy: true,
        number: true,
        milestoneId: true,
        subject: true,
        teamsJoinUrl: true,
        participants: { orderBy: { order: "asc" }, select: { name: true, company: true, email: true, mode: true } },
        topics: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            category: true,
            title: true,
            date: true,
            description: true,
            responsible: true,
            dueDate: true,
            status: true,
            sourceTopicId: true,
          },
        },
      },
    });
    if (!prev) notFound();
    // Sugere a mesma cadência semanal; a data continua editável.
    const nextDate = new Date(prev.date.getTime() + 7 * 86_400_000);
    prefill = {
      previousMeetingId: prev.id,
      previousLabel: `${prev.number != null ? `Ata nº ${prev.number} — ` : ""}${formatDate(prev.date)}`,
      date: iso(nextDate),
      title: prev.title ?? "",
      location: prev.location ?? "",
      startTime: prev.startTime ?? "",
      preparedBy: prev.preparedBy ?? "",
      number: prev.number != null ? String(prev.number + 1) : "",
      milestoneId: prev.milestoneId ?? "",
      subject: prev.subject ?? "",
      teamsJoinUrl: prev.teamsJoinUrl ?? "",
      participants: prev.participants.map((p) => ({
        name: p.name,
        company: p.company ?? "",
        email: p.email ?? "",
        mode: p.mode ?? "",
      })),
      topics: topicsToCarryOver(prev.topics).map((t) => ({
        category: t.category ?? "",
        title: t.title ?? "",
        date: iso(t.date),
        description: t.description,
        responsible: t.responsible ?? "",
        dueDate: iso(t.dueDate),
        status: t.status,
        sourceTopicId: t.sourceTopicId,
      })),
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={prefill ? `/projects/${project.id}/meetings/${prefill.previousMeetingId}` : `/projects/${project.id}/meetings`}
          className="text-xs text-ink-faint hover:text-ink-soft"
        >
          {prefill ? `← Reunião anterior (${prefill.previousLabel})` : `← Reuniões de ${project.name}`}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {prefill ? "Nova reunião de acompanhamento" : "Nova reunião"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {prefill
            ? `Cabeçalho e participantes repetidos da reunião anterior; os ${prefill.topics.length} item(ns) em aberto dela entram para acompanhamento. Ajuste o que mudou antes de salvar.`
            : "Registre agora a ata de uma reunião realizada, ou reserve a data e preencha depois."}
        </p>
      </div>
      <Card>
        <MeetingCreateForm projectId={project.id} milestoneId={milestoneId} tasks={tasks} prefill={prefill} />
      </Card>
    </div>
  );
}
