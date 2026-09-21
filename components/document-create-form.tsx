"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { createDocument, type DocumentFormState } from "@/app/actions/documents";
import { Button, Field, inputClass } from "@/components/ui";
import { PackageSelect } from "@/components/package-select";
import type {
  PackageOption,
  EmpresaRow,
  DisciplineRow,
  ProjectOption,
  UserOption,
} from "@/types/models";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Cadastrando…" : "Cadastrar documento"}
    </Button>
  );
}

/**
 * Cadastro manual (digitado) de um documento, em painel acionado por botão.
 *
 * Fica no topo da lista, e não no rodapé da página, porque digitar a lista
 * documental é o caminho normal de entrada — não o caso excepcional. Ao
 * salvar, o painel continua aberto e o formulário se limpa: quem cadastra
 * documento cadastra vários seguidos.
 *
 * `projects` só é passado na visão global (/documents), onde o projeto ainda
 * precisa ser escolhido; dentro do projeto ele já é conhecido.
 */
export function DocumentCreateForm({
  projectId,
  projects,
  packages,
  disciplines,
  firms,
  users,
}: {
  projectId?: string;
  projects?: ProjectOption[];
  packages: PackageOption[];
  disciplines: DisciplineRow[];
  firms: EmpresaRow[];
  users: UserOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<DocumentFormState, FormData>(
    createDocument,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const lastProject = useRef<string>(projectId ?? "");

  // Limpa o formulário a cada cadastro bem-sucedido, mas preserva o projeto
  // escolhido: quem está digitando uma lista continua no mesmo projeto.
  useEffect(() => {
    if (!state.at) return;
    const form = formRef.current;
    if (!form) return;
    const keep = (form.elements.namedItem("projectId") as HTMLInputElement | null)
      ?.value;
    form.reset();
    if (keep) {
      const field = form.elements.namedItem("projectId") as HTMLInputElement | null;
      if (field) field.value = keep;
      lastProject.current = keep;
    }
    (form.elements.namedItem("number") as HTMLInputElement | null)?.focus();
  }, [state.at]);

  return (
    <div className="border-b border-line bg-canvas/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Cadastro manual</p>
          <p className="text-xs text-ink-faint">
            Digite o documento aqui. O DataPulse guarda a informação sobre o
            documento — o arquivo continua onde já está.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "outline" : "primary"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={15} /> : <Plus size={15} />}
          {open ? "Fechar" : "Novo documento"}
        </Button>
      </div>

      {open ? (
        <form
          ref={formRef}
          action={action}
          className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3"
        >
          {projects ? (
            <div className="sm:col-span-3">
              <Field label="Projeto">
                <select
                  name="projectId"
                  required
                  defaultValue={lastProject.current}
                  className={inputClass}
                >
                  <option value="">Selecione o projeto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.osNumber ? `${p.osNumber} — ` : ""}
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <input type="hidden" name="projectId" value={projectId ?? ""} />
          )}

          <div className="sm:col-span-3">
            <Field
              label="Pacote de revisão"
              hint="Emissão (tarefa) em que este documento chega, dentro de um marco."
            >
              <PackageSelect
                packages={packages}
                showProject={!!projects}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Nº do documento" hint="Como o cliente identifica.">
            <input name="number" className={inputClass} placeholder="PE-ELE-001" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Nome">
              <input
                name="name"
                required
                className={inputClass}
                placeholder="Projeto executivo — elétrica"
              />
            </Field>
          </div>

          <Field label="Disciplina">
            <select name="disciplineId" defaultValue="" className={inputClass}>
              <option value="">Não definir</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.tag} — {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <input name="type" className={inputClass} placeholder="Projeto executivo" />
          </Field>
          <Field label="Revisão inicial">
            <input name="revisionName" defaultValue="R00" className={inputClass} />
          </Field>

          <Field label="Empresa" hint="Empresa que emite o documento.">
            <select name="designFirmId" defaultValue="" className={inputClass}>
              <option value="">Não definir</option>
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Emissor responsável">
            <select name="responsibleId" defaultValue="" className={inputClass}>
              <option value="">Não definir</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.function ? ` — ${u.function.name}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Emitido em">
            <input type="date" name="issuedAt" className={inputClass} />
          </Field>
          <Field label="Prazo da 1ª análise" hint="Em branco: data de envio + 5 dias úteis.">
            <input type="date" name="dueAt" className={inputClass} />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Link do arquivo da revisão inicial"
              hint="Opcional. O DataPulse guarda a referência, nunca o arquivo."
            >
              <input
                name="externalUrl"
                type="url"
                className={inputClass}
                placeholder="https://sharepoint… / drive… / ACC Docs…"
              />
            </Field>
          </div>

          <div className="sm:col-span-3">
            <Field label="Observações">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <Submit />
            {state.error ? (
              <p className="text-sm text-red-700">{state.error}</p>
            ) : null}
            {state.created ? (
              <p className="text-sm text-green-700">
                Cadastrado: {state.created}. Pode digitar o próximo.
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
