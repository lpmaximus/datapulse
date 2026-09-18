/** Cookie do `state` do OAuth. Fica fora do route handler porque arquivos de
 *  rota do Next só podem exportar handlers e config reconhecidos. */
export const ACC_STATE_COOKIE = "dp_acc_state";

/** Organização de quem iniciou a autorização — lida de volta no callback,
 *  que é rota pública (ver middleware) e não tem sessão confiável do Next
 *  edge para descobrir isso de outro jeito. Gravado só depois de confirmar
 *  ADMIN em /authorize; o callback nunca aceita organizationId do cliente. */
export const ACC_STATE_ORG_COOKIE = "dp_acc_state_org";
