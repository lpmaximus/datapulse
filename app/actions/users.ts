"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateTemporaryPassword } from "@/lib/password";
import { destroyAllSessionsForUser } from "@/lib/session";
import { requireRole } from "@/lib/authz";
import type { Role } from "@/lib/authz";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

const VALID_ROLES: Role[] = ["ADMIN", "MANAGER", "SPECIALIST", "EXECUTIVE"];

function parseRole(value: string): Role {
  return VALID_ROLES.includes(value as Role) ? (value as Role) : "SPECIALIST";
}

export interface UserFormState {
  error?: string;
  ok?: boolean;
  /** Senha provisória, exibida uma única vez para ser repassada ao usuário. */
  temporaryPassword?: string;
  userName?: string;
}

/**
 * Cria usuário com senha provisória.
 *
 * A senha é devolvida uma única vez na tela — não há e-mail transacional no
 * MVP. Ela nunca é gravada em claro; o banco só guarda o hash scrypt.
 */
export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const admin = await requireRole(["ADMIN"]);

  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();

  if (!name) return { error: "Informe o nome." };
  if (!email || !email.includes("@")) return { error: "Informe um e-mail válido." };

  // E-mail é único globalmente (login), não por organização.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return { error: "Já existe um usuário com este e-mail." };

  const functionId = str(formData, "functionId") || null;
  const companyId = str(formData, "companyId") || null;

  // Função e empresa são cadastros da própria organização — evita vincular
  // (por engano ou por id adivinhado) um usuário a um registro de outra.
  if (functionId) {
    const fn = await prisma.jobFunction.findFirst({
      where: { id: functionId, organizationId: admin.organizationId },
      select: { id: true },
    });
    if (!fn) return { error: "Função inválida." };
  }
  if (companyId) {
    const company = await prisma.empresa.findFirst({
      where: { id: companyId, organizationId: admin.organizationId },
      select: { id: true },
    });
    if (!company) return { error: "Empresa inválida." };
  }

  const temporaryPassword = generateTemporaryPassword();

  await prisma.user.create({
    data: {
      organizationId: admin.organizationId,
      name,
      email,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      role: parseRole(str(formData, "role")),
      functionId,
      companyId,
    },
  });

  revalidatePath("/users");
  return { ok: true, temporaryPassword, userName: name };
}

export interface UpdateUserFormState {
  error?: string;
  ok?: boolean;
}

/** Edita nome, e-mail e função — os únicos campos do usuário sem controle inline na lista. */
export async function updateUser(
  _prev: UpdateUserFormState,
  formData: FormData,
): Promise<UpdateUserFormState> {
  const admin = await requireRole(["ADMIN"]);
  const userId = str(formData, "userId");
  if (!userId) return { error: "Usuário não identificado." };

  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  if (!name) return { error: "Informe o nome." };
  if (!email || !email.includes("@")) return { error: "Informe um e-mail válido." };

  // E-mail é único globalmente (login) — mesma regra de createUser.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing && existing.id !== userId) return { error: "Já existe um usuário com este e-mail." };

  const functionId = str(formData, "functionId") || null;
  if (functionId) {
    const fn = await prisma.jobFunction.findFirst({
      where: { id: functionId, organizationId: admin.organizationId },
      select: { id: true },
    });
    if (!fn) return { error: "Função inválida." };
  }

  const result = await prisma.user.updateMany({
    where: { id: userId, organizationId: admin.organizationId },
    data: { name, email, functionId },
  });
  if (result.count === 0) return { error: "Usuário não encontrado." };

  revalidatePath("/users");
  return { ok: true };
}

export async function updateUserRole(formData: FormData): Promise<void> {
  const admin = await requireRole(["ADMIN"]);
  const userId = str(formData, "userId");
  const role = parseRole(str(formData, "role"));
  if (!userId) return;

  // Evita o administrador se rebaixar e deixar a instalação sem admin.
  if (userId === admin.id && role !== "ADMIN") return;

  // `updateMany` (em vez de `update`) combina o `id` com `organizationId` no
  // `where` — impede alterar o papel de um usuário de outra organização.
  await prisma.user.updateMany({
    where: { id: userId, organizationId: admin.organizationId },
    data: { role },
  });
  revalidatePath("/users");
}

/** Vínculo empregador do usuário — não interfere em permissão de acesso. */
export async function updateUserCompany(formData: FormData): Promise<void> {
  const admin = await requireRole(["ADMIN"]);
  const userId = str(formData, "userId");
  if (!userId) return;

  const companyId = str(formData, "companyId") || null;
  if (companyId) {
    const company = await prisma.empresa.findFirst({
      where: { id: companyId, organizationId: admin.organizationId },
      select: { id: true },
    });
    if (!company) return;
  }

  await prisma.user.updateMany({
    where: { id: userId, organizationId: admin.organizationId },
    data: { companyId },
  });
  revalidatePath("/users");
}

/**
 * Disciplinas que o usuário domina (N:N, informativo: não altera permissão).
 * Substitui o conjunto inteiro pelo enviado. Todo id é validado contra a
 * organização do administrador.
 */
export async function setUserDisciplines(formData: FormData): Promise<void> {
  const admin = await requireRole(["ADMIN"]);
  const userId = str(formData, "userId");
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: admin.organizationId },
    select: { id: true },
  });
  if (!user) return;

  const wanted = [...new Set(formData.getAll("disciplineId").map((v) => String(v).trim()).filter(Boolean))];
  const valid = wanted.length
    ? await prisma.discipline.findMany({
        where: { id: { in: wanted }, organizationId: admin.organizationId },
        select: { id: true },
      })
    : [];
  if (valid.length !== wanted.length) return;

  await prisma.$transaction([
    prisma.userDiscipline.deleteMany({ where: { userId: user.id } }),
    ...(valid.length
      ? [prisma.userDiscipline.createMany({ data: valid.map((d) => ({ userId: user.id, disciplineId: d.id })) })]
      : []),
  ]);
  revalidatePath("/users");
}

/**
 * Ativa/desativa. Desativar encerra as sessões abertas na hora — sem isso o
 * usuário removido continuaria navegando até o cookie expirar.
 */
export async function toggleUserActive(formData: FormData): Promise<void> {
  const admin = await requireRole(["ADMIN"]);
  const userId = str(formData, "userId");
  if (!userId || userId === admin.id) return;

  const isActive = formData.get("active") === "on";
  const result = await prisma.user.updateMany({
    where: { id: userId, organizationId: admin.organizationId },
    data: { isActive },
  });
  if (result.count > 0 && !isActive) await destroyAllSessionsForUser(userId);

  revalidatePath("/users");
}

export async function resetUserPassword(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const admin = await requireRole(["ADMIN"]);
  const userId = str(formData, "userId");
  if (!userId) return { error: "Usuário não identificado." };

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: admin.organizationId },
    select: { name: true },
  });
  if (!user) return { error: "Usuário não encontrado." };

  const temporaryPassword = generateTemporaryPassword();
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    },
  });
  await destroyAllSessionsForUser(userId);

  revalidatePath("/users");
  return { ok: true, temporaryPassword, userName: user.name };
}
