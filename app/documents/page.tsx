import { prisma } from "@/lib/prisma";
import { requireUser, canManageProjects } from "@/lib/authz";
import { Empty, Card } from "@/components/ui";
import { Toolbar } from "@/components/table-ui";
import { DocumentTable, DOCUMENT_SELECT, currentRevision } from "@/components/document-table";
import { Modal } from "@/components/modal";
import { DocumentDetail } from "@/components/document-detail";
import { daysBetween, documentSearchFilter } from "@/lib/documents";
import { loadPackageOptions } from "@/lib/server/package-options";
import type {
  DocumentTableRow,
  UserOption,
  DisciplineRow,
  EmpresaRow,
  ProjectOption,
} from "@/types/models";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; doc?: string }>;
}) {
  const user = await requireUser("/documents");
  const { q, filter, doc: openDoc } = await searchParams;

  const documents: DocumentTableRow[] = await prisma.document.findMany({
    where: {
      // Documento não tem organizationId próprio — herda via projeto.
      project: { organizationId: user.organizationId },
      ...(filter === "review" ? { revisions: { some: { status: "IN_REVIEW" } } } : {}),
      ...documentSearchFilter(q, true),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: DOCUMENT_SELECT,
  });

  const canManage = canManageProjects(user);

  // Cadastrar daqui exige escolher o projeto — por isso a lista de projetos
  // só é buscada para quem pode cadastrar.
  const [projects, disciplines]: [ProjectOption[], DisciplineRow[]] = canManage
    ? await Promise.all([
        prisma.project.findMany({
          where: { status: "ACTIVE", organizationId: user.organizationId },
          orderBy: { name: "asc" },
          select: { id: true, name: true, osNumber: true },
        }),
        prisma.discipline.findMany({
          where: { isActive: true, organizationId: user.organizationId },
          orderBy: { tag: "asc" },
          select: {
            id: true,
            tag: true,
            name: true,
            isActive: true,
            _count: { select: { documents: true } },
          },
        }),
      ])
    : [[], []];

  const packages = canManage ? await loadPackageOptions(user.organizationId) : [];

  const now = new Date();
  const stuck = documents.filter((d) => {
    const rev = currentRevision(d);
    return (
      rev?.status === "IN_REVIEW" && (daysBetween(now, rev.inReviewSince) ?? 0) >= 7
    );
  });
  // Documento em looping: já passou da terceira revisão sem fechar.
  const looping = documents.filter((d) => d.revisions.length >= 3);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">
            Documentos
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{documents.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">
            Parados há 7+ dias
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-orange-600">
            {stuck.length}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">
            Em 3+ revisões
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-red-600">
            {looping.length}
          </p>
        </Card>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="px-4 pt-4">
          <h1 className="text-xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-ink-soft">
            Todos os projetos. Documento parado ou em looping antecede o atraso
            da tarefa.
          </p>
        </div>

        <div>
          <Toolbar placeholder="Pesquisar por nº, nome, disciplina ou projeto" />
        </div>

        {/* Com permissão de cadastrar, a lista aparece mesmo vazia: é nela que
            se digita o primeiro documento. */}
        {documents.length === 0 && !canManage ? (
          <div className="p-6">
            <Empty>Nenhum documento encontrado.</Empty>
          </div>
        ) : (
          <DocumentTable
            documents={documents}
            showProject
            quickAdd={canManage ? { projects, packages, disciplines } : undefined}
            canDelete={canManage}
          />
        )}
      </div>
      {openDoc ? (
        <Modal title="Documento" fullHref={`/documents/${openDoc}`}>
          <DocumentDetail id={openDoc} user={user} variant="modal" />
        </Modal>
      ) : null}
    </div>
  );
}
