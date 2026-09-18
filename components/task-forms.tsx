"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addImpediment,
  createTask,
  updateTask,
  type TaskFormState,
} from "@/app/actions/tasks";
import { Button, Field, inputClass } from "@/components/ui";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, type TaskStatus } from "@/lib/tasks";
import type { UserOption } from "@/types/models";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

function Feedback({ state, okText }: { state: TaskFormState; okText: string }) {
  if (state.error) {
    return <p className="text-sm text-red-700">{state.error}</p>;
  }
  if (state.ok) return <p className="text-sm text-green-700">{okText}</p>;
  return null;
}

/** yyyy-mm-dd para <input type="date">, em UTC (as datas são gravadas como dia). */
function dateValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function PrioritySelect({ defaultValue = "MEDIUM" }: { defaultValue?: string }) {
  return (
    <select name="criticality" defaultValue={defaultValue} className={inputClass}>
      {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function AssigneeSelect({ users, defaultValue = "" }: { users: UserOption[]; defaultValue?: string }) {
  return (
    <select name="assigneeId" defaultValue={defaultValue} className={inputClass}>
      <option value="">Sem responsável</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
          {u.function ? ` — ${u.function.name}` : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * Cadastro de tarefa. Continua na tela após salvar e limpa o formulário —
 * quem monta o cronograma cadastra várias em sequência.
 */
export function TaskCreateForm({
  projectId,
  users,
  milestoneOptions,
}: {
  projectId: string;
  users: UserOption[];
  /** Marcos de topo do projeto — para agrupar a nova tarefa dentro de um deles. */
  milestoneOptions: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<TaskFormState, FormData>(createTask, {});
  const [kind, setKind] = useState("TASK");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.at) return;
    formRef.current?.reset();
    setKind("TASK");
    (formRef.current?.elements.namedItem("name") as HTMLInputElement | null)?.focus();
  }, [state.at]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="sm:col-span-2">
        <Field label="Nome da tarefa">
          <input name="name" required className={inputClass} placeholder="Ex.: Detalhamento das fundações" />
        </Field>
      </div>
      <Field label="Tipo" hint="Marco = ponto de verificação, sem duração">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value)}
          className={inputClass}
        >
          <option value="TASK">Tarefa</option>
          <option value="MILESTONE">Marco</option>
        </select>
      </Field>
      <Field label="Prioridade">
        <PrioritySelect />
      </Field>
      <Field label="Responsável">
        <AssigneeSelect users={users} />
      </Field>
      {kind === "TASK" ? (
        <Field label="Início">
          <input type="date" name="startDate" className={inputClass} />
        </Field>
      ) : null}
      {kind === "TASK" && milestoneOptions.length > 0 ? (
        <Field label="Marco" hint="Agrupa esta tarefa dentro de um marco, opcional">
          <select name="parentId" defaultValue="" className={inputClass}>
            <option value="">Sem marco</option>
            {milestoneOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label={kind === "MILESTONE" ? "Data do marco" : "Término planejado"}>
        <input type="date" name="plannedDate" className={inputClass} />
      </Field>
      <Field label="Impacto econômico" hint="Perda estimada se falhar">
        <input name="economicImpact" inputMode="numeric" className={inputClass} placeholder="1500000" />
      </Field>
      <Field label="Categoria">
        <input name="type" className={inputClass} placeholder="Engenharia, Suprimentos…" />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Submit label="Adicionar tarefa" busy="Salvando…" />
        <Feedback state={state} okText="Tarefa adicionada." />
      </div>
    </form>
  );
}

export interface EditableTask {
  id: string;
  name: string;
  kind: string;
  type: string | null;
  criticality: string;
  status: string;
  progress: number;
  startDate: Date | null;
  plannedDate: Date | null;
  forecastDate: Date | null;
  actualDate: Date | null;
  assigneeId: string | null;
  parentId: string | null;
}

/**
 * Edição da tarefa. `fullEdit` (gerente) libera escopo e linha de base; o
 * responsável atualiza só status, avanço e previsão — o servidor aplica a
 * mesma regra.
 */
export function TaskEditForm({
  task,
  users,
  fullEdit,
  milestoneOptions = [],
  childCount = 0,
}: {
  task: EditableTask;
  users: UserOption[];
  fullEdit: boolean;
  /** Marcos de topo do projeto (exceto este, quando ele próprio é marco). */
  milestoneOptions?: { id: string; name: string }[];
  /** Quantas tarefas pertencem a este registro — > 0 significa que é um marco-grupo. */
  childCount?: number;
}) {
  const [state, action] = useActionState<TaskFormState, FormData>(updateTask, {});
  const [status, setStatus] = useState(task.status);
  const [progress, setProgress] = useState(task.progress);
  const [kind, setKind] = useState(task.kind);
  const milestone = kind === "MILESTONE";
  const isGroup = childCount > 0;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="taskId" value={task.id} />

      {fullEdit ? (
        <>
          <div className="sm:col-span-2">
            <Field label="Nome">
              <input name="name" defaultValue={task.name} required className={inputClass} />
            </Field>
          </div>
          <Field label="Tipo" hint={isGroup ? "Marco com tarefas dentro não muda de tipo" : undefined}>
            <select
              name="kind"
              value={kind}
              disabled={isGroup}
              onChange={(e) => setKind(e.currentTarget.value)}
              className={inputClass}
            >
              <option value="TASK">Tarefa</option>
              <option value="MILESTONE">Marco</option>
            </select>
          </Field>
          <Field label="Prioridade">
            <PrioritySelect defaultValue={task.criticality} />
          </Field>
          <Field label="Responsável">
            <AssigneeSelect users={users} defaultValue={task.assigneeId ?? ""} />
          </Field>
          <Field label="Categoria">
            <input name="type" defaultValue={task.type ?? ""} className={inputClass} />
          </Field>
          {!milestone && !isGroup && milestoneOptions.length > 0 ? (
            <Field label="Marco" hint="Agrupa esta tarefa dentro de um marco, opcional">
              <select name="parentId" defaultValue={task.parentId ?? ""} className={inputClass}>
                <option value="">Sem marco</option>
                {milestoneOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </>
      ) : null}

      {isGroup ? (
        <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-soft">
          Status, avanço e prazo deste marco vêm das {childCount}{" "}
          {childCount === 1 ? "tarefa filha" : "tarefas filhas"} — calculados automaticamente, não são digitados aqui.
        </div>
      ) : (
        <>
          <Field label="Status">
            <select
              name="status"
              value={status}
              onChange={(e) => {
                const next = e.currentTarget.value;
                setStatus(next);
                if (next === "DONE") setProgress(100);
              }}
              className={inputClass}
            >
              {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>

          {milestone ? (
            <input type="hidden" name="progress" value={status === "DONE" ? 100 : 0} />
          ) : (
            <Field label={`Avanço: ${progress}%`}>
              <input
                type="range"
                name="progress"
                min={0}
                max={100}
                step={5}
                value={progress}
                disabled={status === "DONE"}
                onChange={(e) => setProgress(Number(e.currentTarget.value))}
                className="mt-2 w-full accent-blue-600"
              />
              {status === "DONE" ? <input type="hidden" name="progress" value={100} /> : null}
            </Field>
          )}

          {fullEdit && !milestone ? (
            <Field label="Início">
              <input type="date" name="startDate" defaultValue={dateValue(task.startDate)} className={inputClass} />
            </Field>
          ) : null}
          {fullEdit ? (
            <Field label={milestone ? "Data do marco (base)" : "Término planejado (base)"}>
              <input type="date" name="plannedDate" defaultValue={dateValue(task.plannedDate)} className={inputClass} />
            </Field>
          ) : null}
          <Field label="Previsão de término" hint="Deixe vazio se segue a linha de base — cada mudança fica no histórico">
            <input type="date" name="forecastDate" defaultValue={dateValue(task.forecastDate)} className={inputClass} />
          </Field>
          {status === "DONE" ? (
            <Field label="Término real">
              <input type="date" name="actualDate" defaultValue={dateValue(task.actualDate)} className={inputClass} />
            </Field>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Submit label="Salvar tarefa" busy="Salvando…" />
        <Feedback state={state} okText="Tarefa atualizada." />
      </div>
    </form>
  );
}

export function ImpedimentForm({ taskId, users }: { taskId: string; users: UserOption[] }) {
  const [state, action] = useActionState<TaskFormState, FormData>(addImpediment, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.at) formRef.current?.reset();
  }, [state.at]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
      <input type="hidden" name="taskId" value={taskId} />
      <Field label="O que está travando">
        <input
          name="description"
          required
          className={inputClass}
          placeholder="Ex.: aguardando retorno da proposta do fornecedor B"
        />
      </Field>
      <Field label="Depende de (terceiro)">
        <input name="waitingOn" className={inputClass} placeholder="Fornecedor B, Cliente…" />
      </Field>
      <Field label="Quem destrava (interno)">
        <select name="ownerId" defaultValue="" className={inputClass}>
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Submit label="Registrar impedimento" busy="Salvando…" />
        <Feedback state={state} okText="Impedimento registrado — a tarefa passou para Impedida." />
        <span className="text-xs text-ink-faint">A tarefa em aberto passa para &ldquo;Impedida&rdquo; automaticamente.</span>
      </div>
    </form>
  );
}
