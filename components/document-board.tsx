"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import clsx from "clsx";
import { AlertCircle, Check, ChevronDown } from "lucide-react";
import { ResizableTable, Th, Td, RowCheckbox } from "@/components/table-ui";
import { DocumentQuickAdd, type DocumentQuickAddConfig } from "@/components/document-quick-add";
import { DeleteButton } from "@/components/delete-button";
import { deleteDocument } from "@/app/actions/documents";
import { MODAL_PARAMS } from "@/components/modal";
import {
  DocumentStatusChip,
  StatusDistribution,
  StuckBadge,
} from "@/components/document-status";
import {
  SHEET_FORMAT_A1,
  daysBetween,
  formatA1,
  isInProduction,
  sumA1Equivalent,
} from "@/lib/documents";
import { formatDate } from "@/lib/format";
import type { DocumentTableRow, RevisionRow } from "@/types/models";

/** Revisão vigente = a de maior sequência (mesma regra de document-table.tsx). */
function currentRevision(doc: DocumentTableRow): RevisionRow | null {
  return doc.revisions[0] ?? null;
}

/** Status que encerram o trâmite do documento — vão para o grupo "Concluídos". */
const CLOSED_STATUSES = new Set(["APPROVED", "SUPERSEDED", "CANCELLED"]);

function isClosed(doc: DocumentTableRow): boolean {
  const rev = currentRevision(doc);
  return rev ? CLOSED_STATUSES.has(rev.status) : false;
}

interface Group {
  key: string;
  title: string;
  /** Classe de texto do título e de borda da faixa lateral. */
  tone: { text: string; bar: string };
  rows: DocumentTableRow[];
}

/**
 * Quadro de documentos no padrão monday.com: grupos recolhíveis com faixa
 * lateral colorida, status em célula sólida e rodapé-resumo por grupo.
 * Reutilizado na visão do projeto e na geral.
 */
export function DocumentBoard({
  documents,
  showProject = false,
  quickAdd,
  canDelete = false,
}: {
  documents: DocumentTableRow[];
  showProject?: boolean;
  /** Mostra o botão de excluir em cada linha. */
  canDelete?: boolean;
  /** Linha de cadastro direto, exibida ao final do grupo "Em andamento". */
  quickAdd?: DocumentQuickAddConfig;
}) {
  const groups: Group[] = [
    {
      key: "open",
      title: "Em andamento",
      tone: { text: "text-accent", bar: "bg-accent" },
      rows: documents.filter((d) => !isClosed(d)),
    },
    {
      key: "closed",
      title: "Concluídos",
      tone: { text: "text-st-done", bar: "bg-st-done" },
      rows: documents.filter(isClosed),
    },
  ];

  return (
    <div className="space-y-8 py-2">
      {groups
        // O grupo de concluídos vazio só ocupa espaço; o de andamento fica
        // sempre, porque é onde o cadastro direto aparece.
        .filter((g) => g.key === "open" || g.rows.length > 0)
        .map((g) => (
          <BoardGroup
            key={g.key}
            group={g}
            showProject={showProject}
            quickAdd={g.key === "open" ? quickAdd : undefined}
            canDelete={canDelete}
          />
        ))}
    </div>
  );
}

interface ProjectGroup {
  id: string;
  name: string;
  rows: DocumentTableRow[];
}

/**
 * Agrupa os documentos por projeto, com os projetos em ordem alfabética
 * (pt-BR, sem diferenciar acento/maiúscula). Dentro de cada projeto, mantém
 * a ordem recebida.
 */
function groupByProject(rows: DocumentTableRow[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const d of rows) {
    const id = d.project.id;
    let g = map.get(id);
    if (!g) {
      g = { id, name: d.project.name, rows: [] };
      map.set(id, g);
    }
    g.rows.push(d);
  }
  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true }),
  );
}

function BoardGroup({
  group,
  showProject,
  quickAdd,
  canDelete,
}: {
  group: Group;
  showProject: boolean;
  quickAdd?: DocumentQuickAddConfig;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => new Set());
  const now = new Date();

  function toggleProject(id: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const revisions = group.rows
    .map(currentRevision)
    .filter((r): r is RevisionRow => r != null);
  const dueDates = revisions
    .map((r) => r.dueAt)
    .filter((d): d is Date => d != null)
    .map((d) => new Date(d).getTime())
    .sort((a, b) => a - b);

  const a1 = sumA1Equivalent(group.rows);

  // Colunas antes de "Formato": seleção, documento, [projeto], disciplina.
  const colsBeforeFormat = showProject ? 4 : 3;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "mb-2 flex items-center gap-1.5 rounded-md px-1 text-lg font-medium hover:bg-canvas",
          group.tone.text,
        )}
      >
        <ChevronDown
          size={18}
          className={clsx("transition-transform", !open && "-rotate-90")}
        />
        {group.title}
        <span className="ml-1 text-sm font-normal text-ink-faint">
          {group.rows.length} documento{group.rows.length === 1 ? "" : "s"}
        </span>
      </button>

      {open ? (
        <div className="dp-scroll relative overflow-x-auto">
          <span
            aria-hidden
            className={clsx("absolute inset-y-0 left-0 w-1.5 rounded-l-md", group.tone.bar)}
          />
          <ResizableTable id="documents-board" className="w-full border-collapse border-y border-r border-line">
            <thead className="bg-surface">
              <tr>
                <Th className="w-10 pl-4">
                  <RowCheckbox />
                </Th>
                <Th className="min-w-[260px]">Documento</Th>
                {showProject ? <Th className="min-w-[160px]">Projeto</Th> : null}
                <Th>Disciplina</Th>
                <Th>Formato</Th>
                <Th>Rev.</Th>
                <Th className="w-[140px]">Status</Th>
                <Th>Parecer</Th>
                <Th className="min-w-[150px]">Responsável</Th>
                <Th align="right">Revisões</Th>
                <Th className="w-[130px]">Prazo</Th>
                <Th className="w-10">
                  <span className="sr-only">Excluir</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {showProject
                ? groupByProject(group.rows).map((pg) => {
                    const collapsed = collapsedProjects.has(pg.id);
                    return (
                      <Fragment key={pg.id}>
                        <tr className="border-b border-line bg-canvas">
                          <td colSpan={99} className="py-2 pl-4 pr-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleProject(pg.id)}
                                aria-label={collapsed ? "Expandir projeto" : "Recolher projeto"}
                                className="rounded p-0.5 text-ink-faint hover:bg-line"
                              >
                                <ChevronDown
                                  size={16}
                                  className={clsx("transition-transform", collapsed && "-rotate-90")}
                                />
                              </button>
                              <Link
                                href={`/projects/${pg.id}`}
                                className="text-sm font-semibold text-ink hover:underline"
                              >
                                {pg.name}
                              </Link>
                              <span className="text-xs text-ink-faint">
                                {pg.rows.length} documento{pg.rows.length === 1 ? "" : "s"}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {collapsed
                          ? null
                          : pg.rows.map((d) => (
                              <DocumentRow key={d.id} doc={d} showProject={showProject} now={now} canDelete={canDelete} />
                            ))}
                      </Fragment>
                    );
                  })
                : group.rows.map((d) => (
                    <DocumentRow key={d.id} doc={d} showProject={showProject} now={now} canDelete={canDelete} />
                  ))}

              {group.rows.length === 0 ? (
                <tr className="border-b border-line">
                  <td colSpan={99} className="py-3 pl-12 text-sm text-ink-faint">
                    Nenhum documento neste grupo.
                  </td>
                </tr>
              ) : null}

              {quickAdd ? <DocumentQuickAdd {...quickAdd} showProject={showProject} /> : null}

              {/* Rodapé-resumo, como no monday: distribuição de status e janela de prazos. */}
              <tr className="bg-surface">
                <td colSpan={colsBeforeFormat} className="border-r border-line" />
                <td
                  className="border-r border-line px-2 py-2 text-center"
                  title={
                    a1.missing > 0
                      ? `${a1.missing} documento(s) sem formato não entram na soma`
                      : "Soma em A1 equivalente"
                  }
                >
                  <span className="whitespace-nowrap text-xs font-medium tabular-nums text-ink">
                    {formatA1(a1.total)} A1
                  </span>
                  {a1.missing > 0 ? (
                    <span className="block text-[10px] text-ink-faint">{a1.missing} sem formato</span>
                  ) : null}
                </td>
                <td className="border-r border-line" />
                <td className="border-r border-line px-2 py-2">
                  <StatusDistribution
                    statuses={revisions.map((r) => (isInProduction(r) ? "PRODUCTION" : r.status))}
                  />
                </td>
                <td colSpan={3} className="border-r border-line" />
                <td className="px-2 py-2 text-center">
                  {dueDates.length > 0 ? (
                    <span className="inline-flex rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white tabular-nums">
                      {formatShort(dueDates[0])}
                      {dueDates.length > 1 && dueDates.at(-1) !== dueDates[0]
                        ? ` – ${formatShort(dueDates.at(-1)!)}`
                        : ""}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-line px-4 py-1 text-xs text-ink-faint">
                      –
                    </span>
                  )}
                </td>
                <td />
              </tr>
            </tbody>
          </ResizableTable>
        </div>
      ) : null}
    </section>
  );
}

function DocumentRow({
  doc: d,
  showProject,
  now,
  canDelete,
}: {
  doc: DocumentTableRow;
  showProject: boolean;
  now: Date;
  canDelete: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rev = currentRevision(d);
  const stuck = rev?.status === "IN_REVIEW" ? daysBetween(now, rev.inReviewSince) : null;
  const closed = rev ? CLOSED_STATUSES.has(rev.status) : false;
  const overdue = !closed && rev?.dueAt != null && new Date(rev.dueAt).getTime() < now.getTime();
  // Responsável = quem está com a bola: o analista enquanto está em análise; o
  // projetista enquanto está em produção ou devolvido para correção.
  const withIssuer = !rev || rev.status === "DRAFT" || rev.status === "COMMENTED" || rev.status === "REJECTED";
  const owner = withIssuer ? d.responsible : rev?.specialist ?? d.responsible;
  const ownerRole = withIssuer || !rev?.specialist ? "projetista" : "analista";

  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
        const params = new URLSearchParams(searchParams.toString());
        for (const key of MODAL_PARAMS) params.delete(key);
        params.set("doc", d.id);
        router.push(`${pathname}?${params}`, { scroll: false });
      }}
      className="group cursor-pointer border-b border-line hover:bg-canvas"
    >
      <Td className="pl-4">
        <RowCheckbox />
      </Td>
      <Td className="max-w-[320px]">
        <div className="flex items-center gap-2">
          <span className="truncate text-ink">
            {d.number ? <span className="text-ink-faint">{d.number} · </span> : null}
            {d.name}
          </span>
          <StuckBadge days={stuck} />
        </div>
        {d.designFirm ? (
          <p className="truncate text-xs text-ink-faint">{d.designFirm.name}</p>
        ) : null}
      </Td>
      {showProject ? (
        <Td className="max-w-[180px]">
          <Link
            href={`/projects/${d.project.id}`}
            className="block truncate text-ink-soft hover:text-accent"
          >
            {d.project.name}
          </Link>
        </Td>
      ) : null}
      <Td className="text-center text-ink-soft">{d.discipline?.tag ?? "—"}</Td>
      <Td className="text-center">
        {d.sheetFormat ? (
          <span
            title={`${formatA1(SHEET_FORMAT_A1[d.sheetFormat])} A1 equivalente`}
            className="whitespace-nowrap text-xs text-ink-soft"
          >
            <span className="font-mono">{d.sheetFormat}</span>
            <span className="text-ink-faint"> · {formatA1(SHEET_FORMAT_A1[d.sheetFormat])}</span>
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </Td>
      <Td className="text-center font-mono text-xs">{rev?.name ?? "—"}</Td>
      <td className="h-px border-r border-line p-0">
        {rev ? (
          <DocumentStatusChip status={rev.status} inProduction={isInProduction(rev)} fill />
        ) : (
          <span className="flex h-full items-center justify-center text-ink-faint">—</span>
        )}
      </td>
      <Td className="text-center">
        {rev?.analysisCode ? (
          <span
            title={rev.analysisCode.name}
            className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-soft"
          >
            {rev.analysisCode.tag}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </Td>
      <Td className="text-center text-ink-soft">
        {owner ? (
          <span className="inline-flex items-center gap-2" title={`${owner.name} — ${ownerRole}`}>
            <Avatar name={owner.name} />
            <span className="max-w-[110px] truncate">{owner.name}</span>
          </span>
        ) : (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-faint">
            ?
          </span>
        )}
      </Td>
      <Td align="right">{d.revisions.length}</Td>
      <Td className="text-center">
        <span className="inline-flex items-center gap-1.5">
          {overdue ? (
            <AlertCircle size={14} className="text-st-stuck" aria-label="Prazo vencido" />
          ) : closed && rev?.dueAt ? (
            <Check size={14} className="text-st-done" aria-label="Concluído" />
          ) : null}
          <span
            className={clsx(
              "tabular-nums",
              closed ? "text-ink-faint line-through" : overdue ? "text-st-stuck" : "text-ink-soft",
            )}
          >
            {formatDate(rev?.dueAt ?? null)}
          </span>
        </span>
      </Td>
      <Td className="w-10 text-center">
        {canDelete ? (
          <DeleteButton
            compact
            action={deleteDocument}
            idField="documentId"
            id={d.id}
            confirm={`Excluir este documento e suas ${d.revisions.length} revisão(ões)?`}
          />
        ) : null}
      </Td>
    </tr>
  );
}

function Avatar({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-st-purple text-[11px] font-semibold text-white">
      {letters}
    </span>
  );
}

const SHORT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function formatShort(ms: number): string {
  return SHORT.format(new Date(ms)).replace(".", "");
}
