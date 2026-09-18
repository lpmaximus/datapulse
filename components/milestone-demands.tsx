import { assignSignalRequest, dismissSignalRequest } from "@/app/actions/demands";
import { Button, Field, inputClass, Empty } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { MilestoneRequestRow, UserOption } from "@/types/models";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando",
  ANSWERED: "Respondida",
  DISMISSED: "Cancelada",
  EXPIRED: "Expirada",
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "text-orange-700",
  ANSWERED: "text-green-700",
  DISMISSED: "text-ink-faint",
  EXPIRED: "text-red-700",
};

/**
 * Convocações da tarefa.
 *
 * Mostra quem foi chamado e quem já respondeu — nunca qual resposta é de quem.
 * A separação é o que permite cobrar adesão sem constranger o respondente.
 */
export function MilestoneDemands({
  milestoneId,
  requests,
  candidates,
  readOnly = false,
}: {
  milestoneId: string;
  requests: MilestoneRequestRow[];
  candidates: UserOption[];
  /** Projeto pausado/encerrado: mostra o histórico, sem convocar. */
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-5">
      {requests.length === 0 ? (
        <Empty>Ninguém convocado para avaliar esta tarefa.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.assignee.name}</p>
                <p className="text-xs text-ink-faint">
                  {r.assignee.function?.name ?? "sem função"}
                  {r.dueAt ? ` · prazo ${formatDate(r.dueAt)}` : ""}
                  {r.answeredAt ? ` · respondeu em ${formatDate(r.answeredAt)}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${STATUS_TONE[r.status]}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
                {r.status === "PENDING" ? (
                  <form action={dismissSignalRequest}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                      Cancelar
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {readOnly ? null : candidates.length > 0 ? (
        <form
          action={assignSignalRequest}
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        >
          <input type="hidden" name="milestoneId" value={milestoneId} />
          <Field label="Convocar especialista">
            <select name="assigneeId" required className={inputClass}>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.function ? ` — ${u.function.name}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prazo">
            <input type="date" name="dueAt" className={inputClass} />
          </Field>
          <Button type="submit">Convocar</Button>

          <div className="sm:col-span-3">
            <Field label="Por que agora?" hint="Contexto ajuda a resposta a ser útil.">
              <input
                name="note"
                className={inputClass}
                placeholder="Ex.: cliente sinalizou mudança de escopo na semana passada"
              />
            </Field>
          </div>
        </form>
      ) : (
        <p className="text-sm text-ink-faint">
          Nenhum usuário ativo disponível para convocar.
        </p>
      )}

      <p className="text-xs text-ink-faint">
        A convocação é nominal, mas a resposta entra no DRI de forma agregada —
        você vê quem respondeu, não o que cada um respondeu.
      </p>
    </div>
  );
}
