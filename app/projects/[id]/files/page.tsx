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
import { Card, Empty, SectionTitle } from "@/components/ui";
import { DeleteButton } from "@/components/delete-button";
import { ProjectFileUpload } from "@/components/project-file-upload";
import { formatDate } from "@/lib/format";
import { FILE_KIND_SUGGESTIONS, ORG_QUOTA_BYTES, formatBytes } from "@/lib/files";

export const dynamic = "force-dynamic";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}/files`);

  const project = await prisma.project.findFirst({
    where: { id, ...projectVisibility(user) },
    select: { id: true, name: true, status: true },
  });
  if (!project) notFound();

  const manage = canManageProjects(user);

  const [files, used, usedKinds] = await Promise.all([
    prisma.projectFile.findMany({
      where: { projectId: id, organizationId: user.organizationId },
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
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-xs text-ink-faint hover:text-ink-soft">
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Arquivos do projeto</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ordem de serviço, processos SEI, contratos e controles. Ficam guardados com acesso restrito
          a quem enxerga este projeto.
        </p>
      </div>

      <ReadOnlyBanner status={project.status} projectId={project.id} canReactivate={manage} />

      {canUpload ? (
        <Card>
          <ProjectFileUpload projectId={id} kindSuggestions={kindSuggestions} />
        </Card>
      ) : null}

      <section className="space-y-3">
        <SectionTitle hint={`${files.length} arquivo(s)`}>Arquivos</SectionTitle>
        {files.length === 0 ? (
          <Empty>Nenhum arquivo enviado neste projeto.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-2 font-medium">Título</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Referência</th>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Tamanho</th>
                  <th className="px-4 py-2 font-medium">Enviado</th>
                  <th className="w-24 px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {files.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-2.5">
                      <a
                        href={`/api/files/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:text-accent"
                      >
                        {f.title}
                      </a>
                      {f.note ? <p className="text-xs text-ink-faint">{f.note}</p> : null}
                    </td>
                    <td className="px-4 py-2.5">{f.kind}</td>
                    <td className="px-4 py-2.5 tabular-nums">{f.reference ?? "—"}</td>
                    <td className="px-4 py-2.5">{f.issuedAt ? formatDate(f.issuedAt) : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatBytes(f.sizeBytes)}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-soft">
                      {formatDate(f.createdAt)}
                      {f.uploadedBy ? ` · ${f.uploadedBy.name}` : ""}
                    </td>
                    <td className="px-4 py-2.5">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {manage ? (
        <p className="text-xs text-ink-faint">
          Sua organização usa {formatBytes(used)} · limite compartilhado da plataforma: {formatBytes(ORG_QUOTA_BYTES)}.
        </p>
      ) : null}
    </div>
  );
}
