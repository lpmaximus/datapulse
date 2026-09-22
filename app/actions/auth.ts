"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import {
  createSession,
  destroyCurrentSession,
  destroyAllSessionsForUser,
  getCurrentUser,
} from "@/lib/session";

export interface AuthFormState {
  error?: string;
  ok?: boolean;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/**
 * Login.
 *
 * A mensagem de erro é sempre a mesma para credencial errada e usuário
 * inexistente — não entregamos ao atacante a informação de que um e-mail
 * está cadastrado.
 */
export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = str(formData, "next");

  if (!email || !password) return { error: "Informe e-mail e senha." };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, isActive: true, role: true },
  });

  const GENERIC = "E-mail ou senha inválidos.";
  if (!user) {
    // Gasta tempo comparável ao caminho feliz para não vazar existência do
    // usuário por diferença de latência.
    await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    return { error: GENERIC };
  }

  if (!(await verifyPassword(password, user.passwordHash))) return { error: GENERIC };
  if (!user.isActive) return { error: "Este usuário está desativado." };
  if (user.role === "EXTERNAL") return { error: "Este usuário não tem acesso ao sistema." };

  const ua = (await headers()).get("user-agent");
  await createSession(user.id, ua);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  redirect(next && next.startsWith("/") ? next : "/");
}

export async function logout(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

/** Troca da própria senha. Encerra as demais sessões por segurança. */
export async function changeOwnPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `A nova senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (next !== confirm) return { error: "A confirmação não confere com a nova senha." };
  if (next === current) return { error: "A nova senha precisa ser diferente da atual." };

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record || !(await verifyPassword(current, record.passwordHash))) {
    return { error: "Senha atual incorreta." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });

  // Invalida tudo e recria a sessão atual: se a senha vazou, sessões abertas
  // em outros dispositivos morrem junto.
  await destroyAllSessionsForUser(user.id);
  await createSession(user.id, (await headers()).get("user-agent"));

  return { ok: true };
}
