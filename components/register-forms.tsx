"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createClient,
  updateClient,
  createSector,
  updateSector,
  createDiscipline,
  updateDiscipline,
  createEmpresa,
  updateEmpresa,
  createJobFunction,
  updateJobFunction,
  createAnalysisCode,
  updateAnalysisCode,
  updateRoleProfile,
  toggleRegister,
  type RegisterState,
} from "@/app/actions/registers";
import { Button, Field, inputClass } from "@/components/ui";
import { Td, RowActions, StatusToggle } from "@/components/table-ui";
import { EFFECT_LABEL } from "@/lib/documents";
import type {
  RoleProfileRow,
  ClientRow as ClientRowData,
  SectorRow as SectorRowData,
  DisciplineRow as DisciplineRowData,
  EmpresaRow as EmpresaRowData,
  JobFunctionRow as JobFunctionRowData,
  AnalysisCodeRow as AnalysisCodeRowData,
} from "@/types/models";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

function Feedback({ state }: { state: RegisterState }) {
  if (state.error) {
    return <p className="text-sm text-red-700">{state.error}</p>;
  }
  if (state.ok) {
    return <p className="text-sm text-green-700">Cadastrado.</p>;
  }
  return null;
}

export function ClientForm() {
  const [state, action] = useActionState<RegisterState, FormData>(createClient, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome">
        <input name="name" required className={inputClass} />
      </Field>
      <Field label="Código">
        <input name="code" className={inputClass} />
      </Field>
      <Field label="Contato">
        <input name="contactName" className={inputClass} />
      </Field>
      <Field label="E-mail">
        <input name="email" type="email" className={inputClass} />
      </Field>
      <Field label="Telefone">
        <input name="phone" className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Modelo de ata (rodapé)" hint='Opcional — código/validade do formulário controlado do cliente, ex.: "FOR-DPO-0040/00.00 — 30/08/2024 — Válido até 30/08/2027 — Restrito". Em branco, reuniões deste cliente só imprimem no modelo DataPulse.'>
          <input name="meetingFormCode" className={inputClass} />
        </Field>
      </div>
      <div className="flex items-end gap-3">
        <Submit label="Adicionar cliente" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function SectorForm() {
  const [state, action] = useActionState<RegisterState, FormData>(createSector, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1">
        <Field label="Nome do setor">
          <input name="name" required className={inputClass} placeholder="Engenharia" />
        </Field>
      </div>
      <Submit label="Adicionar setor" />
      <Feedback state={state} />
    </form>
  );
}

export function DisciplineForm() {
  const [state, action] = useActionState<RegisterState, FormData>(createDiscipline, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="w-28">
        <Field label="Sigla">
          <input
            name="tag"
            required
            maxLength={8}
            className={`${inputClass} uppercase`}
            placeholder="ELE"
          />
        </Field>
      </div>
      <div className="min-w-[220px] flex-1">
        <Field label="Nome">
          <input name="name" required className={inputClass} placeholder="Elétrica" />
        </Field>
      </div>
      <Submit label="Adicionar disciplina" />
      <Feedback state={state} />
    </form>
  );
}

export function EmpresaForm() {
  const [state, action] = useActionState<RegisterState, FormData>(createEmpresa, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome da empresa">
        <input name="name" required className={inputClass} />
      </Field>
      <Field label="Coordenador">
        <input name="coordinatorName" className={inputClass} />
      </Field>
      <Field label="E-mail">
        <input name="email" type="email" className={inputClass} />
      </Field>
      <Field label="Telefone">
        <input name="phone" className={inputClass} />
      </Field>
      <div className="flex items-end gap-3 sm:col-span-2">
        <Submit label="Adicionar empresa" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function JobFunctionForm() {
  const [state, action] = useActionState<RegisterState, FormData>(createJobFunction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1">
        <Field label="Nome da função">
          <input name="name" required className={inputClass} placeholder="Coordenador" />
        </Field>
      </div>
      <Submit label="Adicionar função" />
      <Feedback state={state} />
    </form>
  );
}

export function AnalysisCodeForm() {
  const [state, action] = useActionState<RegisterState, FormData>(
    createAnalysisCode,
    {},
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4">
      <Field label="Sigla">
        <input
          name="tag"
          required
          maxLength={8}
          className={`${inputClass} uppercase`}
          placeholder="APR"
        />
      </Field>
      <Field label="Nome">
        <input name="name" required className={inputClass} placeholder="Aprovado" />
      </Field>
      <div className="sm:col-span-2">
        <Field
          label="Efeito no fluxo"
          hint="É isto que o motor lê — a sigla é só rótulo."
        >
          <select name="effect" defaultValue="APPROVES" className={inputClass}>
            {Object.entries(EFFECT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="sm:col-span-4">
        <Field label="Descrição">
          <input name="description" className={inputClass} />
        </Field>
      </div>
      <div className="flex items-end gap-3 sm:col-span-4">
        <Submit label="Adicionar código" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

function RoleProfileSave() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" disabled={pending} className="px-2 py-1 text-xs">
      {pending ? "Salvando…" : "Salvar"}
    </Button>
  );
}

/**
 * Linha de edição de um papel de acesso — só rótulo/descrição; o código do
 * papel (`role`) é fixo e não aparece como campo editável.
 */
export function RoleProfileForm({ profile }: { profile: RoleProfileRow }) {
  return (
    <form action={updateRoleProfile} className="grid gap-3 sm:grid-cols-[110px_1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="role" value={profile.role} />
      <div className="pb-2 font-mono text-xs font-semibold text-ink-soft">{profile.role}</div>
      <Field label="Rótulo">
        <input name="label" required defaultValue={profile.label} className={inputClass} />
      </Field>
      <Field label="Descrição">
        <input
          name="description"
          defaultValue={profile.description ?? ""}
          className={inputClass}
        />
      </Field>
      <RoleProfileSave />
    </form>
  );
}

/* --------------------------------------------------------------------------
 * Linhas de tabela editáveis — clientes, setores, disciplinas, empresas,
 * funções e códigos de análise.
 *
 * Cada linha nasce em modo de exibição; "Editar" (visível ao passar o mouse,
 * mesmo padrão de /projects) troca a linha inteira por um formulário. Ao
 * salvar com sucesso, a linha volta sozinha ao modo de exibição — sem isso o
 * usuário ficaria encarando o próprio formulário depois de salvar.
 * -------------------------------------------------------------------------- */

/** Coluna "Ativo" — reaproveitada em toda tabela de cadastro. */
export function Toggle({ kind, id, active }: { kind: string; id: string; active: boolean }) {
  return (
    <StatusToggle
      action={toggleRegister}
      id={id}
      fieldName="recordId"
      checked={active}
      extraFields={{ kind }}
    />
  );
}

function EditLink({ onClick }: { onClick: () => void }) {
  return (
    <RowActions>
      <button type="button" onClick={onClick}>
        Editar
      </button>
    </RowActions>
  );
}

function SaveCancel({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={pending} className="px-3 py-1 text-xs">
        {pending ? "Salvando…" : "Salvar"}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="text-xs text-ink-soft hover:text-ink disabled:opacity-50"
      >
        Cancelar
      </button>
    </div>
  );
}

/** Fecha o modo de edição sozinho assim que a gravação é confirmada. */
function useCloseOnSuccess(state: RegisterState, close: () => void) {
  useEffect(() => {
    if (state.ok) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function ClientRow({ client: c }: { client: ClientRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<RegisterState, FormData>(updateClient, {});
  useCloseOnSuccess(state, () => setEditing(false));

  if (editing) {
    return (
      <tr className="border-b border-line last:border-0 bg-canvas/40">
        <td colSpan={5} className="px-3 py-2">
          <form action={action} className="grid gap-3 py-1 sm:grid-cols-5 sm:items-end">
            <input type="hidden" name="id" value={c.id} />
            <Field label="Nome">
              <input name="name" required defaultValue={c.name} className={inputClass} />
            </Field>
            <Field label="Código">
              <input name="code" defaultValue={c.code ?? ""} className={inputClass} />
            </Field>
            <Field label="Contato">
              <input name="contactName" defaultValue={c.contactName ?? ""} className={inputClass} />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" defaultValue={c.email ?? ""} className={inputClass} />
            </Field>
            <Field label="Telefone">
              <input name="phone" defaultValue={c.phone ?? ""} className={inputClass} />
            </Field>
            <div className="sm:col-span-5">
              <Field label="Modelo de ata (rodapé)" hint="Código/validade do formulário controlado do cliente — em branco, só o modelo DataPulse">
                <input name="meetingFormCode" defaultValue={c.meetingFormCode ?? ""} className={inputClass} />
              </Field>
            </div>
            <div className="sm:col-span-5 flex items-center gap-3">
              <SaveCancel onCancel={() => setEditing(false)} />
              <Feedback state={state} />
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-b border-line last:border-0 hover:bg-canvas/60">
      <Td>
        <Toggle kind="client" id={c.id} active={c.isActive} />
      </Td>
      <Td className="font-medium">
        {c.name}
        <EditLink onClick={() => setEditing(true)} />
      </Td>
      <Td className="text-ink-soft">{c.code ?? "—"}</Td>
      <Td className="text-ink-faint">
        {[c.contactName, c.email].filter(Boolean).join(" · ") || "—"}
      </Td>
      <Td align="right">{c._count.projects}</Td>
    </tr>
  );
}

export function SectorRow({ sector: s }: { sector: SectorRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<RegisterState, FormData>(updateSector, {});
  useCloseOnSuccess(state, () => setEditing(false));

  if (editing) {
    return (
      <tr className="border-b border-line last:border-0 bg-canvas/40">
        <td colSpan={3} className="px-3 py-2">
          <form action={action} className="flex flex-wrap items-end gap-3 py-1">
            <input type="hidden" name="id" value={s.id} />
            <div className="min-w-[220px] flex-1">
              <Field label="Nome do setor">
                <input name="name" required defaultValue={s.name} className={inputClass} />
              </Field>
            </div>
            <SaveCancel onCancel={() => setEditing(false)} />
            <Feedback state={state} />
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-b border-line last:border-0 hover:bg-canvas/60">
      <Td>
        <Toggle kind="sector" id={s.id} active={s.isActive} />
      </Td>
      <Td className="font-medium">
        {s.name}
        <EditLink onClick={() => setEditing(true)} />
      </Td>
      <Td align="right">{s._count.projects}</Td>
    </tr>
  );
}

export function DisciplineRow({ discipline: d }: { discipline: DisciplineRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<RegisterState, FormData>(updateDiscipline, {});
  useCloseOnSuccess(state, () => setEditing(false));

  if (editing) {
    return (
      <tr className="border-b border-line last:border-0 bg-canvas/40">
        <td colSpan={4} className="px-3 py-2">
          <form action={action} className="flex flex-wrap items-end gap-3 py-1">
            <input type="hidden" name="id" value={d.id} />
            <div className="w-28">
              <Field label="Sigla">
                <input
                  name="tag"
                  required
                  maxLength={8}
                  defaultValue={d.tag}
                  className={`${inputClass} uppercase`}
                />
              </Field>
            </div>
            <div className="min-w-[220px] flex-1">
              <Field label="Nome">
                <input name="name" required defaultValue={d.name} className={inputClass} />
              </Field>
            </div>
            <SaveCancel onCancel={() => setEditing(false)} />
            <Feedback state={state} />
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-b border-line last:border-0 hover:bg-canvas/60">
      <Td>
        <Toggle kind="discipline" id={d.id} active={d.isActive} />
      </Td>
      <Td>
        <span className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs font-semibold">
          {d.tag}
        </span>
      </Td>
      <Td className="font-medium">
        {d.name}
        <EditLink onClick={() => setEditing(true)} />
      </Td>
      <Td align="right">{d._count.documents}</Td>
    </tr>
  );
}

export function EmpresaRow({ empresa: f }: { empresa: EmpresaRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<RegisterState, FormData>(updateEmpresa, {});
  useCloseOnSuccess(state, () => setEditing(false));

  if (editing) {
    return (
      <tr className="border-b border-line last:border-0 bg-canvas/40">
        <td colSpan={6} className="px-3 py-2">
          <form action={action} className="grid gap-3 py-1 sm:grid-cols-4 sm:items-end">
            <input type="hidden" name="id" value={f.id} />
            <Field label="Nome da empresa">
              <input name="name" required defaultValue={f.name} className={inputClass} />
            </Field>
            <Field label="Coordenador">
              <input name="coordinatorName" defaultValue={f.coordinatorName ?? ""} className={inputClass} />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" defaultValue={f.email ?? ""} className={inputClass} />
            </Field>
            <Field label="Telefone">
              <input name="phone" defaultValue={f.phone ?? ""} className={inputClass} />
            </Field>
            <div className="sm:col-span-4 flex items-center gap-3">
              <SaveCancel onCancel={() => setEditing(false)} />
              <Feedback state={state} />
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-b border-line last:border-0 hover:bg-canvas/60">
      <Td>
        <Toggle kind="empresa" id={f.id} active={f.isActive} />
      </Td>
      <Td className="font-medium">
        {f.name}
        <EditLink onClick={() => setEditing(true)} />
      </Td>
      <Td className="text-ink-soft">{f.coordinatorName ?? "—"}</Td>
      <Td className="text-ink-faint">
        {[f.email, f.phone].filter(Boolean).join(" · ") || "—"}
      </Td>
      <Td align="right">{f._count.projects}</Td>
      <Td align="right">{f._count.documents}</Td>
    </tr>
  );
}

export function JobFunctionRow({ jobFunction: f }: { jobFunction: JobFunctionRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<RegisterState, FormData>(updateJobFunction, {});
  useCloseOnSuccess(state, () => setEditing(false));

  if (editing) {
    return (
      <tr className="border-b border-line last:border-0 bg-canvas/40">
        <td colSpan={3} className="px-3 py-2">
          <form action={action} className="flex flex-wrap items-end gap-3 py-1">
            <input type="hidden" name="id" value={f.id} />
            <div className="min-w-[220px] flex-1">
              <Field label="Nome da função">
                <input name="name" required defaultValue={f.name} className={inputClass} />
              </Field>
            </div>
            <SaveCancel onCancel={() => setEditing(false)} />
            <Feedback state={state} />
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-b border-line last:border-0 hover:bg-canvas/60">
      <Td>
        <Toggle kind="jobFunction" id={f.id} active={f.isActive} />
      </Td>
      <Td className="font-medium">
        {f.name}
        <EditLink onClick={() => setEditing(true)} />
      </Td>
      <Td align="right">{f._count.users}</Td>
    </tr>
  );
}

export function AnalysisCodeRow({ code: c }: { code: AnalysisCodeRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<RegisterState, FormData>(updateAnalysisCode, {});
  useCloseOnSuccess(state, () => setEditing(false));

  if (editing) {
    return (
      <tr className="border-b border-line last:border-0 bg-canvas/40">
        <td colSpan={5} className="px-3 py-2">
          <form action={action} className="grid gap-3 py-1 sm:grid-cols-4">
            <input type="hidden" name="id" value={c.id} />
            <Field label="Sigla">
              <input
                name="tag"
                required
                maxLength={8}
                defaultValue={c.tag}
                className={`${inputClass} uppercase`}
              />
            </Field>
            <Field label="Nome">
              <input name="name" required defaultValue={c.name} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Efeito no fluxo"
                hint="É isto que o motor lê — a sigla é só rótulo."
              >
                <select name="effect" defaultValue={c.effect} className={inputClass}>
                  {Object.entries(EFFECT_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="sm:col-span-4">
              <Field label="Descrição">
                <input name="description" defaultValue={c.description ?? ""} className={inputClass} />
              </Field>
            </div>
            <div className="sm:col-span-4 flex items-center gap-3">
              <SaveCancel onCancel={() => setEditing(false)} />
              <Feedback state={state} />
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-b border-line last:border-0 hover:bg-canvas/60">
      <Td>
        <Toggle kind="analysisCode" id={c.id} active={c.isActive} />
      </Td>
      <Td>
        <span className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs font-semibold">
          {c.tag}
        </span>
      </Td>
      <Td className="font-medium">
        {c.name}
        <EditLink onClick={() => setEditing(true)} />
      </Td>
      <Td className="text-ink-soft">{EFFECT_LABEL[c.effect]}</Td>
      <Td className="text-ink-faint">{c.description ?? "—"}</Td>
    </tr>
  );
}
