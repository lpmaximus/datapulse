import Link from "next/link";
import { createProject } from "@/app/actions/projects";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { Card, Button, Field, inputClass } from "@/components/ui";
import type {
  UserOption,
  ClientRow,
  SectorRow,
  EmpresaRow,
} from "@/types/models";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE: Record<string, string> = {
  "nome-obrigatorio": "Informe o nome do projeto.",
};

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireRole(["ADMIN", "MANAGER"], "/projects/new");
  const { error } = await searchParams;

  // Gerentes e admins podem responder pelo projeto; especialistas, não.
  const [managers, clients, sectors, firms]: [
    UserOption[],
    ClientRow[],
    SectorRow[],
    EmpresaRow[],
  ] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "MANAGER"] }, organizationId: me.organizationId },
      select: { id: true, name: true, email: true, role: true, function: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { isActive: true, organizationId: me.organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        contactName: true,
        email: true,
        phone: true,
        isActive: true,
        _count: { select: { projects: true } },
      },
    }),
    prisma.sector.findMany({
      where: { isActive: true, organizationId: me.organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: { select: { projects: true } },
      },
    }),
    prisma.empresa.findMany({
      where: { isActive: true, organizationId: me.organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        coordinatorName: true,
        email: true,
        phone: true,
        isActive: true,
        _count: { select: { projects: true, documents: true } },
      },
    }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/projects" className="text-xs text-ink-faint hover:text-ink-soft">
          ← Projetos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Novo projeto</h1>
        <p className="mt-1 text-sm text-ink-soft">
          O DRI só aparece depois que houver tarefas e sinais — comece pelo básico.
        </p>
      </div>

      <Card>
        {error && ERROR_MESSAGE[error] ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {ERROR_MESSAGE[error]}
          </p>
        ) : null}
        <form action={createProject} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nome do projeto">
              <input
                name="name"
                required
                autoFocus
                className={inputClass}
                placeholder="Ex.: Subestação Norte — Fase 2"
              />
            </Field>
          </div>
          <Field label="Nº da OS">
            <input name="osNumber" className={inputClass} placeholder="OS-2026-014" />
          </Field>
          <Field label="Custo contratado">
            <input name="cost" inputMode="numeric" className={inputClass} placeholder="1500000" />
          </Field>

          <Field label="Cliente">
            <select name="clientId" defaultValue="" className={inputClass}>
              <option value="">Não definir</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Setor">
            <select name="sectorId" defaultValue="" className={inputClass}>
              <option value="">Não definir</option>
              {sectors.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Empresa" hint="Empresa/contratada responsável pelos projetos.">
              <select name="designFirmId" defaultValue="" className={inputClass}>
                <option value="">Não definir</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.coordinatorName ? ` — ${f.coordinatorName}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Gerente do projeto"
              hint="Responsável por convocar avaliações e responder pelo DRI."
            >
              <select name="managerId" defaultValue="" className={inputClass}>
                <option value="">Definir depois</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.function ? ` — ${m.function.name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {managers.length === 0 ? (
              <p className="mt-1 text-xs text-amber-700">
                Nenhum usuário com papel de Gerente ou Administrador cadastrado
                ainda. Crie um em Usuários.
              </p>
            ) : null}
          </div>
          <Field label="Início">
            <input type="date" name="startsAt" className={inputClass} />
          </Field>
          <Field label="Término previsto">
            <input type="date" name="endsAt" className={inputClass} />
          </Field>
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit">Criar projeto</Button>
            <Link href="/projects">
              <Button type="button" variant="outline">Cancelar</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
