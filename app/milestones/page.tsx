import { redirect } from "next/navigation";

/**
 * A lista global de tarefas saiu do menu: tarefa se acessa pelo projeto, que
 * é quem define se ela está ativa ou somente leitura. A visão entre projetos
 * ficou no Painel (tarefas críticas de projetos ativos). Links antigos caem
 * na lista de projetos.
 */
export default function MilestonesRedirect() {
  redirect("/projects");
}
