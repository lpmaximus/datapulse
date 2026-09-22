import clsx from "clsx";
import { Empty } from "@/components/ui";
import { ClickableRow } from "@/components/clickable-row";
import { ResizableTable, Th, Td } from "@/components/table-ui";
import { formatDate } from "@/lib/format";
import { meetingState, MEETING_STATE_LABEL, MEETING_STATE_COLOR } from "@/lib/meetings";
import type { MeetingRow } from "@/types/models";

function StateCell({ state }: { state: ReturnType<typeof meetingState> }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium text-ink")}>
      <span className={clsx("h-2 w-2 rounded-full", MEETING_STATE_COLOR[state])} />
      {MEETING_STATE_LABEL[state]}
    </span>
  );
}

/** Lista de reuniões do projeto — agendadas e realizadas, mais recentes primeiro. */
export function MeetingTable({
  meetings,
  now,
  projectId,
}: {
  meetings: MeetingRow[];
  now: Date;
  projectId: string;
}) {
  if (meetings.length === 0) {
    return <Empty>Nenhuma reunião registrada. Cadastre a primeira em "Nova reunião".</Empty>;
  }
  return (
    <div className="dp-scroll dp-box dp-box-canvas max-h-[30rem] rounded-lg border border-line bg-surface">
      <ResizableTable id="meetings-table" className="w-full border-collapse">
        <thead className="bg-canvas">
          <tr>
            <Th className="min-w-[240px] pl-4">Reunião</Th>
            <Th className="w-[130px]">Data</Th>
            <Th className="w-[170px]">Estado</Th>
            <Th>Marco</Th>
            <Th align="right" className="w-[130px]">Pendências</Th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m) => {
            const state = meetingState(m.date, m._count.topics, now);
            return (
              <ClickableRow
                key={m.id}
                href={`/projects/${projectId}/meetings/${m.id}`}
                className="border-t border-line hover:bg-canvas/60"
              >
                <Td className="max-w-[360px] pl-4">
                  <p className="truncate text-ink">{m.title || m.subject || "Reunião"}</p>
                  {m.number != null ? <p className="truncate text-xs text-ink-faint">Ata nº {m.number}</p> : null}
                </Td>
                <Td className="tabular-nums text-ink-soft">{formatDate(m.date)}</Td>
                <td className="h-px border-l border-line p-0 px-3">
                  <StateCell state={state} />
                </td>
                <Td className="text-ink-soft">{m.milestone?.name ?? "—"}</Td>
                <Td align="right">{m._count.requests > 0 ? m._count.requests : "—"}</Td>
              </ClickableRow>
            );
          })}
        </tbody>
      </ResizableTable>
    </div>
  );
}
