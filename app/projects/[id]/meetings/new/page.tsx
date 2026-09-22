import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { isProjectWritable, READONLY_MESSAGE } from "@/lib/tasks";
import { Card } from "@/components/ui";
import { MeetingCreateForm } from "@/components/meeting-forms";
import { projectVisibility } from "@/lib/visibility";

export const dynamic = "force-dynamic";

export default async function NewMeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { id } = await params;
  const { task: milestoneId } = await searchParams;
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

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${project.id}/meetings`} className="text-xs text-ink-faint hover:text-ink-soft">
          ← Reuniões de {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nova reunião</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Registre agora a ata de uma reunião realizada, ou reserve a data e preencha depois.
        </p>
      </div>
      <Card>
        <MeetingCreateForm projectId={project.id} milestoneId={milestoneId} tasks={tasks} />
      </Card>
    </div>
  );
}
