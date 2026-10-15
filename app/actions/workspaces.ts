"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { getSessionIdentity, setSessionWorkspace } from "@/lib/session";
import { listAccessibleWorkspaces } from "@/lib/server/workspace-service";
import { safeNext } from "@/lib/workspaces";

export interface WorkspaceFormState {
  error?: string;
  ok?: boolean;
  workspaceName?: string;
  adminEmail?: string;
  /// Só quando o admin é um usuário novo. Mostrada uma vez; não fica gravada.
  temporaryPassword?: string;
  /// O e-mail já existia: ganhou acesso ADMIN ao novo workspace com a senha que já tem.
  existingUser?: boolean;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** Escolhe o workspace da sessão. O acesso é conferido no servidor, nunca pelo form. */
export async function selectWorkspace(formData: FormData): Promise<void> {
  const identity = await getSessionIdentity();
  if (!identity) redirect("/login");

  const organizationId = str(formData, "organizationId");
  const allowed = await listAccessibleWorkspaces(identity.id);
  if (!allowed.some((w) => w.id === organizationId)) {
    redirect("/workspaces?error=sem-acesso");
  }

  await setSessionWorkspace(organizationId);
  redirect(safeNext(str(formData, "next")));
}

/**
 * Cadastro de workspace — exclusivo de superadmin.
 *
 * Cria a organização e o ADMIN dela. Se o e-mail do admin já existe (ex.: o
 * próprio superadmin, ou alguém de outro workspace), não duplica o usuário:
 * concede acesso ADMIN ao novo workspace via OrganizationMember.
 */
export async function createWorkspace(
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const identity = await getSessionIdentity();
  if (!identity) return { error: "Sessão expirada. Entre novamente." };
  if (!identity.isSuperAdmin) {
    return { error: "Apenas o superadmin do sistema pode cadastrar workspaces." };
  }

  const name = str(formData, "name");
  const adminName = str(formData, "adminName");
  const adminEmail = str(formData, "adminEmail").toLowerCase();

  if (name.length < 2) return { error: "Informe o nome do workspace." };
  if (!adminEmail.includes("@")) return { error: "Informe um e-mail válido para o admin." };

  const duplicate = await prisma.organization.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) return { error: `Já existe um workspace chamado "${name}".` };

  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });

  if (existingUser) {
    await prisma.organization.create({
      data: {
        name,
        members: { create: { userId: existingUser.id, role: "ADMIN" } },
      },
    });
    revalidatePath("/workspaces");
    return { ok: true, workspaceName: name, adminEmail, existingUser: true };
  }

  if (adminName.length < 2) return { error: "Informe o nome do admin." };

  const temporaryPassword = generateTemporaryPassword();
  await prisma.organization.create({
    data: {
      name,
      users: {
        create: {
          name: adminName,
          email: adminEmail,
          role: "ADMIN",
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        },
      },
    },
  });

  revalidatePath("/workspaces");
  return { ok: true, workspaceName: name, adminEmail, temporaryPassword };
}
