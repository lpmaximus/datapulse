import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getCurrentUser, getSessionIdentity } from "@/lib/session";
import { listAccessibleWorkspaces } from "@/lib/server/workspace-service";
import { selectWorkspace } from "@/app/actions/workspaces";
import { logout } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/lib/authz";
import { safeNext } from "@/lib/workspaces";
import { WorkspaceCreateForm } from "@/components/workspace-create-form";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const identity = await getSessionIdentity();
  if (!identity) redirect("/login");

  const [workspaces, current] = await Promise.all([
    listAccessibleWorkspaces(identity.id),
    getCurrentUser(),
  ]);
  const dest = safeNext(next);

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="mb-6 text-center">
        <Logo size={44} className="justify-center" />
        <h1 className="mt-3 text-lg font-semibold text-ink">Escolha o workspace</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {identity.name} · {identity.email}
          {identity.isSuperAdmin ? " · Superadmin" : ""}
        </p>
      </div>

      {error === "sem-acesso" ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Você não tem acesso a esse workspace.
        </p>
      ) : null}

      <Card>
        {workspaces.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nenhum workspace disponível para este usuário. Cadastre um abaixo.
          </p>
        ) : (
          <ul className="space-y-2">
            {workspaces.map((w) => (
              <li key={w.id}>
                <form action={selectWorkspace}>
                  <input type="hidden" name="organizationId" value={w.id} />
                  <input type="hidden" name="next" value={dest} />
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-3 text-left transition-colors hover:border-accent hover:bg-canvas"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-white">
                      <Building2 size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{w.name}</span>
                      <span className="block text-xs text-ink-soft">
                        {identity.isSuperAdmin ? "Superadmin" : ROLE_LABEL[w.role]}
                      </span>
                    </span>
                    {current?.organizationId === w.id ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-ink">
                        atual
                      </span>
                    ) : null}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {identity.isSuperAdmin ? (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Cadastrar novo workspace</h2>
          <Card>
            <WorkspaceCreateForm />
          </Card>
        </div>
      ) : null}

      <form action={logout} className="mt-6 text-center">
        <button type="submit" className="text-sm text-ink-soft underline hover:text-ink">
          Sair
        </button>
      </form>
    </div>
  );
}
