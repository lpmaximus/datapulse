"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createRequest,
  dismissRequest,
  reopenRequest,
  rescheduleRequest,
  resolveRequest,
  updateRequest,
  type RequestFormState,
} from "@/app/actions/requests";
import { Button, Field, inputClass } from "@/components/ui";
import type { UserOption } from "@/types/models";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

function Feedback({ state, okText }: { state: RequestFormState; okText: string }) {
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-green-700">{okText}</p>;
  return null;
}

export interface DocumentOption {
  id: string;
  number: string | null;
  name: string;
}

/**
 * Cadastro de solicitação: pedido de documento de referência, informação
 * complementar etc. Pode ficar solto no projeto, ligado a uma tarefa/marco,
 * e/ou apontar para um ou mais documentos já cadastrados.
 */
export function RequestCreateForm({
  projectId,
  milestoneId,
  users,
  documents,
}: {
  projectId: string;
  /** Pré-vincula a uma tarefa/marco quando o formulário aparece na tela dela. */
  milestoneId?: string;
  users: UserOption[];
  documents: DocumentOption[];
}) {
  const [state, action] = useActionState<RequestFormState, FormData>(createRequest, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.at) formRef.current?.reset();
  }, [state.at]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="projectId" value={projectId} />
      {milestoneId ? <input type="hidden" name="milestoneId" value={milestoneId} /> : null}
      <div className="sm:col-span-2">
        <Field label="Solicitação">
          <input
            name="description"
            required
            className={inputClass}
            placeholder="Ex.: solicitar lista de documentos de referência ao cliente"
          />
        </Field>
      </div>
      <Field label="Tipo" hint="Documento de referência, informação complementar…">
        <input name="type" className={inputClass} placeholder="Documento de referência" />
      </Field>
      <Field label="Prazo">
        <input type="date" name="dueAt" className={inputClass} />
      </Field>
      <Field label="Depende de (terceiro)">
        <input name="waitingOn" className={inputClass} placeholder="Cliente, Empresa X…" />
      </Field>
      <Field label="Quem cobra (interno)">
        <select name="ownerId" defaultValue="" className={inputClass}>
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      {documents.length > 0 ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <Field label="Documentos relacionados" hint="Opcional — quando a solicitação é sobre documentos específicos">
            <select name="documentIds" multiple className={inputClass + " h-24"}>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.number ? `${d.number} — ` : ""}
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Submit label="Registrar solicitação" busy="Salvando…" />
        <Feedback state={state} okText="Solicitação registrada." />
      </div>
    </form>
  );
}

/** Reprograma o prazo — grava no histórico em vez de só sobrescrever. */
export function RequestRescheduleForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState<RequestFormState, FormData>(rescheduleRequest, {});
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.at) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.at]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-accent hover:underline">
        Reprogramar
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="date" name="dueAt" required className={inputClass + " w-auto"} />
      <input name="reason" placeholder="Motivo (opcional)" className={inputClass + " w-auto"} />
      <Submit label="Salvar" busy="Salvando…" />
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-faint hover:underline">
        Cancelar
      </button>
      <Feedback state={state} okText="" />
    </form>
  );
}

export function ResolveRequestButton({ requestId }: { requestId: string }) {
  return (
    <form action={resolveRequest}>
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" className="text-xs font-medium text-accent hover:underline">
        Marcar respondida
      </button>
    </form>
  );
}

export function DismissRequestButton({ requestId }: { requestId: string }) {
  return (
    <form action={dismissRequest}>
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" className="text-xs text-ink-faint hover:underline">
        Cancelar
      </button>
    </form>
  );
}

export function ReopenRequestButton({ requestId }: { requestId: string }) {
  return (
    <form action={reopenRequest}>
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" className="text-sm font-medium text-accent hover:underline">
        Reabrir
      </button>
    </form>
  );
}

/**
 * Edição da solicitação na tela própria. O prazo não está aqui de propósito:
 * mudar prazo é reprogramar (com histórico), feito no botão "Reprogramar".
 */
export function RequestEditForm({
  request,
  users,
  documents,
  tasks,
}: {
  request: {
    id: string;
    description: string;
    type: string | null;
    waitingOn: string | null;
    ownerId: string | null;
    milestoneId: string | null;
    documentIds: string[];
  };
  users: UserOption[];
  documents: DocumentOption[];
  tasks: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<RequestFormState, FormData>(updateRequest, {});

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="requestId" value={request.id} />
      <div className="sm:col-span-2">
        <Field label="Solicitação">
          <input name="description" required defaultValue={request.description} className={inputClass} />
        </Field>
      </div>
      <Field label="Tipo" hint="Documento de referência, informação complementar…">
        <input name="type" defaultValue={request.type ?? ""} className={inputClass} />
      </Field>
      <Field label="Depende de (terceiro)">
        <input name="waitingOn" defaultValue={request.waitingOn ?? ""} className={inputClass} placeholder="Cliente, Empresa X…" />
      </Field>
      <Field label="Quem cobra (interno)">
        <select name="ownerId" defaultValue={request.ownerId ?? ""} className={inputClass}>
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tarefa / marco" hint="Opcional">
        <select name="milestoneId" defaultValue={request.milestoneId ?? ""} className={inputClass}>
          <option value="">Só do projeto</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      {documents.length > 0 ? (
        <div className="sm:col-span-2">
          <Field label="Documentos relacionados" hint="Segure Ctrl para marcar mais de um">
            <select
              name="documentIds"
              multiple
              defaultValue={request.documentIds}
              className={inputClass + " h-24"}
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.number ? `${d.number} — ` : ""}
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Submit label="Salvar solicitação" busy="Salvando…" />
        <Feedback state={state} okText="Solicitação atualizada." />
      </div>
    </form>
  );
}
