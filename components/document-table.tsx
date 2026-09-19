import { DocumentBoard } from "@/components/document-board";
import type { DocumentQuickAddConfig } from "@/components/document-quick-add";
import type { DocumentTableRow, RevisionRow } from "@/types/models";

/** Revisão vigente = a de maior sequência. */
export function currentRevision(doc: DocumentTableRow): RevisionRow | null {
  return doc.revisions[0] ?? null;
}

/**
 * Quadro de documentos (grupos Em andamento / Concluídos), reutilizado na
 * visão do projeto e na geral. A interação fica em `document-board.tsx`;
 * este módulo continua importável por Server Components.
 */
export function DocumentTable({
  documents,
  showProject = false,
  quickAdd,
}: {
  documents: DocumentTableRow[];
  showProject?: boolean;
  quickAdd?: DocumentQuickAddConfig;
}) {
  return <DocumentBoard documents={documents} showProject={showProject} quickAdd={quickAdd} />;
}

export const DOCUMENT_SELECT = {
  id: true,
  number: true,
  name: true,
  type: true,
  discipline: { select: { id: true, tag: true, name: true } },
  designFirm: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  revisions: {
    orderBy: { sequence: "desc" },
    select: {
      id: true,
      name: true,
      sequence: true,
      status: true,
      round: true,
      inReviewSince: true,
      issuedAt: true,
      dueAt: true,
      analyzedAt: true,
      externalUrl: true,
      notes: true,
      specialist: { select: { id: true, name: true } },
      analysisCode: { select: { id: true, tag: true, name: true } },
      _count: { select: { transitions: true } },
    },
  },
} as const;
