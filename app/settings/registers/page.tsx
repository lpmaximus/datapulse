import { prisma } from "@/lib/prisma";
import { requireRole, ROLE_LABEL, ROLE_DESCRIPTION, type Role } from "@/lib/authz";
import { Card, SectionTitle, Empty } from "@/components/ui";
import { ResizableTable, Th, CollapsibleGroup } from "@/components/table-ui";
import {
  ClientForm,
  SectorForm,
  DisciplineForm,
  EmpresaForm,
  JobFunctionForm,
  AnalysisCodeForm,
  RoleProfileForm,
  ClientRow,
  SectorRow,
  DisciplineRow,
  EmpresaRow,
  JobFunctionRow,
  AnalysisCodeRow,
} from "@/components/register-forms";
import type {
  ClientRow as ClientRowData,
  SectorRow as SectorRowData,
  DisciplineRow as DisciplineRowData,
  EmpresaRow as EmpresaRowData,
  JobFunctionRow as JobFunctionRowData,
  AnalysisCodeRow as AnalysisCodeRowData,
  RoleProfileRow,
} from "@/types/models";

const ROLE_ORDER: Role[] = ["ADMIN", "MANAGER", "SPECIALIST", "EXECUTIVE"];

export const dynamic = "force-dynamic";

export default async function RegistersPage() {
  const me = await requireRole(["ADMIN", "MANAGER"], "/settings/registers");

  const [clients, sectors, disciplines, firms, jobFunctions, codes, roleProfileRows]: [
    ClientRowData[],
    SectorRowData[],
    DisciplineRowData[],
    EmpresaRowData[],
    JobFunctionRowData[],
    AnalysisCodeRowData[],
    { role: Role; label: string; description: string | null }[],
  ] = await Promise.all([
    prisma.client.findMany({
      where: { organizationId: me.organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        contactName: true,
        email: true,
        phone: true,
        meetingFormCode: true,
        isActive: true,
        _count: { select: { projects: true } },
      },
    }),
    prisma.sector.findMany({
      where: { organizationId: me.organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: { select: { projects: true } },
      },
    }),
    prisma.discipline.findMany({
      where: { organizationId: me.organizationId },
      orderBy: { tag: "asc" },
      select: {
        id: true,
        tag: true,
        name: true,
        isActive: true,
        _count: { select: { documents: true } },
      },
    }),
    prisma.empresa.findMany({
      where: { organizationId: me.organizationId },
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
    prisma.jobFunction.findMany({
      where: { organizationId: me.organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: { select: { users: true } },
      },
    }),
    prisma.analysisCode.findMany({
      where: { organizationId: me.organizationId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        tag: true,
        name: true,
        effect: true,
        description: true,
        sortOrder: true,
        isActive: true,
      },
    }),
    prisma.roleProfile.findMany({
      where: { organizationId: me.organizationId },
      select: { role: true, label: true, description: true },
    }),
  ]);

  // Papéis são fixos (4 valores de UserRole) — preenche com o padrão de
  // código quando ainda não há registro gravado (antes do primeiro salvar).
  const roleProfileByRole = new Map(roleProfileRows.map((r) => [r.role, r]));
  const roleProfiles: RoleProfileRow[] = ROLE_ORDER.map((role) => {
    const saved = roleProfileByRole.get(role);
    return {
      role,
      label: saved?.label ?? ROLE_LABEL[role],
      description: saved?.description ?? ROLE_DESCRIPTION[role],
    };
  });

  // Inativos ficam fora da lista principal por padrão — grupo recolhível
  // com contador, igual ao padrão já usado em /projects.
  const activeCodes = codes.filter((c) => c.isActive);
  const inactiveCodes = codes.filter((c) => !c.isActive);
  const activeDisciplines = disciplines.filter((d) => d.isActive);
  const inactiveDisciplines = disciplines.filter((d) => !d.isActive);
  const activeFirms = firms.filter((f) => f.isActive);
  const inactiveFirms = firms.filter((f) => !f.isActive);
  const activeJobFunctions = jobFunctions.filter((f) => f.isActive);
  const inactiveJobFunctions = jobFunctions.filter((f) => !f.isActive);
  const activeClients = clients.filter((c) => c.isActive);
  const inactiveClients = clients.filter((c) => !c.isActive);
  const activeSectors = sectors.filter((s) => s.isActive);
  const inactiveSectors = sectors.filter((s) => !s.isActive);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cadastros</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Tabelas de referência do sistema. Registros usados em projetos ou
          documentos são <strong>desativados</strong>, nunca excluídos — o
          histórico precisa continuar legível.
        </p>
      </div>

      {/* --------------------------- papéis de acesso -------------------------- */}
      <section>
        <SectionTitle hint="Papel é fixo no código — aqui só rótulo e descrição são editáveis">
          Papéis de acesso
        </SectionTitle>
        <Card className="space-y-4">
          {roleProfiles.map((p) => (
            <RoleProfileForm key={p.role} profile={p} />
          ))}
        </Card>
      </section>

      {/* ------------------------- códigos de análise ------------------------- */}
      <section>
        <SectionTitle hint="Definem o que cada parecer faz no fluxo">
          Códigos de análise
        </SectionTitle>
        <Card className="space-y-5">
          {codes.length === 0 ? (
            <Empty>Nenhum código cadastrado. Sem eles, não é possível analisar.</Empty>
          ) : (
            <ResizableTable id="settings-analysis-codes" className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <Th className="w-10">Ativo</Th>
                  <Th>Sigla</Th>
                  <Th className="min-w-[160px]">Nome</Th>
                  <Th className="min-w-[240px]">Efeito no fluxo</Th>
                  <Th>Descrição</Th>
                </tr>
              </thead>
              <tbody>
                {activeCodes.map((c) => (
                  <AnalysisCodeRow key={c.id} code={c} />
                ))}
                <CollapsibleGroup label="código(s) inativo(s)" count={inactiveCodes.length}>
                  {inactiveCodes.map((c) => (
                    <AnalysisCodeRow key={c.id} code={c} />
                  ))}
                </CollapsibleGroup>
              </tbody>
            </ResizableTable>
          )}
          <div className="border-t border-line pt-5">
            <AnalysisCodeForm />
          </div>
        </Card>
      </section>

      {/* ---------------------------- disciplinas ---------------------------- */}
      <section>
        <SectionTitle hint="Sigla usada na numeração dos documentos">
          Disciplinas
        </SectionTitle>
        <Card className="space-y-5">
          {disciplines.length === 0 ? (
            <Empty>Nenhuma disciplina cadastrada.</Empty>
          ) : (
            <ResizableTable id="settings-disciplines" className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <Th className="w-10">Ativo</Th>
                  <Th>Sigla</Th>
                  <Th className="min-w-[200px]">Nome</Th>
                  <Th align="right">Documentos</Th>
                </tr>
              </thead>
              <tbody>
                {activeDisciplines.map((d) => (
                  <DisciplineRow key={d.id} discipline={d} />
                ))}
                <CollapsibleGroup label="disciplina(s) inativa(s)" count={inactiveDisciplines.length}>
                  {inactiveDisciplines.map((d) => (
                    <DisciplineRow key={d.id} discipline={d} />
                  ))}
                </CollapsibleGroup>
              </tbody>
            </ResizableTable>
          )}
          <div className="border-t border-line pt-5">
            <DisciplineForm />
          </div>
        </Card>
      </section>

      {/* ------------------------------- empresas ------------------------------ */}
      <section>
        <SectionTitle hint="Empresas vinculadas a projetos, documentos e usuários">
          Empresas
        </SectionTitle>
        <Card className="space-y-5">
          {firms.length === 0 ? (
            <Empty>Nenhuma empresa cadastrada.</Empty>
          ) : (
            <ResizableTable id="settings-companies" className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <Th className="w-10">Ativo</Th>
                  <Th className="min-w-[200px]">Nome</Th>
                  <Th className="min-w-[160px]">Coordenador</Th>
                  <Th>Contato</Th>
                  <Th align="right">Projetos</Th>
                  <Th align="right">Documentos</Th>
                </tr>
              </thead>
              <tbody>
                {activeFirms.map((f) => (
                  <EmpresaRow key={f.id} empresa={f} />
                ))}
                <CollapsibleGroup label="empresa(s) inativa(s)" count={inactiveFirms.length}>
                  {inactiveFirms.map((f) => (
                    <EmpresaRow key={f.id} empresa={f} />
                  ))}
                </CollapsibleGroup>
              </tbody>
            </ResizableTable>
          )}
          <div className="border-t border-line pt-5">
            <EmpresaForm />
          </div>
        </Card>
      </section>

      {/* ------------------------------ funções ------------------------------ */}
      <section>
        <SectionTitle hint="Cargo do usuário — não é o papel de acesso ao sistema">
          Funções
        </SectionTitle>
        <Card className="space-y-5">
          {jobFunctions.length === 0 ? (
            <Empty>Nenhuma função cadastrada.</Empty>
          ) : (
            <ResizableTable id="settings-job-titles" className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <Th className="w-10">Ativo</Th>
                  <Th className="min-w-[200px]">Nome</Th>
                  <Th align="right">Usuários</Th>
                </tr>
              </thead>
              <tbody>
                {activeJobFunctions.map((f) => (
                  <JobFunctionRow key={f.id} jobFunction={f} />
                ))}
                <CollapsibleGroup label="função(ões) inativa(s)" count={inactiveJobFunctions.length}>
                  {inactiveJobFunctions.map((f) => (
                    <JobFunctionRow key={f.id} jobFunction={f} />
                  ))}
                </CollapsibleGroup>
              </tbody>
            </ResizableTable>
          )}
          <div className="border-t border-line pt-5">
            <JobFunctionForm />
          </div>
        </Card>
      </section>

      {/* ------------------------------ clientes ----------------------------- */}
      <section>
        <SectionTitle>Clientes</SectionTitle>
        <Card className="space-y-5">
          {clients.length === 0 ? (
            <Empty>Nenhum cliente cadastrado.</Empty>
          ) : (
            <ResizableTable id="settings-clients" className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <Th className="w-10">Ativo</Th>
                  <Th className="min-w-[200px]">Nome</Th>
                  <Th>Código</Th>
                  <Th className="min-w-[160px]">Contato</Th>
                  <Th align="right">Projetos</Th>
                </tr>
              </thead>
              <tbody>
                {activeClients.map((c) => (
                  <ClientRow key={c.id} client={c} />
                ))}
                <CollapsibleGroup label="cliente(s) inativo(s)" count={inactiveClients.length}>
                  {inactiveClients.map((c) => (
                    <ClientRow key={c.id} client={c} />
                  ))}
                </CollapsibleGroup>
              </tbody>
            </ResizableTable>
          )}
          <div className="border-t border-line pt-5">
            <ClientForm />
          </div>
        </Card>
      </section>

      {/* ------------------------------- setores ----------------------------- */}
      <section>
        <SectionTitle>Setores</SectionTitle>
        <Card className="space-y-5">
          {sectors.length === 0 ? (
            <Empty>Nenhum setor cadastrado.</Empty>
          ) : (
            <ResizableTable id="settings-sectors" className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <Th className="w-10">Ativo</Th>
                  <Th className="min-w-[240px]">Nome</Th>
                  <Th align="right">Projetos</Th>
                </tr>
              </thead>
              <tbody>
                {activeSectors.map((s) => (
                  <SectorRow key={s.id} sector={s} />
                ))}
                <CollapsibleGroup label="setor(es) inativo(s)" count={inactiveSectors.length}>
                  {inactiveSectors.map((s) => (
                    <SectorRow key={s.id} sector={s} />
                  ))}
                </CollapsibleGroup>
              </tbody>
            </ResizableTable>
          )}
          <div className="border-t border-line pt-5">
            <SectorForm />
          </div>
        </Card>
      </section>
    </div>
  );
}
