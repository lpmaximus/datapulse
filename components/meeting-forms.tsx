"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import {
  createMeeting,
  updateMeeting,
  type MeetingFormState,
} from "@/app/actions/meetings";
import { Button, Field, inputClass } from "@/components/ui";
import { MEETING_TOPIC_CATEGORY_OPTIONS, MEETING_TOPIC_STATUSES, meetingCategoryLabel } from "@/lib/meetings";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

function Feedback({ state, okText }: { state: MeetingFormState; okText: string }) {
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-green-700">{okText}</p>;
  return null;
}

const smallInput = inputClass + " py-1.5 text-sm";

export interface ParticipantDraft {
  name: string;
  company: string;
  email: string;
  mode: string;
}

export interface TopicDraft {
  category: string;
  title: string;
  date: string;
  description: string;
  responsible: string;
  dueDate: string;
  status: string;
}

const BLANK_PARTICIPANT: ParticipantDraft = { name: "", company: "", email: "", mode: "" };
const BLANK_TOPIC: TopicDraft = { category: "ASSUNTOS GERAIS", title: "", date: "", description: "", responsible: "", dueDate: "", status: "INFORMATIVO" };

/**
 * Lista de participantes da reunião: nome, empresa e como participou (vira
 * a coluna "Assinatura" no modelo do cliente). Sem vínculo com User — cobre
 * qualquer presente, de qualquer empresa.
 */
function ParticipantsField({ initial }: { initial: ParticipantDraft[] }) {
  const [rows, setRows] = useState<ParticipantDraft[]>(initial.length ? initial : [BLANK_PARTICIPANT]);

  function set(i: number, patch: Partial<ParticipantDraft>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-ink-soft">
        <span>Nome</span>
        <span>Empresa</span>
        <span>E-mail</span>
        <span>Como participou</span>
        <span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
          <input
            name="participantName"
            value={row.name}
            onChange={(e) => set(i, { name: e.target.value })}
            placeholder="Nome do participante"
            className={smallInput}
          />
          <input
            name="participantCompany"
            value={row.company}
            onChange={(e) => set(i, { company: e.target.value })}
            placeholder="Empresa"
            className={smallInput}
          />
          <input
            type="email"
            name="participantEmail"
            value={row.email}
            onChange={(e) => set(i, { email: e.target.value })}
            placeholder="nome@empresa.com"
            className={smallInput}
          />
          <input
            name="participantMode"
            value={row.mode}
            onChange={(e) => set(i, { mode: e.target.value })}
            placeholder="Via Teams, presencial…"
            className={smallInput}
          />
          <button
            type="button"
            onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : [BLANK_PARTICIPANT]))}
            aria-label="Remover participante"
            className="rounded-md p-1.5 text-ink-faint hover:text-red-700"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((r) => [...r, BLANK_PARTICIPANT])}
        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        <Plus size={12} /> Adicionar participante
      </button>
    </div>
  );
}

/**
 * Tabela "Desenvolvimento" da ata: o que foi discutido, por quem, prazo e
 * status — categoria = seção da ata da MRS; título é o subtítulo opcional
 * do item (ex.: "Visão Geral").
 */
function TopicsField({ initial }: { initial: TopicDraft[] }) {
  const [rows, setRows] = useState<TopicDraft[]>(initial.length ? initial : [BLANK_TOPIC]);

  function set(i: number, patch: Partial<TopicDraft>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-line p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <select
              name="topicCategory"
              value={row.category}
              onChange={(e) => set(i, { category: e.target.value })}
              className={smallInput}
              aria-label="Categoria"
            >
              {/* Categoria antiga (fora da lista MRS) continua visível até ser trocada. */}
              {row.category && !(MEETING_TOPIC_CATEGORY_OPTIONS as readonly string[]).includes(row.category) ? (
                <option value={row.category}>{row.category}</option>
              ) : null}
              {MEETING_TOPIC_CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {meetingCategoryLabel(c)}
                </option>
              ))}
            </select>
            <input
              name="topicTitle"
              value={row.title}
              onChange={(e) => set(i, { title: e.target.value })}
              placeholder="Título (opcional)"
              className={smallInput}
            />
            <input
              type="date"
              name="topicDate"
              value={row.date}
              onChange={(e) => set(i, { date: e.target.value })}
              className={smallInput}
              aria-label="Data"
            />
            <input
              name="topicResponsible"
              value={row.responsible}
              onChange={(e) => set(i, { responsible: e.target.value })}
              placeholder="Quem?"
              className={smallInput}
            />
            <input
              type="date"
              name="topicDueDate"
              value={row.dueDate}
              onChange={(e) => set(i, { dueDate: e.target.value })}
              className={smallInput}
              aria-label="Quando?"
            />
            <select
              name="topicStatus"
              value={row.status}
              onChange={(e) => set(i, { status: e.target.value })}
              className={smallInput}
            >
              {MEETING_TOPIC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex items-start gap-2">
            <textarea
              name="topicDescription"
              value={row.description}
              onChange={(e) => set(i, { description: e.target.value })}
              placeholder="O que foi discutido…"
              rows={2}
              className={smallInput + " flex-1"}
            />
            <button
              type="button"
              onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : [BLANK_TOPIC]))}
              aria-label="Remover tópico"
              className="mt-1.5 shrink-0 rounded-md p-1.5 text-ink-faint hover:text-red-700"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((r) => [...r, BLANK_TOPIC])}
        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        <Plus size={12} /> Adicionar tópico
      </button>
    </div>
  );
}

/** Campos do cabeçalho — compartilhados entre criar e editar. */
function HeaderFields({
  date,
  title,
  location,
  startTime,
  preparedBy,
  number,
  milestoneId,
  subject,
  diverseSubjects,
  summary,
  externalUrl,
  teamsJoinUrl,
  tasks,
}: {
  date: string;
  title: string;
  location: string;
  startTime: string;
  preparedBy: string;
  number: string;
  milestoneId: string;
  subject: string;
  diverseSubjects: string;
  summary: string;
  externalUrl: string;
  teamsJoinUrl: string;
  tasks: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Data da reunião">
        <input type="date" name="date" required defaultValue={date} className={inputClass} />
      </Field>
      <Field label="Horário" hint="Texto livre — ex.: 10h">
        <input name="startTime" defaultValue={startTime} className={inputClass} />
      </Field>
      <Field label="Local">
        <input name="location" defaultValue={location} placeholder="Online, escritório…" className={inputClass} />
      </Field>
      <Field label="Elaborado por">
        <input name="preparedBy" defaultValue={preparedBy} className={inputClass} />
      </Field>
      <Field label="Número da ata" hint="Opcional — padrão do cliente">
        <input type="number" name="number" defaultValue={number} className={inputClass} />
      </Field>
      <Field label="Tarefa / marco" hint="Opcional">
        <select name="milestoneId" defaultValue={milestoneId} className={inputClass}>
          <option value="">Só do projeto</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <Field label="Assunto" hint="Ex.: Reunião de projetos — acompanhamento semanal. Em branco usa o nome do projeto.">
          <input name="title" defaultValue={title} className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <Field label="Pauta">
          <textarea name="subject" defaultValue={subject} rows={2} className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <Field label="Resumo" hint="Texto livre do que foi discutido — usado no modelo DataPulse; opcional se os tópicos abaixo já cobrem tudo">
          <textarea name="summary" defaultValue={summary} rows={3} className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Assuntos diversos" hint="Opcional">
          <textarea name="diverseSubjects" defaultValue={diverseSubjects} rows={2} className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Link do arquivo da ata" hint="Opcional — Drive/SharePoint, se houver registro externo">
          <input name="externalUrl" defaultValue={externalUrl} placeholder="https://…" className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Link da reunião (Teams)" hint="Cole aqui por enquanto — integração automática com o Teams ainda não existe">
          <input name="teamsJoinUrl" defaultValue={teamsJoinUrl} placeholder="https://teams.microsoft.com/…" className={inputClass} />
        </Field>
      </div>
    </div>
  );
}

export function MeetingCreateForm({
  projectId,
  milestoneId,
  tasks,
}: {
  projectId: string;
  milestoneId?: string;
  tasks: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<MeetingFormState, FormData>(createMeeting, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <input type="hidden" name="projectId" value={projectId} />
      <HeaderFields
        date=""
        title=""
        location=""
        startTime=""
        preparedBy=""
        number=""
        milestoneId={milestoneId ?? ""}
        subject=""
        diverseSubjects=""
        summary=""
        externalUrl=""
        teamsJoinUrl=""
        tasks={tasks}
      />
      <div className="rounded-lg border border-dashed border-line-strong p-3">
        <Field label="Repetir semanalmente" hint="Programa já as próximas datas — a ata de cada uma se preenche depois, na hora dela">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-soft">Por</span>
            <input
              type="number"
              name="repeatWeeks"
              min={1}
              max={52}
              defaultValue={1}
              className={inputClass + " w-20"}
            />
            <span className="text-sm text-ink-soft">semana(s), a partir da data acima</span>
          </div>
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-ink">Participantes</p>
        <ParticipantsField initial={[]} />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-ink">Desenvolvimento (o que foi discutido)</p>
        <TopicsField initial={[]} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Registrar reunião" busy="Salvando…" />
        <Feedback state={state} okText="Reunião registrada." />
      </div>
    </form>
  );
}

export function MeetingEditForm({
  meeting,
  tasks,
}: {
  meeting: {
    id: string;
    date: string;
    title: string;
    location: string;
    startTime: string;
    preparedBy: string;
    number: string;
    milestoneId: string;
    subject: string;
    diverseSubjects: string;
    summary: string;
    externalUrl: string;
    teamsJoinUrl: string;
    participants: ParticipantDraft[];
    topics: TopicDraft[];
  };
  tasks: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<MeetingFormState, FormData>(updateMeeting, {});

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="meetingId" value={meeting.id} />
      <HeaderFields
        date={meeting.date}
        title={meeting.title}
        location={meeting.location}
        startTime={meeting.startTime}
        preparedBy={meeting.preparedBy}
        number={meeting.number}
        milestoneId={meeting.milestoneId}
        subject={meeting.subject}
        diverseSubjects={meeting.diverseSubjects}
        summary={meeting.summary}
        externalUrl={meeting.externalUrl}
        teamsJoinUrl={meeting.teamsJoinUrl}
        tasks={tasks}
      />
      <div>
        <p className="mb-2 text-sm font-medium text-ink">Participantes</p>
        <ParticipantsField initial={meeting.participants} />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-ink">Desenvolvimento (o que foi discutido)</p>
        <TopicsField initial={meeting.topics} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Salvar reunião" busy="Salvando…" />
        <Feedback state={state} okText="Reunião atualizada." />
      </div>
    </form>
  );
}
