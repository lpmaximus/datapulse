# DataPulse — Arquitetura do sistema

Estado do código em 19/09/2026 (commit `d9f3b49`). Este documento descreve o que existe hoje, o fluxo de informação que queremos (Projeto → Marco → Tarefa → Registros) e a mudança necessária para que o Documento seja, de fato, uma espécie de Tarefa.

---

## 1. Fluxo de informação (modelo conceitual)

```
[ Organização ]                      ← tenant: isola tudo abaixo
   │
   └─▶ [ Projeto ]
          │
          ├─▶ Stakeholders   (interessados, responsáveis, aprovadores)
          │
          └─▶ Marcos ─────────▶ Tarefas ─────────▶ Registros / Entregáveis
              (controle           (unidade           (o que prova o trabalho
               temporal)           operacional)       e o que o trava)
```

Leitura do fluxo:

- **Projeto** é o contêiner. Só projeto ATIVO aceita escrita; PAUSADO/ENCERRADO vira histórico somente leitura.
- **Marco** é ponto de controle sem duração. Agrupa tarefas e não é editável à mão quando tem filhas: status, avanço e prazo vêm do rollup.
- **Tarefa** é a unidade operacional: dono, prazo, status, prioridade, avanço.
- **Registros/Entregáveis** são tudo o que se anexa a uma tarefa: revisões e trâmites de documento, impedimentos, solicitações, histórico de prazo, sinais de risco.
- **Documento é uma espécie de Tarefa**: uma tarefa cujo entregável tem ciclo de revisão/análise (emitir → analisar → comentar/aprovar → nova revisão).

---

## 2. Como está implementado hoje

### 2.1 Camadas técnicas

| Camada | Tecnologia | Onde |
|---|---|---|
| Interface | Next.js 15 (App Router), React 19, Tailwind 4, Recharts | `app/`, `components/` |
| Escrita | Server Actions (uma por domínio) | `app/actions/*.ts` |
| Regras de negócio | Módulos **puros** (sem Prisma/Next), testados com `tsx --test` | `lib/tasks.ts`, `lib/documents.ts`, `lib/requests.ts`, `lib/dri.ts`, `lib/parse-*.ts` |
| Serviços de servidor | Acesso a dados + orquestração | `lib/server/` (`dri-service`, `project-guard`), `lib/acc/` |
| Persistência | Prisma 6 + PostgreSQL (Neon) | `prisma/schema.prisma` |
| Sessão | Cookie `dp_session` host-only; banco guarda só o SHA-256 do token | `lib/session.ts`, `middleware.ts` |
| Agendamento | Vercel Cron: `/api/cron/acc-sync` 05:00 UTC, `/api/cron/dri` 06:00 UTC | `vercel.json` |
| Hospedagem | Vercel (`datapulse.l2techs.com`), deploy automático no push para `main` | — |

Padrão que se repete: **regra pura em `lib/` → Server Action valida sessão, papel, organização e projeto gravável → Prisma grava**. A UI nunca é a única barreira.

### 2.2 Segurança e isolamento (transversal)

1. **Multi-tenant real.** `organizationId` em 10 entidades raiz (User, Client, Sector, Discipline, Empresa, JobFunction, AnalysisCode, RoleProfile, Project, AccConnection). O resto herda pela cadeia de FKs até o `Project`; filtros relacionais (`where: { project: { organizationId } }`).
2. **Nunca `update({ where: { id } })`**: sempre `updateMany({ where: { id, organizationId } })` ou `findFirst` de confirmação. Todo id vindo de formulário é validado contra a organização.
3. **Papéis** (`UserRole`: ADMIN, MANAGER, SPECIALIST, EXECUTIVE) fixos no código; `RoleProfile` só troca rótulo/descrição.
4. **Guarda de escrita** (`lib/server/project-guard.ts`): toda ação que grava em projeto checa `isProjectWritable`.
5. **Middleware** só barra quem não tem cookie (edge, sem Prisma); a validação real é `getCurrentUser()` nas páginas e actions. Route Handlers usam `getCurrentUser()` + `NextResponse` (não `redirect()`).
6. **Camada 2 pseudonimizada**: `HumanSignal.respondentHash` (SHA-256 com `RESPONDENT_SALT`). `SignalRequest` é nominal, mas não referencia o sinal produzido.

### 2.3 Mapa do domínio hoje

```
Organization
 ├─ cadastros: Client, Sector, Discipline, Empresa, JobFunction, AnalysisCode, RoleProfile
 ├─ User ── Session
 ├─ AccConnection (tokens cifrados AES-256-GCM)
 └─ Project ───────────────────────────────────────────────────────────────┐
     ├─ ProjectMember (userId, roleInProject)   ← stakeholders (parcial)    │
     ├─ manager (User), client, sector, designFirm (Empresa)                │
     │                                                                      │
     ├─ Milestone  (kind TASK | MILESTONE, parentId 2 níveis)               │
     │    ├─ Impediment           (bloqueio ativo: dono, "aguardando")      │
     │    ├─ Request ◀─▶ RequestDocument ◀─▶ Document   (N:N)               │
     │    ├─ DeadlineChange       (log append-only de reprogramação)        │
     │    ├─ SystemicSignal       (Camada 1: CSV/XLSX/ACC)                  │
     │    ├─ HumanSignal          (Camada 2: avaliação anônima)             │
     │    ├─ SignalRequest        (convocação nominal)                      │
     │    └─ DRIScore             (snapshot diário)                         │
     │                                                                      │
     ├─ Document   ◀── ligado SÓ ao Project (não tem milestoneId)  ◀────────┘
     │    └─ DocumentRevision (R00, A, B…; status, especialista, prazo)
     │         └─ DocumentTransition (log append-only do trâmite)
     ├─ Request    (pode ter milestoneId opcional)
     └─ DRIScore   (agregado do projeto)
```

Convenções que já existem e valem como padrão:

- **Log append-only** como fonte da verdade, com campo de status como projeção: `DocumentTransition` (documento) e `DeadlineChange` (prazo).
- **`Milestone` é o nome da tabela; "Tarefa" é o nome da interface.** Renomear a tabela foi descartado: DRI, sinais e convocações apontam para ela.
- **Rollup**: `rollupMilestone` recalcula o Marco quando uma filha muda (`recomputeRollup` em `app/actions/tasks.ts`).

### 2.4 Camadas de sinal e o DRI

- **Camada 1 (sistêmica)**: prazo previsto × real, atraso em dias, custo, issues abertas, replanejamentos. Fonte: planilha (CSV/XLSX) ou ACC (Data Connector: custo e issues).
- **Camada 2 (humana)**: probabilidade de falha, confiança no plano, gargalo percebido, decisão travada.
- **DRI** (`lib/dri.ts`, fórmula `mvp-1`): score 0–100 de *onde o projeto trava* (princípio TOC). O score do projeto é dominado pelo pior marco, não pela média. Recalculado diariamente por cron e gravado em `DRIScore`.
- Importante: o DRI lê `Milestone`. **Documento parado em revisão não entra no DRI hoje**, porque o Documento não é uma Milestone.

### 2.5 Integração ACC

A Data Connector API só aceita token 3-legged (refresh token de 15 dias, uso único, rotacionado pelo cron). Ela **não expõe lista documental nem cronograma**: traz admin, issues, RFIs, submittals, cost, locations e activities. Por isso a entrada de documentos é digitação ou carga da planilha CONTROLE MASTER, nunca importação do ACC. Credenciais `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `ACC_TOKEN_KEY` ainda não configuradas: integração inerte.

---

## 3. A lacuna: Documento não é Tarefa (ainda)

Pelo esquema atual, `Document` pertence ao **Projeto**, e o vínculo com uma Tarefa só existe de forma indireta, via `Request ↔ RequestDocument`. Consequências:

| O que uma Tarefa tem | O Documento hoje |
|---|---|
| Fica sob um Marco e entra no rollup de avanço/prazo | Não |
| Aparece no Gantt e no Painel | Não |
| Entra em `/my-work` do responsável | Só como revisão a analisar |
| Alimenta o DRI (atraso, sinais) | Não |
| Tem histórico de reprogramação (`DeadlineChange`) | Não (só `dueAt` da revisão) |
| Aceita Impedimento, Solicitação, Sinal Humano | Só Solicitação, indireta |
| Tem prioridade, criticidade e impacto econômico | Não |

Ou seja: o fluxo Projeto → Marco → Tarefa funciona para trabalho "genérico" e o Documento vive num trilho paralelo.

---

## 4. Proposta: Documento como especialização de Tarefa

### 4.1 Princípio

**A Tarefa é a entidade-base; o Documento é a extensão.** Todo Documento tem exatamente uma Tarefa. A Tarefa carrega o que é comum (Marco pai, dono, prazo, status, prioridade, DRI, impedimentos, solicitações). O Documento carrega o que é específico (número, disciplina, empresa emissora, revisões, trâmite).

```
Marco ──▶ Tarefa (Milestone, type "Documento") ──1:1──▶ Document
                                                          └─ DocumentRevision ─ DocumentTransition
```

### 4.2 Mudanças de modelo

1. `Document.milestoneId String @unique` (FK para `Milestone`, `onDelete: Cascade`). Relação 1:1.
2. Criar a Milestone junto com o Documento (`createDocument`, e na carga do CONTROLE MASTER), com `kind = TASK`, `type = "Documento"`, `parentId` opcional apontando para o Marco escolhido.
3. Migração de dados: para cada Document existente, criar a Milestone correspondente e preencher `milestoneId` (script `backfill-document-tasks.ts`, mesmo padrão do `backfill-tasks.ts`).
4. Adicionar `TaskKind.DOCUMENT`? **Recomendo não.** `kind` continua `TASK | MILESTONE`; "é documento" = ter `Document` 1:1 (ou `type = "Documento"` para filtro rápido). Evita tocar em `validateParentLink`, rollup e DRI.

### 4.3 Direção única de sincronização

Como já se faz com `Document.status` (projeção do último trânsito), o estado da Tarefa-documento é **projeção da revisão corrente**. Nunca o contrário; a Tarefa-documento não é editável à mão nesses campos.

| Revisão corrente | Status da Tarefa |
|---|---|
| DRAFT | Em andamento (emissor preparando) |
| IN_REVIEW | Em revisão |
| COMMENTED / REJECTED | Em andamento (volta ao emissor; abre nova revisão) |
| APPROVED | Concluída |
| CANCELLED / SUPERSEDED (sem sucessora) | Concluída ou tratar como exceção (ver perguntas abertas) |

Prazo da Tarefa = `dueAt` da revisão corrente, com cada mudança gravada em `DeadlineChange`. Responsável = especialista da revisão em análise, ou responsável emissor quando a bola está com o projetista. Uma função pura nova em `lib/documents.ts` (`taskProjectionFromRevision`) faz essa tradução e é chamada em toda ação de documento que muda revisão, seguida de `recomputeRollup` no Marco pai.

### 4.4 O que passa a funcionar sem código novo

Rollup no Marco, Gantt, Painel, `/my-work`, `DeadlineChange`, Impedimento, Solicitação direta na tarefa, Sinal Humano e convocação, e **DRI de documento**: número de ciclos e dias parado em análise passam a alimentar o Sinal Sistêmico (Camada 1), que é exatamente o valor decisório descrito no schema ("documento crítico parado é gargalo que antecede o atraso do marco").

### 4.5 Registros/Entregáveis: quem é quem

| Nível do fluxo | Entidade no sistema |
|---|---|
| Registro de execução | `DocumentRevision` + `DocumentTransition` |
| Registro de bloqueio | `Impediment` |
| Registro de pendência externa | `Request` (+ `RequestDocument`) |
| Registro de prazo | `DeadlineChange` |
| Registro de risco | `SystemicSignal`, `HumanSignal`, `DRIScore` |
| Entregável | O arquivo, que **não** mora no DataPulse: `DocumentRevision.externalUrl` aponta para SharePoint/Drive/ACC Docs |

### 4.6 Stakeholders

Hoje: `Project.manager`, `ProjectMember(roleInProject texto livre)`, `Client`, `Empresa`. Falta o conceito explícito de **aprovador** por projeto/disciplina (quem decide a análise) e de **interessado sem acesso** (contato externo que não é `User`). Sugestão: transformar `roleInProject` em enum (`RESPONSIBLE | APPROVER | INTERESTED`) e permitir Stakeholder externo (nome + e-mail, sem login).

---

## 5. Riscos e pendências técnicas

1. **Cron aberto sem `CRON_SECRET`.** As rotas fazem `if (secret && auth !== ...)`: se a variável sumir, a rota fica pública. Trocar para *fail-closed* (negar quando não houver secret).
2. **Produção e desenvolvimento compartilham o banco Neon.** Preview deployment escreve em produção. Falta Neon branching.
3. **Migração 1:1 de Documentos** precisa de rodada de teste em banco separado antes de aplicar (item 2 acima é o motivo).
4. **Volume no rollup**: um Marco com centenas de tarefas-documento recalcula a cada mudança. Aceitável no MVP; medir antes de otimizar.
5. **ACC inerte** até configurar credenciais APS.
6. **Ambiente de validação**: a ponte Linux não baixa engines do Prisma nem roda o `node_modules` do Windows. `prisma generate/migrate` e `npm test` rodam no terminal Windows; a verificação completa roda numa cópia na nuvem com engines dummy.

---

## 6. Decisões em aberto

1. Ao criar um Documento, o **Marco pai é obrigatório**, ou pode ficar solto sob o projeto (Tarefa sem pai)?
2. **Cancelado/Substituído**: o status da Tarefa vira Concluída, ou precisamos de um status "Cancelada" em `TaskStatus`?
3. Um documento com várias revisões em paralelo (arquivos .dwg, .pdf, .ifc do mesmo código) deve ser **uma Tarefa por arquivo** (como já são Documentos distintos hoje) ou uma Tarefa por código? Hoje o modelo já trata como documentos diferentes; manter uma Tarefa por Documento é o caminho coerente.
4. Stakeholder externo sem login entra agora ou depois?
