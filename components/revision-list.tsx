import { DocumentStatusChip, StuckBadge } from "@/components/document-status";
import { daysBetween } from "@/lib/documents";
import { formatDate } from "@/lib/format";
import type { RevisionRow } from "@/types/models";
import { ExternalLink } from "lucide-react";

/** Revisões do documento, da mais recente para a mais antiga. */
export function RevisionList({ revisions }: { revisions: RevisionRow[] }) {
  const now = new Date();

  if (revisions.length === 0) {
    return <p className="text-sm text-ink-faint">Nenhuma revisão emitida.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {revisions.map((r) => (
        <li key={r.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-line bg-canvas px-2 py-0.5 font-mono text-xs font-semibold">
                {r.name}
              </span>
              <DocumentStatusChip status={r.status} />
              {r.analysisCode ? (
                <span
                  title={r.analysisCode.name}
                  className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-soft"
                >
                  {r.analysisCode.tag}
                </span>
              ) : null}
              <StuckBadge
                days={r.status === "IN_REVIEW" ? daysBetween(now, r.inReviewSince) : null}
              />
            </div>

            {r.externalUrl ? (
              <a
                href={r.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-strong"
              >
                arquivo <ExternalLink size={11} />
              </a>
            ) : null}
          </div>

          <p className="mt-1 text-xs text-ink-faint">
            {r.specialist ? `analista ${r.specialist.name}` : "sem analista designado"}
            {r.issuedAt ? ` · emitida ${formatDate(r.issuedAt)}` : ""}
            {r.dueAt ? ` · prazo ${formatDate(r.dueAt)}` : ""}
            {r.analyzedAt ? ` · analisada ${formatDate(r.analyzedAt)}` : ""}
            {r.round > 0 ? ` · ${r.round} envio(s)` : ""}
          </p>

          {r.notes ? (
            <p className="mt-1 text-sm text-ink-soft">{r.notes}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
