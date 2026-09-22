"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, ACCOUNT_ROLES, type AccountRole } from "@/lib/authz";
import type { AnalysisEffect } from "@/lib/documents";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

const PATH = "/settings/registers";

export interface RegisterState {
  error?: string;
  ok?: boolean;
}

const VALID_EFFECTS: AnalysisEffect[] = [
  "APPROVES",
  "APPROVES_WITH_COMMENTS",
  "COMMENTS",
  "REJECTS",
  "CANCELS",
];

/* ------------------------------- clientes ------------------------------- */

export async function createClient(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const name = str(formData, "name");
  if (!name) return { error: "Informe o nome do cliente." };

  const exists = await prisma.client.findUnique({
    where: { organizationId_name: { organizationId: me.organizationId, name } },
    select: { id: true },
  });
  if (exists) return { error: "Já existe um cliente com este nome." };

  await prisma.client.create({
    data: {
      organizationId: me.organizationId,
      name,
      code: str(formData, "code") || null,
      contactName: str(formData, "contactName") || null,
      email: str(formData, "email") || null,
      phone: str(formData, "phone") || null,
      meetingFormCode: str(formData, "meetingFormCode") || null,
    },
  });

  revalidatePath(PATH);
  return { ok: true };
}

/** Edita um cliente já cadastrado — mesmas regras da criação. */
export async function updateClient(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!id) return { error: "Cliente não identificado." };
  if (!name) return { error: "Informe o nome do cliente." };

  const conflict = await prisma.client.findFirst({
    where: { organizationId: me.organizationId, name, id: { not: id } },
    select: { id: true },
  });
  if (conflict) return { error: "Já existe um cliente com este nome." };

  // `updateMany` (não `update`) combina `id` com `organizationId` no `where`
  // — impede editar um cliente de outra organização por id adivinhado.
  const result = await prisma.client.updateMany({
    where: { id, organizationId: me.organizationId },
    data: {
      name,
      code: str(formData, "code") || null,
      contactName: str(formData, "contactName") || null,
      email: str(formData, "email") || null,
      phone: str(formData, "phone") || null,
      meetingFormCode: str(formData, "meetingFormCode") || null,
    },
  });
  if (result.count === 0) return { error: "Cliente não encontrado." };

  revalidatePath(PATH);
  return { ok: true };
}

/* -------------------------------- setores ------------------------------- */

export async function createSector(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const name = str(formData, "name");
  if (!name) return { error: "Informe o nome do setor." };

  const exists = await prisma.sector.findUnique({
    where: { organizationId_name: { organizationId: me.organizationId, name } },
    select: { id: true },
  });
  if (exists) return { error: "Já existe um setor com este nome." };

  await prisma.sector.create({ data: { organizationId: me.organizationId, name } });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateSector(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!id) return { error: "Setor não identificado." };
  if (!name) return { error: "Informe o nome do setor." };

  const conflict = await prisma.sector.findFirst({
    where: { organizationId: me.organizationId, name, id: { not: id } },
    select: { id: true },
  });
  if (conflict) return { error: "Já existe um setor com este nome." };

  const result = await prisma.sector.updateMany({
    where: { id, organizationId: me.organizationId },
    data: { name },
  });
  if (result.count === 0) return { error: "Setor não encontrado." };

  revalidatePath(PATH);
  return { ok: true };
}

/* ------------------------------ disciplinas ----------------------------- */

export async function createDiscipline(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);

  const tag = str(formData, "tag").toUpperCase();
  const name = str(formData, "name");
  if (!tag || !name) return { error: "Informe a sigla e o nome da disciplina." };

  const exists = await prisma.discipline.findUnique({
    where: { organizationId_tag: { organizationId: me.organizationId, tag } },
    select: { id: true },
  });
  if (exists) return { error: `A sigla "${tag}" já está em uso.` };

  await prisma.discipline.create({
    data: { organizationId: me.organizationId, tag, name },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateDiscipline(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const id = str(formData, "id");
  const tag = str(formData, "tag").toUpperCase();
  const name = str(formData, "name");
  if (!id) return { error: "Disciplina não identificada." };
  if (!tag || !name) return { error: "Informe a sigla e o nome da disciplina." };

  const conflict = await prisma.discipline.findFirst({
    where: { organizationId: me.organizationId, tag, id: { not: id } },
    select: { id: true },
  });
  if (conflict) return { error: `A sigla "${tag}" já está em uso.` };

  const result = await prisma.discipline.updateMany({
    where: { id, organizationId: me.organizationId },
    data: { tag, name },
  });
  if (result.count === 0) return { error: "Disciplina não encontrada." };

  revalidatePath(PATH);
  return { ok: true };
}

/* -------------------------------- empresas ------------------------------- */

export async function createEmpresa(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);

  const name = str(formData, "name");
  if (!name) return { error: "Informe o nome da empresa." };

  const exists = await prisma.empresa.findUnique({
    where: { organizationId_name: { organizationId: me.organizationId, name } },
    select: { id: true },
  });
  if (exists) return { error: "Já existe uma empresa com este nome." };

  await prisma.empresa.create({
    data: {
      organizationId: me.organizationId,
      name,
      coordinatorName: str(formData, "coordinatorName") || null,
      email: str(formData, "email") || null,
      phone: str(formData, "phone") || null,
    },
  });

  revalidatePath(PATH);
  return { ok: true };
}

export async function updateEmpresa(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!id) return { error: "Empresa não identificada." };
  if (!name) return { error: "Informe o nome da empresa." };

  const conflict = await prisma.empresa.findFirst({
    where: { organizationId: me.organizationId, name, id: { not: id } },
    select: { id: true },
  });
  if (conflict) return { error: "Já existe uma empresa com este nome." };

  const result = await prisma.empresa.updateMany({
    where: { id, organizationId: me.organizationId },
    data: {
      name,
      coordinatorName: str(formData, "coordinatorName") || null,
      email: str(formData, "email") || null,
      phone: str(formData, "phone") || null,
    },
  });
  if (result.count === 0) return { error: "Empresa não encontrada." };

  revalidatePath(PATH);
  return { ok: true };
}

/* ------------------------------- funções -------------------------------- */

export async function createJobFunction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const name = str(formData, "name");
  if (!name) return { error: "Informe o nome da função." };

  const exists = await prisma.jobFunction.findUnique({
    where: { organizationId_name: { organizationId: me.organizationId, name } },
    select: { id: true },
  });
  if (exists) return { error: "Já existe uma função com este nome." };

  await prisma.jobFunction.create({ data: { organizationId: me.organizationId, name } });
  revalidatePath(PATH);
  revalidatePath("/users");
  return { ok: true };
}

export async function updateJobFunction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!id) return { error: "Função não identificada." };
  if (!name) return { error: "Informe o nome da função." };

  const conflict = await prisma.jobFunction.findFirst({
    where: { organizationId: me.organizationId, name, id: { not: id } },
    select: { id: true },
  });
  if (conflict) return { error: "Já existe uma função com este nome." };

  const result = await prisma.jobFunction.updateMany({
    where: { id, organizationId: me.organizationId },
    data: { name },
  });
  if (result.count === 0) return { error: "Função não encontrada." };

  revalidatePath(PATH);
  revalidatePath("/users");
  return { ok: true };
}

/* --------------------------- códigos de análise ------------------------- */

/**
 * Cria um código de análise.
 *
 * O `effect` é o que o motor de fluxo lê — a sigla é só rótulo. Por isso ele
 * é obrigatório e restrito à lista conhecida: um código sem efeito válido
 * travaria o fluxo em runtime.
 */
export async function createAnalysisCode(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN"]);

  const tag = str(formData, "tag").toUpperCase();
  const name = str(formData, "name");
  const effect = str(formData, "effect") as AnalysisEffect;

  if (!tag || !name) return { error: "Informe a sigla e o nome do código." };
  if (!VALID_EFFECTS.includes(effect)) return { error: "Efeito inválido." };

  const exists = await prisma.analysisCode.findUnique({
    where: { organizationId_tag: { organizationId: me.organizationId, tag } },
    select: { id: true },
  });
  if (exists) return { error: `A sigla "${tag}" já está em uso.` };

  const last = await prisma.analysisCode.findFirst({
    where: { organizationId: me.organizationId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.analysisCode.create({
    data: {
      organizationId: me.organizationId,
      tag,
      name,
      effect,
      description: str(formData, "description") || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath(PATH);
  return { ok: true };
}

/** Edita um código de análise já cadastrado — mesma exigência de ADMIN da criação. */
export async function updateAnalysisCode(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const me = await requireRole(["ADMIN"]);

  const id = str(formData, "id");
  const tag = str(formData, "tag").toUpperCase();
  const name = str(formData, "name");
  const effect = str(formData, "effect") as AnalysisEffect;

  if (!id) return { error: "Código não identificado." };
  if (!tag || !name) return { error: "Informe a sigla e o nome do código." };
  if (!VALID_EFFECTS.includes(effect)) return { error: "Efeito inválido." };

  const conflict = await prisma.analysisCode.findFirst({
    where: { organizationId: me.organizationId, tag, id: { not: id } },
    select: { id: true },
  });
  if (conflict) return { error: `A sigla "${tag}" já está em uso.` };

  const result = await prisma.analysisCode.updateMany({
    where: { id, organizationId: me.organizationId },
    data: {
      tag,
      name,
      effect,
      description: str(formData, "description") || null,
    },
  });
  if (result.count === 0) return { error: "Código não encontrado." };

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Ativa/desativa um registro de referência.
 *
 * Desativar em vez de excluir: registros já usados em documentos e projetos
 * precisam continuar legíveis no histórico.
 *
 * O `where` de cada `updateMany` inclui `organizationId` mesmo com `id` já
 * sendo chave única globalmente — é isso que impede um usuário da Empresa A
 * de desativar (ou reativar) um registro da Empresa B só por adivinhar/ver o
 * `id` em outro lugar. `updateMany` (em vez de `update`) é o jeito correto de
 * combinar um filtro não-único (`organizationId`) com o `id` no `where`.
 */
export async function toggleRegister(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN", "MANAGER"]);

  const kind = str(formData, "kind");
  const id = str(formData, "recordId");
  if (!id) return;

  const isActive = formData.get("active") === "on";
  const where = { id, organizationId: me.organizationId };

  switch (kind) {
    case "client":
      await prisma.client.updateMany({ where, data: { isActive } });
      break;
    case "sector":
      await prisma.sector.updateMany({ where, data: { isActive } });
      break;
    case "discipline":
      await prisma.discipline.updateMany({ where, data: { isActive } });
      break;
    case "empresa":
      await prisma.empresa.updateMany({ where, data: { isActive } });
      break;
    case "jobFunction":
      await prisma.jobFunction.updateMany({ where, data: { isActive } });
      break;
    case "analysisCode":
      await prisma.analysisCode.updateMany({ where, data: { isActive } });
      break;
    default:
      return;
  }

  revalidatePath(PATH);
}


/* ---------------------------- papéis de acesso --------------------------- */

/**
 * Só edita rótulo/descrição exibidos — o papel em si (`UserRole`) é fixo no
 * código e controla permissão; não é possível criar, remover ou renomear a
 * chave por aqui.
 */
export async function updateRoleProfile(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN"]);

  const role = str(formData, "role");
  if (!ACCOUNT_ROLES.includes(role as AccountRole)) return;

  const label = str(formData, "label");
  if (!label) return;

  await prisma.roleProfile.upsert({
    where: {
      organizationId_role: {
        organizationId: me.organizationId,
        role: role as AccountRole,
      },
    },
    create: {
      organizationId: me.organizationId,
      role: role as AccountRole,
      label,
      description: str(formData, "description") || null,
    },
    update: {
      label,
      description: str(formData, "description") || null,
    },
  });

  revalidatePath(PATH);
}
