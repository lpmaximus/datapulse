# DataPulse — execução autônoma de 23/10/2026

Branch de trabalho: `claude/auto-2026-10-23` (9 commits sobre o baseline). Nada foi enviado ao GitHub, nada foi aplicado ao banco, nada tocou `main`.

Verificação feita na nuvem: `tsc --noEmit` limpo, 266 testes passando, `next build` ok (cópia de teste, sem fonte do Google). A migração SQL foi validada em um PostgreSQL 16 local, depois das 19 migrações anteriores.

## Como aplicar (você)

1. No repo `D:\dev\datapulse`: `git checkout main && git pull && git checkout -b claude/auto-2026-10-23`
2. `git am auto-2026-10-23/patches/*.patch` (alternativa: `git apply --binary auto-2026-10-23.diff`)
3. **Crie um branch no Neon** e aponte `DATABASE_URL`/`DIRECT_URL` do `.env` local para ele. Produção e dev compartilham o mesmo banco — não rode nada abaixo contra ele.
4. `npx prisma migrate dev` (a migração é `20261023120000_documento_tarefa_demanda_orcamento`, só aditiva; o Prisma pode apontar pequena divergência, pois não pude rodar o `migrate diff`).
5. Scripts, sempre em simulação primeiro:
   - `npx tsx scripts/backfill-due-dates.ts --organizacao "L2tech"` → conferir → `--aplicar`
   - `npx tsx scripts/migrate-documents-to-tasks.ts --organizacao "L2tech"` → conferir → `--aplicar`
6. Teste no navegador (checklist):
   - Cadastrar documento com nº do projetista, formato A1–A4 e folhas.
   - Abrir um projeto → botão "Explicação do DRI".
   - Conferir o DRI recalculado (fórmula mvp-3: ritmo + exposição econômica).
   - Definir o valor do A1 no cliente (campo `Client.a1Value`) para ver exposição em R$.
7. Só depois de testar: PR e merge em `main` (o push em `main` faz deploy em produção).

## Caixa de aprovações (só você pode)

- Neon branch, rodar migrações e scripts, testar no navegador, revisar/mergear o PR.
- Credenciais externas: APS/ACC, provedor de e-mail, Azure AD/Teams, plano pago da Vercel.
- Decisões de licença: AGPL/Zep (MiroFish).
- `app/api/cron/blob-orphans` não está no `vercel.json`; rode com `?apply=1` só depois de conferir a simulação.

## Entregue

- Cron fail-closed; plano e script de prazo para revisões legadas; varredura de blobs órfãos (simulação por padrão).
- Módulos puros testados: A1 equivalente, devolução da revisão, documento como tarefa, avanço do cliente, LD (parse/diff), orçamento (ciclo, congelamento, complementar).
- Schema aditivo + migração escrita (Demand, Budget, BudgetItem, RevisionComment, campos de documento/cliente/organização).
- Serviço do documento-tarefa e migração do legado; ações de documento com tamanho e avanço declarado.
- DRI mvp-3 e exposição econômica automática.
- E-mail plugável (só log por padrão), caixa de entrada com vencimento, visão do cliente.
- Decision OS fase 1 (regras + narrativa por modelo + validador, sem IA) e página `/projects/[id]/explicacao`.

## Não feito

- Restrição do detalhe de projeto para especialista (1.4) e OrganizationMember nas listas de usuários (1.5).
- Troca da UI de PackageSelect para o fluxo "tarefa própria" (seletor de Marco, formulário de revisão).
- Server actions e páginas de Demanda, importação de LD e Orçamento.
- Papel avaliador contratante e sua visibilidade; página da área do cliente.
- Provedor real de e-mail, Teams, ACC, Neon branching, MiroFish.
- Bloco 7 (relatórios PDF: lista mestra, aging, tendência DRI).

## Limites conhecidos

Nenhum código passou por banco real via Prisma Client; a UI não foi vista no navegador; engines do Prisma estavam bloqueadas na nuvem (usei stubs).
