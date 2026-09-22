import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageProjects } from "@/lib/authz";
import { isProjectWritable } from "@/lib/tasks";
import { projectVisibility } from "@/lib/visibility";
import { orgUsedBytes } from "@/lib/server/files";
import { deleteProjectFile } from "@/app/actions/project-files";
import { ReadOnlyBanner } from "@/components/task-ui";
import { Empty } from "@/components/ui";
import { ResizableTable, Th, Td, Toolbar } from "@/components/table-ui";
import { DeleteButton } from "@/components/delete-button";
import { ProjectFileDialog } from "@/components/project-file-dialog";
import { formatDate } from "@/lib/format";
import { FILE_KIND_SUGGESTIONS, ORG_QUOTA_BYTES, formatBytes } from "@/lib/files";

export const dynamic = "force-dynamic";

export default async function ProjectFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const user = await requireUser(`/projects/${id}/files`);

  const project = await prisma.project.findFirst({
    where: { id, ...projectVisibility(user) },
    select: { id: true, name: true, status: true },
  });
  if (!project) notFound();

  const manage = canManageProjects(user);
  const term = q?.trim();
  const like = term ? { contains: term, mode: "insensitive" as const } : null;

  const [files, used, usedKinds] = await Promise.all([
    prisma.projectFile.findMany({
      where: {
        projectId: id,
        organizationId: user.organizationId,
        ...(like
          ? {
              OR: [
                { title: like },
                { kind: like },
                { reference: like },
                { fileName: like },
                { note: like },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        kind: true,
        reference: true,
        issuedAt: true,
        note: true,
        fileName: true,
        sizeBytes: true,
        createdAt: true,
        uploadedBy: { select: { name: true } },
      },
    }),
    manage ? orgUsedBytes(user.organizationId) : Promise.resolve(0),
    manage
      ? prisma.projectFile.findMany({
          where: { organizationId: user.organizationId },
          distinct: ["kind"],
          select: { kind: true },
        })
      : Promise.resolve([] as { kind: string }[]),
  ]);

  const canUpload = manage && isProjectWritable(project.status);
  const kindSuggestions = [...new Set([...FILE_KIND_SUGGESTIONS, ...usedKinds.map((k) => k.kind)])];

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div>
          <Link href={`/projects/${id}`} className="text-xs text-ink-faint hover:text-ink-soft">
            ← {project.name}
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Arquivos</h1>
          <p className="text-sm text-ink-soft">
            Ordem de serviço, processos SEI, contratos e controles. Acesso restrito a quem enxerga
            este projeto.
          </p>
        </div>
        {canUpload ? <ProjectFileDialog projectId={id} kindSuggestions={kindSuggestions} /> : null}
      </div>

      {project.status !== "ACTIVE" ? (
        <div className="mt-3 px-4">
          <ReadOnlyBanner status={project.status} projectId={project.id} canReactivate={manage} />
        </div>
      ) : null}

      <div className="mt-3">
        <Toolbar placeholder="Pesquisar por título, tipo ou referência" />
      </div>

      {files.length === 0 ? (
        <div className="p-6">
          <Empty>
            {q ? "Nenhum arquivo corresponde à busca." : "Nenhum arquivo enviado neste projeto."}
          </Empty>
        </div>
      ) : (
        <div className="dp-scroll overflow-x-auto">
          <ResizableTable id="project-files" className="w-full border-collapse">
            <thead className="bg-surface">
              <tr>
                <Th className="min-w-[240px]">Título</Th>
                <Th>Tipo</Th>
                <Th>Referência</Th>
                <Th>Data do documento</Th>
                <Th align="right">Tamanho</Th>
                <Th>Enviado por</Th>
                <Th>Enviado em</Th>
                <Th className="w-20">
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="group border-b border-line hover:bg-canvas">
                  <Td>
                    <a
                      href={`/api/files/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:text-accent"
                    >
                      {f.title}
                    </a>
                    {f.note ? <p className="text-xs text-ink-faint">{f.note}</p> : null}
                  </Td>
                  <Td>{f.kind}</Td>
                  <Td className="tabular-nums">{f.reference ?? "—"}</Td>
                  <Td>{f.issuedAt ? formatDate(f.issuedAt) : "—"}</Td>
                  <Td align="right">{formatBytes(f.sizeBytes)}</Td>
                  <Td>{f.uploadedBy?.name ?? "—"}</Td>
                  <Td>{formatDate(f.createdAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/api/files/${f.id}?download=1`}
                        aria-label={`Baixar ${f.fileName}`}
                        title="Baixar"
                        className="rounded p-1.5 text-ink-soft hover:bg-canvas hover:text-ink"
                      >
                        <Download size={15} />
                      </a>
                      {canUpload ? (
                        <DeleteButton
                          compact
                          action={deleteProjectFile}
                          idField="fileId"
                          id={f.id}
                          confirm="Excluir este arquivo? Não tem como recuperar."
                        />
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </ResizableTable>
        </div>
      )}

      {manage ? (
        <p className="border-t border-line px-4 py-3 text-xs text-ink-faint">
          Sua organização usa {formatBytes(used)} · limite compartilhado da plataforma:{" "}
          {formatBytes(ORG_QUOTA_BYTES)}.
        </p>
      ) : null}
    </div>
  );
}
