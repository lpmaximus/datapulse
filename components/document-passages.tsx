import clsx from "clsx";
import { ResizableTable, Th, Td } from "@/components/table-ui";
import { daysBetween, type DocumentAction, type DocumentStatus, type Passage } from "@/lib/documents";
import { formatDate } from "@/lib/format";

const OUTCOME_LABEL: Partial<Record<DocumentAction, string>> = {
  COMMENTED: "Comentado",
  REJECTED: "Reprovado",
  APPROVED_WITH_COMMENTS: "Aprovado c/ ressalvas",
  APPROVED: "Aprovado",
  CANCELLED: "Cancelado",
};

const OUTCOME_TONE: Partial<Record<DocumentAction, string>> = {
  COMMENTED: "bg-orange-500",
  REJECTED: "bg-red-500",
  APPROVED_WITH_COMMENTS: "bg-lime-600",
  APPROVED: "bg-green-600",
  CANCELLED: "bg-ink-faint",
};

/** Uma frase sobre onde o documento está agora, lida das passagens. */
function situation(
  passages: Passage[],
  status: DocumentStatus | null,
  now: Date,
): string {
  const last = passages.at(-1) ?? null;
  const totalDays = passages.reduce((sum, p) => sum + p.days, 0);

  switch (status) {
    case "IN_REVIEW":
      return last?.open
        ? `Em análise há ${last.days} dia(s)${last.analyst ? ` com ${last.analyst}` : ""} — passagem ${last.number}.`
        : "Em análise.";
    case "COMMENTED":
    case "REJECTED": {
      const since = daysBetween(now, last?.returnedAt) ?? 0;
      return `Devolvido à empresa${last?.returnedAt ? ` em ${formatDate(last.returnedAt)}` : ""} (${since} dia(s)) — aguardando nova revisão.`;
    }
    case "APPROVED":
      return `Aprovado${last?.returnedAt ? ` em ${formatDate(last.returnedAt)}` : ""} após ${passages.length} passagem(ns), ${totalDays} dia(s) em análise.`;
    case "DRAFT":
      return passages.length > 0
        ? "Nova revisão emitida, ainda não enviada para análise."
        : "Ainda não foi enviado para análise.";
    case "CANCELLED":
    case "SUPERSEDED":
      return "Documento encerrado sem aprovação.";
    default:
      return "";
  }
}

/**
 * Passagens do documento pelo sistema: cada ida para análise e a volta,
 * em ordem cronológica. O mesmo documento pode voltar várias vezes, em
 * períodos diferentes, até a aprovação — esta lista mostra todas.
 */
export function DocumentPassages({
  passages,
  currentStatus,
  now,
}: {
  passages: Passage[];
  currentStatus: DocumentStatus | null;
  now: Date;
}) {
  const line = situation(passages, currentStatus, now);

  if (passages.length === 0) {
    return <p className="text-sm text-ink-faint">{line || "Ainda não foi enviado para análise."}</p>;
  }

  return (
    <div className="space-y-3">
      {line ? <p className="text-sm text-ink-soft">{line}</p> : null}

      <div className="dp-scroll overflow-x-auto rounded-md border border-line">
        <ResizableTable id="document-passages" className="w-full border-collapse">
          <thead className="bg-canvas">
            <tr>
              <Th className="w-12">Nº</Th>
              <Th>Revisão</Th>
              <Th>Enviado em</Th>
              <Th>Analista</Th>
              <Th>Prazo</Th>
              <Th>Retorno em</Th>
              <Th>Resultado</Th>
              <Th align="right">Dias</Th>
              <Th className="min-w-[200px]">Observações</Th>
            </tr>
          </thead>
          <tbody>
            {passages.map((p) => {
              const late =
                p.dueAt != null &&
                (p.returnedAt ?? now).getTime() > p.dueAt.getTime() + 86_399_999;
              const note = [p.returnComment, p.sentComment].filter(Boolean).join(" · ");
              return (
                <tr key={`${p.revisionId}-${p.round}-${p.number}`} className="border-t border-line">
                  <Td className="text-center tabular-nums text-ink-soft">{p.number}</Td>
                  <Td className="text-center">
                    <span className="font-mono text-xs">{p.revisionName}</span>
                    {p.round > 1 ? (
                      <span className="ml-1 text-[11px] text-ink-faint">envio {p.round}</span>
                    ) : null}
                  </Td>
                  <Td className="text-center tabular-nums text-ink-soft">{formatDate(p.sentAt)}</Td>
                  <Td className="text-ink-soft">{p.analyst ?? "—"}</Td>
                  <Td className="text-center">
                    <span className={clsx("tabular-nums", late ? "text-st-stuck" : "text-ink-soft")}>
                      {formatDate(p.dueAt)}
                    </span>
                  </Td>
                  <Td className="text-center tabular-nums text-ink-soft">
                    {p.returnedAt ? formatDate(p.returnedAt) : "—"}
                  </Td>
                  <Td className="text-center">
                    {p.outcome ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={clsx("h-2 w-2 rounded-full", OUTCOME_TONE[p.outcome] ?? "bg-ink-faint")} />
                        <span className="text-sm">{OUTCOME_LABEL[p.outcome] ?? p.outcome}</span>
                        {p.analysisTag ? (
                          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                            {p.analysisTag}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-sm bg-sky-500 px-2 py-0.5 text-xs font-medium text-white">
                        Em análise
                      </span>
                    )}
                  </Td>
                  <Td align="right">{p.days}</Td>
                  <td className="max-w-[320px] px-3 py-2 text-xs text-ink-soft" title={note || undefined}>
                    <span className="line-clamp-2">{note || "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ResizableTable>
      </div>
    </div>
  );
}
