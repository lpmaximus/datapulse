import { prisma } from "@/lib/prisma";
import { requireRole, ROLE_LABEL, type Role } from "@/lib/authz";
import { toggleUserActive } from "@/app/actions/users";
import { Card, SectionTitle, Empty, Chip } from "@/components/ui";
import { ResizableTable, Toolbar, Th, Td, StatusToggle, CollapsibleGroup } from "@/components/table-ui";
import { UserCreateForm } from "@/components/user-create-form";
import { RoleSelect, CompanySelect, ResetPasswordButton } from "@/components/user-row-actions";
import { DisciplinesEditor } from "@/components/disciplines-editor";
import { formatDateTime } from "@/lib/format";
import type { UserTableRow, JobFunctionRow, EmpresaRow } from "@/types/models";

export const dynamic = "force-dynamic";

type DisciplineOption = { id: string; tag: string; name: string };

function UserRow({
  u,
  meId,
  companies,
  roleLabel,
  disciplines,
}: {
  u: UserTableRow;
  meId: string;
  companies: EmpresaRow[];
  roleLabel: Partial<Record<Role, string>>;
  disciplines: DisciplineOption[];
}) {
  return (
    <tr className="border-b border-line last:border-0 hover:bg-canvas/60">
      <Td>
        <StatusToggle
          action={toggleUserActive}
          id={u.id}
          fieldName="userId"
          checked={u.isActive}
          disabled={u.id === meId}
        />
      </Td>
      <Td>
        <span className="font-medium">{u.name}</span>
        {u.id === meId ? <span className="ml-2 text-xs text-ink-faint">(você)</span> : null}
        {u.mustChangePassword ? (
          <p className="mt-0.5">
            <Chip>senha provisória</Chip>
          </p>
        ) : null}
      </Td>
      <Td className="text-ink-soft">{u.email}</Td>
      <Td>
        <RoleSelect userId={u.id} role={u.role} disabled={u.id === meId} labels={roleLabel} />
      </Td>
      <Td className="text-ink-soft">{u.function?.name ?? "—"}</Td>
      <Td>
        <DisciplinesEditor
          userId={u.id}
          selected={u.disciplines.map((d) => d.disciplineId)}
          disciplines={disciplines}
        />
      </Td>
      <Td>
        <CompanySelect userId={u.id} companyId={u.company?.id ?? null} companies={companies} />
      </Td>
      <Td align="right">{u._count.memberships + u._count.managedProjects}</Td>
      <Td align="right">{u._count.signalRequests}</Td>
      <Td className="text-ink-faint">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "nunca"}</Td>
      <Td>
        <ResetPasswordButton userId={u.id} />
      </Td>
    </tr>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const me = await requireRole(["ADMIN"], "/users");
  const { q } = await searchParams;

  const [users, functions, companies, roleProfiles, disciplines]: [
    UserTableRow[],
    JobFunctionRow[],
    EmpresaRow[],
    { role: Role; label: string; description: string | null }[],
    DisciplineOption[],
  ] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId: me.organizationId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { function: { name: { contains: q, mode: "insensitive" } } },
                { company: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        function: { select: { name: true } },
        company: { select: { id: true, name: true } },
        disciplines: { select: { disciplineId: true } },
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: { memberships: true, managedProjects: true, signalRequests: true },
        },
      },
    }),
    prisma.jobFunction.findMany({
      where: { isActive: true, organizationId: me.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true, _count: { select: { users: true } } },
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
    prisma.roleProfile.findMany({
      where: { organizationId: me.organizationId },
      select: { role: true, label: true, description: true },
    }),
    prisma.discipline.findMany({
      where: { isActive: true, organizationId: me.organizationId },
      orderBy: { tag: "asc" },
      select: { id: true, tag: true, name: true },
    }),
  ]);

  const roleLabel: Partial<Record<Role, string>> = {};
  for (const r of roleProfiles) roleLabel[r.role] = r.label;

  const activeUsers = users.filter((u) => u.isActive);
  const inactiveUsers = users.filter((u) => !u.isActive);

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="px-4 pt-4">
          <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-ink-soft">
            Quem acessa a plataforma e o que cada um pode fazer.
          </p>
        </div>

        <div className="mt-3">
          <Toolbar placeholder="Pesquisar por nome, e-mail ou disciplina" />
        </div>

        {users.length === 0 ? (
          <div className="p-6">
            <Empty>Nenhum usuário encontrado.</Empty>
          </div>
        ) : (
          <div className="dp-scroll overflow-x-auto">
            <ResizableTable id="users-list" className="w-full border-collapse">
              <thead className="bg-surface">
                <tr>
                  <Th className="w-10">Ativo</Th>
                  <Th className="min-w-[200px]">Nome</Th>
                  <Th className="min-w-[180px]">E-mail</Th>
                  <Th>Papel</Th>
                  <Th>Função</Th>
                  <Th>Disciplinas</Th>
                  <Th>Empresa</Th>
                  <Th align="right">Projetos</Th>
                  <Th align="right">Demandas</Th>
                  <Th>Último acesso</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((u) => (
                  <UserRow key={u.id} u={u} meId={me.id} companies={companies} roleLabel={roleLabel} disciplines={disciplines} />
                ))}
                <CollapsibleGroup label="usuário(s) inativo(s)" count={inactiveUsers.length}>
                  {inactiveUsers.map((u) => (
                    <UserRow key={u.id} u={u} meId={me.id} companies={companies} roleLabel={roleLabel} disciplines={disciplines} />
                  ))}
                </CollapsibleGroup>
              </tbody>
            </ResizableTable>
          </div>
        )}
      </div>

      <div>
        <SectionTitle
          hint={`Papéis: ${Object.values({ ...ROLE_LABEL, ...roleLabel }).join(", ")}`}
        >
          Novo usuário
        </SectionTitle>
        <Card>
          <UserCreateForm functions={functions} companies={companies} />
        </Card>
      </div>
    </div>
  );
}
