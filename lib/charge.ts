/**
 * Cobrança de Terceirizado (Projetista).
 *
 * Terceirizado não acessa o sistema, então a cobrança sai do cliente de e-mail
 * de quem cobra: um `mailto:` pré-preenchido com o que está sendo cobrado.
 * Sem e-mail transacional no MVP — e assim a mensagem fica na caixa de saída
 * de quem cobrou, com o histórico da conversa onde a equipe já trabalha.
 *
 * Módulo puro (sem Prisma) para ser testável.
 */

export interface ChargeTask {
  taskName: string;
  projectName: string;
  /** Prazo vigente (reprogramado, se houver). */
  due: Date | null;
  statusLabel: string;
  /** 0–100; null para marco (sem avanço percentual). */
  progress: number | null;
  late: boolean;
}

export interface ChargeInput {
  to: string;
  assigneeName: string;
  senderName: string;
  task: ChargeTask;
  now?: Date;
}

function fmt(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function buildChargeEmail({ assigneeName, senderName, task }: ChargeInput): {
  subject: string;
  body: string;
} {
  const subject = `${task.late ? "[ATRASADA] " : ""}${task.projectName} — ${task.taskName}`;

  const lines = [
    `Olá, ${firstName(assigneeName)},`,
    "",
    task.late
      ? "A entrega abaixo está com o prazo vencido. Pode nos atualizar sobre a situação e a nova data de conclusão?"
      : "Seguimos acompanhando a entrega abaixo. Pode nos confirmar a situação e se o prazo está mantido?",
    "",
    `Projeto: ${task.projectName}`,
    `Tarefa: ${task.taskName}`,
    `Prazo: ${task.due ? fmt(task.due) : "a definir"}${task.late ? " (vencido)" : ""}`,
    `Situação registrada: ${task.statusLabel}${task.progress != null ? ` · ${task.progress}% concluído` : ""}`,
    "",
    "Obrigado,",
    senderName,
  ];

  return { subject, body: lines.join("\n") };
}

/** `mailto:` pronto para `href`. Quebras de linha como %0D%0A (RFC 6068). */
export function buildChargeMailto(input: ChargeInput): string {
  const { subject, body } = buildChargeEmail(input);
  const enc = (v: string) => encodeURIComponent(v).replace(/%0A/g, "%0D%0A");
  return `mailto:${encodeURIComponent(input.to).replace(/%40/g, "@")}?subject=${enc(subject)}&body=${enc(body)}`;
}
