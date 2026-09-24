import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { canManageProjects } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { DeleteButton } from "@/components/delete-button";
import { deleteMeeting } from "@/app/actions/meetings";
import { isProjectWritable } from "@/lib/tasks";
import { formatDate } from "@/lib/format";
import { Card, SectionTitle, Empty, Button } from "@/components/ui";
import { ReadOnlyBanner } from "@/components/task-ui";
import { RequestTable } from "@/components/request-table";
import { RequestCreateForm } from "@/components/request-forms";
import { MeetingEditForm } from "@/components/meeting-forms";
import { meetingState, MEETING_STATE_LABEL, MEETING_STATE_COLOR, groupTopicsByCategory } from "@/lib/meetings";
import type { MeetingDetailRow, UserOption } from "@/types/models";
import { projectVisibility } from "@/lib/visibility";

export async function MeetingDetail({
  id,
  meetingId,
  user,
}: {
  id: string;
  meetingId: string;
  user: SessionUser;
}) {
  const meeting: (MeetingDetailRow & { project: { clientRef: { meetingFormCode: string | null } | null } }) | null =
    await prisma.meeting.findFirst({
      where: { id: meetingId, projectId: id, project: projectVisibility(user) },
      select: {
        id: true,
        date: true,
        title: true,
        location: true,
        startTime: true,
        preparedBy: true,
        number: true,
        subject: true,
        diverseSubjects: true,
        summary: true,
        externalUrl: true,
        teamsJoinUrl: true,
        createdAt: true,
        createdById: true,
        milestone: { select: { id: true, name: true } },
        project: {
          select: { id: true, name: true, status: true, clientRef: { select: { meetingFormCode: true } } },
        },
        participants: { orderBy: { order: "asc" }, select: { id: true, name: true, company: true, email: true, mode: true } },
        topics: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            category: true,
            date: true,
            description: true,
            responsible: true,
            dueDate: true,
            status: true,
          },
        },
        requests: {
          orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            type: true,
            description: true,
            status: true,
            waitingOn: true,
            dueAt: true,
            resolvedAt: true,
            createdAt: true,
            owner: { select: { id: true, name: true } },
            milestone: { select: { id: true, name: true } },
            documents: { select: { id: true, document: { select: { id: true, number: true, name: true } } } },
          },
        },
        _count: { select: { participants: true, topics: true, requests: true } },
      },
    });
  if (!meeting) notFound();

  const manage = canManageProjects(user);
  const writable = isProjectWritable(meeting.project.status);
  const isCreator = meeting.createdById === user.id;
  const canEdit = writable && (manage || isCreator);
  const now = new Date();
  const state = meetingState(meeting.date, meeting._count.topics, now);
  const backHref = meeting.milestone ? `/projects/${id}/tasks/${meeting.milestone.id}` : `/projects/${id}/meetings`;
  const hasClientTemplate = !!meeting.project.clientRef?.meetingFormCode;

  const tasks = canEdit
    ? await prisma.milestone.findMany({ where: { projectId: id }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const users: UserOption[] = canEdit
    ? await prisma.user.findMany({
        where: { isActive: true, organizationId: user.organizationId },
        select: { id: true, name: true, email: true, role: true, function: { select: { name: true } } },
        orderBy: { name: "asc" },
      })
    : [];

  const grouped = groupTopicsByCategory(meeting.topics);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
          <Link href={`/projects/${id}/meetings`} className="hover:text-ink-soft">
            ← Reuniões
          </Link>
          {meeting.milestone ? (
            <>
              <span>/</span>
              <Link href={backHref} className="hover:text-ink-soft">
                {meeting.milestone.name}
              </Link>
            </>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{meeting.title || meeting.subject || "Reunião"}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink">
              <span className={clsx("h-2 w-2 rounded-full", MEETING_STATE_COLOR[state])} />
              {MEETING_STATE_LABEL[state]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/reports/meeting/${meeting.id}`} target="_blank" rel="noreferrer">
              <Button variant="outline">PDF — DataPulse</Button>
            </a>
            {hasClientTemplate ? (
              <a href={`/api/reports/meeting/${meeting.id}?modelo=cliente`} target="_blank" rel="noreferrer">
                <Button variant="outline">PDF — modelo do cliente</Button>
              </a>
            ) : null}
            {canEdit ? (
              <DeleteButton
                action={deleteMeeting}
                idField="meetingId"
                id={meeting.id}
                confirm="Excluir esta reunião e a ata (participantes e tópicos)? Pendências geradas por ela continuam, só perdem o vínculo."
                returnTo={`/projects/${id}/meetings`}
              />
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          {formatDate(meeting.date)}
          {meeting.startTime ? ` · ${meeting.startTime}` : ""}
          {meeting.location ? ` · ${meeting.location}` : ""}
          {meeting.preparedBy ? ` · elaborado por ${meeting.preparedBy}` : ""}
          {meeting.number != null ? ` · ata nº ${meeting.number}` : ""}
        </p>
        {meeting.teamsJoinUrl ? (
          <a href={meeting.teamsJoinUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent hover:underline">
            Entrar na reunião (Teams)
          </a>
        ) : null}
      </section>

      <ReadOnlyBanner status={meeting.project.status} projectId={id} canReactivate={manage} />

      {meeting.subject ? (
        <section>
          <SectionTitle>Pauta</SectionTitle>
          <Card><p className="whitespace-pre-wrap text-sm text-ink">{meeting.subject}</p></Card>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle hint={`${meeting.participants.length} pessoa(s)`}>Participantes</SectionTitle>
          {meeting.participants.length === 0 ? (
            <Empty>Nenhum participante registrado.</Empty>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {meeting.participants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="text-ink">{p.name}</span>
                    <span className="text-right text-xs text-ink-faint">
                      {[p.company, p.email, p.mode].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        {meeting.summary ? (
          <div>
            <SectionTitle>Resumo</SectionTitle>
            <Card><p className="whitespace-pre-wrap text-sm text-ink">{meeting.summary}</p></Card>
          </div>
        ) : null}
      </section>

      <section>
        <SectionTitle hint={`${meeting.topics.length} tópico(s)`}>Desenvolvimento</SectionTitle>
        {meeting.topics.length === 0 ? (
          <Empty>Nenhum tópico registrado ainda — a ata desta reunião está em aberto.</Empty>
        ) : (
          <div className="space-y-5">
            {grouped
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.category}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">{g.category}</p>
                  <Card className="space-y-3 p-4">
                    {g.items.map((t) => (
                      <div key={t.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
                          <span>
                            {formatDate(t.date)}
                            {t.responsible ? ` · ${t.responsible}` : ""}
                            {t.dueDate ? ` · prazo ${formatDate(t.dueDate)}` : ""}
                          </span>
                          <span className="font-medium text-ink-soft">{t.status}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{t.description}</p>
                      </div>
                    ))}
                  </Card>
                </div>
              ))}
          </div>
        )}
      </section>

      {meeting.diverseSubjects ? (
        <section>
          <SectionTitle>Assuntos diversos</SectionTitle>
          <Card><p className="whitespace-pre-wrap text-sm text-ink">{meeting.diverseSubjects}</p></Card>
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionTitle hint="Pendências geradas nesta reunião — aparecem em Solicitações e em Minhas demandas">
          Solicitações{meeting.requests.length > 0 ? ` (${meeting.requests.length})` : ""}
        </SectionTitle>
        <RequestTable
          requests={meeting.requests}
          now={now}
          projectId={id}
          writable={writable}
          manage={manage}
          currentUserId={user.id}
          openMode="page"
        />
        {writable ? (
          <Card>
            <p className="mb-3 text-sm font-medium text-ink">Registrar pendência desta reunião</p>
            <RequestCreateForm
              projectId={id}
              milestoneId={meeting.milestone?.id}
              meetingId={meeting.id}
              users={users}
              documents={[]}
            />
          </Card>
        ) : null}
      </section>

      {canEdit ? (
        <section>
          <SectionTitle hint="Alterar qualquer campo, inclusive participantes e tópicos">Editar reunião</SectionTitle>
          <Card>
            <MeetingEditForm
              meeting={{
                id: meeting.id,
                date: meeting.date.toISOString().slice(0, 10),
                title: meeting.title ?? "",
                location: meeting.location ?? "",
                startTime: meeting.startTime ?? "",
                preparedBy: meeting.preparedBy ?? "",
                number: meeting.number != null ? String(meeting.number) : "",
                milestoneId: meeting.milestone?.id ?? "",
                subject: meeting.subject ?? "",
                diverseSubjects: meeting.diverseSubjects ?? "",
                summary: meeting.summary ?? "",
                externalUrl: meeting.externalUrl ?? "",
                teamsJoinUrl: meeting.teamsJoinUrl ?? "",
                participants: meeting.participants.map((p) => ({
                  name: p.name,
                  company: p.company ?? "",
                  email: p.email ?? "",
                  mode: p.mode ?? "",
                })),
                topics: meeting.topics.map((t) => ({
                  category: t.category ?? "",
                  date: t.date ? t.date.toISOString().slice(0, 10) : "",
                  description: t.description,
                  responsible: t.responsible ?? "",
                  dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "",
                  status: t.status,
                })),
              }}
              tasks={tasks}
            />
          </Card>
        </section>
      ) : null}
    </div>
  );
}
