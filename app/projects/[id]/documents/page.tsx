import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageProjects } from "@/lib/authz";
import { isProjectWritable } from "@/lib/tasks";
import { ReadOnlyBanner } from "@/components/task-ui";
import { Empty } from "@/components/ui";
import { Toolbar } from "@/components/table-ui";
import { DocumentTable, DOCUMENT_SELECT } from "@/components/document-table";
import { Modal } from "@/components/modal";
import { DocumentDetail } from "@/components/document-detail";
import { documentSearchFilter } from "@/lib/documents";
import type {
  DocumentTableRow,
  UserOption,
  DisciplineRow,
  EmpresaRow,
} from "@/types/models";

export const dynamic = "force-dynamic";

export default async function ProjectDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; doc?: string }>;
}) {
  const { id } = await params;
  const { q, doc: openDoc } = await searchParams;
  const user = await requireUser(`/projects/${id}/documents`);

  const project = await prisma.project.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, name: true, status: true },
  });
  if (!project) notFound();

  const documents: DocumentTableRow[] = await prisma.document.findMany({
    where: { projectId: id, ...documentSearchFilter(q) },
    orderBy: { createdAt: "desc" },
    select: DOCUMENT_SELECT,
  });

  // Projeto pausado/encerrado não recebe documento novo.
  const canManage = canManageProjects(user) && isProjectWritable(project.status);

  const disciplines: DisciplineRow[] = canManage
    ? await prisma.discipline.findMany({
        where: { isActive: true, organizationId: user.organizationId },
        orderBy: { tag: "asc" },
        select: {
          id: true,
          tag: true,
          name: true,
          isActive: true,
          _count: { select: { documents: true } },
        },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="px-4 pt-4">
          <Link
            href={`/projects/${id}`}
            className="text-xs text-ink-faint hover:text-ink-soft"
          >
            ← {project.name}
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-ink-soft">
            Cada documento guarda o trâmite completo, da criação à aprovação final.
          </p>
          {project.status !== "ACTIVE" ? (
            <div className="mt-3">
              <ReadOnlyBanner status={project.status} />
            </div>
          ) : null}
        </div>

        <div>
          <Toolbar placeholder="Pesquisar por nº, nome, tipo ou disciplina" />
        </div>

        {documents.length === 0 && !canManage ? (
          <div className="p-6">
            <Empty>
              {q
                ? "Nenhum documento corresponde à busca."
                : "Nenhum documento cadastrado neste projeto."}
            </Empty>
          </div>
        ) : (
          <DocumentTable
            documents={documents}
            quickAdd={canManage ? { projectId: id, disciplines } : undefined}
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
