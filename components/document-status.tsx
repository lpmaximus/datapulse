import clsx from "clsx";
import {
  PRODUCTION_LABEL,
  STATUS_LABEL,
  revisionStatusLabel,
  type DocumentStatus,
} from "@/lib/documents";

/** Status de exibição: os do banco mais "Em produção" (rascunho sem pacote). */
export type DisplayStatus = DocumentStatus | "PRODUCTION";

const PRODUCTION_COLOR = "bg-st-production";

/**
 * Cor sólida por status, no padrão da coluna "Status" do monday.com.
 * A mesma tabela alimenta a barra de distribuição no rodapé dos grupos.
 */
export const STATUS_COLOR: Record<DocumentStatus, string> = {
  DRAFT: "bg-st-blue",
  IN_REVIEW: "bg-st-working",
  APPROVED: "bg-st-done",
  COMMENTED: "bg-st-purple",
  REJECTED: "bg-st-stuck",
  SUPERSEDED: "bg-st-gray",
  CANCELLED: "bg-st-dark",
};

/** Ordem de leitura na barra de distribuição: do encerrado ao travado. */
export const STATUS_ORDER: DisplayStatus[] = [
  "APPROVED",
  "IN_REVIEW",
  "DRAFT",
  "PRODUCTION",
  "COMMENTED",
  "REJECTED",
  "SUPERSEDED",
  "CANCELLED",
];

export function DocumentStatusChip({
  status,
  inProduction = false,
  fill = false,
}: {
  status: DocumentStatus;
  /** Rascunho sem pacote: mostra "Em produção" em vez de "Emitida". */
  inProduction?: boolean;
  /** Ocupa a célula inteira, como no quadro do monday. */
  fill?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center text-xs font-medium text-white",
        fill ? "h-full w-full px-2 py-2" : "min-w-[96px] px-2 py-1",
        status === "CANCELLED" && "line-through",
        status === "DRAFT" && inProduction
          ? PRODUCTION_COLOR
          : STATUS_COLOR[status] ?? STATUS_COLOR.DRAFT,
      )}
    >
      {revisionStatusLabel(status, inProduction)}
    </span>
  );
}

/** Destaque para documento parado além do razoável. */
export function StuckBadge({ days }: { days: number | null }) {
  if (days == null || days < 7) return null;
  return (
    <span
      title={`Em análise há ${days} dia(s)`}
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        days >= 21
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-orange-200 bg-orange-50 text-orange-700",
      )}
    >
      parado há {days} dia(s)
    </span>
  );
}

/** Barra segmentada com a proporção de cada status — rodapé do grupo. */
export function StatusDistribution({ statuses }: { statuses: DisplayStatus[] }) {
  if (statuses.length === 0) {
    return <span className="block h-6 w-full rounded-sm bg-line" />;
  }
  const counts = new Map<DisplayStatus, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);

  return (
    <span className="flex h-6 w-full overflow-hidden rounded-sm">
      {STATUS_ORDER.filter((s) => counts.has(s)).map((s) => {
        const n = counts.get(s)!;
        return (
          <span
            key={s}
            title={`${s === "PRODUCTION" ? PRODUCTION_LABEL : STATUS_LABEL[s]}: ${n} (${Math.round((n / statuses.length) * 100)}%)`}
            className={clsx("h-full", s === "PRODUCTION" ? PRODUCTION_COLOR : STATUS_COLOR[s])}
            style={{ width: `${(n / statuses.length) * 100}%` }}
          />
        );
      })}
    </span>
  );
}
