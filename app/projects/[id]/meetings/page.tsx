import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageProjects } from "@/lib/authz";
import { isProjectWritable } from "@/lib/tasks";
import { ReadOnlyBanner } from "@/components/task-ui";
import { Button, SectionTitle } from "@/components/ui";
import { MeetingTable } from "@/components/meeting-table";
import type { MeetingRow } from "@/types/models";
import { projectVisibility } from "@/lib/visibility";

export const dynamic = "force-dynamic";

export default async function ProjectMeetingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}/meetings`);

  const project = await prisma.project.findFirst({
    where: { id, ...projectVisibility(user) },
    select: { id: true, name: true, status: true },
  });
  if (!project) notFound();

  const meetings: MeetingRow[] = await prisma.meeting.findMany({
    where: { projectId: id },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      title: true,
      location: true,
      startTime: true,
      preparedBy: true,
      number: true,
      subject: true,
      createdAt: true,
      milestone: { select: { id: true, name: true } },
      _count: { select: { participants: true, topics: true, requests: true } },
    },
  });

  const manage = canManageProjects(user);
  const writable = isProjectWritable(project.status);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/projects/${project.id}`} className="text-xs text-ink-faint hover:text-ink-soft">
            ← {project.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reuniões</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Ata de cada reunião de acompanhamento — o que foi discutido e o que ficou pendente.
          </p>
        </div>
        {writable ? (
          <Link href={`/projects/${project.id}/meetings/new`}>
            <Button>Nova reunião</Button>
          </Link>
        ) : null}
      </section>

      <ReadOnlyBanner status={project.status} projectId={project.id} canReactivate={manage} />

      <section>
        <SectionTitle hint="Mais recentes primeiro — agendadas aparecem no topo pela data futura">
          Todas
        </SectionTitle>
        <MeetingTable meetings={meetings} now={new Date()} projectId={project.id} />
      </section>
    </div>
  );
}
