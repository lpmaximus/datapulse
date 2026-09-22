import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { Card } from "@/components/ui";
import { Toolbar } from "@/components/table-ui";
import { MeetingTable } from "@/components/meeting-table";
import { meetingState } from "@/lib/meetings";
import type { MeetingRow } from "@/types/models";
import { projectVisibility } from "@/lib/visibility";

export const dynamic = "force-dynamic";

const MEETING_SELECT = {
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
  project: { select: { id: true, name: true } },
  _count: { select: { participants: true, topics: true, requests: true } },
} as const;

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser("/meetings");
  const { q } = await searchParams;

  const meetings: MeetingRow[] = await prisma.meeting.findMany({
    where: {
      project: projectVisibility(user),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { subject: { contains: q, mode: "insensitive" } },
              { project: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { date: "desc" },
    take: 200,
    select: MEETING_SELECT,
  });

  const now = new Date();
  const scheduled = meetings.filter((m) => meetingState(m.date, m._count.topics, now) === "scheduled");
  const overdue = meetings.filter((m) => meetingState(m.date, m._count.topics, now) === "overdue");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Reuniões</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{meetings.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Agendadas</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{scheduled.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Ata pendente</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-orange-600">{overdue.length}</p>
        </Card>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="px-4 pt-4">
          <h1 className="text-xl font-semibold tracking-tight">Reuniões</h1>
          <p className="text-sm text-ink-soft">
            Todos os projetos. Cadastre uma reunião nova de dentro do projeto correspondente.
          </p>
        </div>

        <div>
          <Toolbar placeholder="Pesquisar por título, pauta ou projeto" />
        </div>

        <MeetingTable meetings={meetings} now={now} showProject />
      </div>
    </div>
  );
}
