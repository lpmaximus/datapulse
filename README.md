# DataPulse — MVP

Implementação do plano **DataPulse-MVP-Simples-Vercel**: monólito modular em
Next.js na Vercel, Postgres serverless (Neon), sem Kafka, sem microsserviços.

O produto responde a uma pergunta só: **onde este projeto vai travar?**
Não é um sistema de controle — é um leading indicator da restrição dominante (TOC).

---

## Como subir (≈15 min)

```bash
npm install                  # roda `prisma generate` no postinstall
cp .env.example .env         # preencha DATABASE_URL / DIRECT_URL
npx prisma migrate dev --name init
npm run db:seed              # opcional: projeto de demonstração
npm run dev
```

> **Importante:** `npx prisma generate` precisa baixar os engines do Prisma na
> primeira execução. O `npm install` já faz isso via `postinstall`.

### Deploy na Vercel

1. Push do repositório e import na Vercel.
2. **Storage → Neon** — a integração injeta `DATABASE_URL` e `DIRECT_URL` sozinha.
3. Adicione `CRON_SECRET` (valor aleatório) e `RESPONDENT_SALT` nas env vars.
4. O `vercel.json` já registra o cron diário de recálculo do DRI (06:00 UTC).
5. Use **Neon branching** para separar `production` de `preview` — sem isso os
   dados de teste contaminam os do piloto.

---

## O que está implementado

| Fase do plano | Estado |
|---|---|
| Semana 1 — Fundação (Next + Neon + Prisma) | ✅ |
| Semana 2 — Camada 2 (sinais humanos) | ✅ |
| Semana 3 — Camada 1 (upload CSV/XLSX) | ✅ |
| Semana 3.1 — Conector ACC | ⛔ não iniciado (ver abaixo) |
| Semana 4 — DRI + Vercel Cron | ✅ |
| Semana 5 — Dashboard com tendência | ✅ |
| Semana 6 — Piloto real | 🫵 depende de você |

### Telas

Layout no estilo de um gerenciador de anúncios (tabela densa, tema claro,
barra superior com abas) — mais adequado do que cards para operar dezenas de
projetos e centenas de marcos por dia.

- `/` — **Painel**: KPIs da carteira (DRI médio, marcos em zona crítica, marcos
  sem sinais) e lista de atenção com os marcos de maior restrição.
- `/projects` — **Projetos**: tabela com busca, toggle ativar/pausar por linha,
  DRI, restrição dominante e contagem de sinais por projeto. Projetos sem
  marco ou sem DRI calculado ficam agrupados em "rascunhos", colapsados.
- `/projects/new` — criação de projeto.
- `/projects/[id]` — DRI do projeto, restrição dominante, ranking de marcos, tendência.
- `/projects/[id]/import` — upload da planilha (Camada 1).
- `/projects/[id]/milestones/[milestoneId]` — formulário de sinal humano (Camada 2) + histórico.
- `/milestones` — **Marcos**: todos os marcos de todos os projetos, uma linha
  por marco, ordenados por DRI.
- `/signals` — **Sinais**: abas Humanos/Sistêmicos, tabela dos 100 registros
  mais recentes de cada camada.
- `/reports` — **Relatórios**: variação do DRI de cada projeto na última
  semana (o que piorou, não só o estado atual).
- `GET /api/cron/dri` — recálculo diário, protegido por `CRON_SECRET`.

O toggle de ativar/pausar em `/projects` e a busca em todas as tabelas são
funcionais (Server Actions e `?q=` na URL). "Colunas customizadas" na barra de
ferramentas é decorativo por ora — visual da referência, sem lógica por trás.

---

## O motor do DRI

`lib/dri.ts` é **puro e sem dependências** — não importa Prisma nem Next. Isso é
proposital: a fórmula é o ativo do produto e precisa ser testável e recalibrável
isoladamente. `lib/server/dri-service.ts` faz a ponte com o banco.

### Fórmula (versão `mvp-1`)

**Componente humano** (Camada 2, janela de 45 dias):

| Entrada | Peso |
|---|---|
| Probabilidade de falha percebida | 0,40 |
| Baixa confiança no plano | 0,25 |
| Decisões travadas | 0,15 |
| Divergência entre respondentes | 0,10 |
| Silêncio (dias sem avaliação) | 0,10 |

**Componente sistêmico** (Camada 1, sinal mais recente):

| Entrada | Peso | Satura em |
|---|---|---|
| Atraso de cronograma | 0,45 | 30 dias |
| Estouro de custo | 0,30 | +20% |
| Replanejamentos | 0,15 | 3 |
| Issues abertas | 0,10 | 20 |

**Combinação:** 50/50 entre humano e sistêmico, com **renormalização quando um
lado está ausente** — um marco com dado parcial não é penalizado por falta de
dado. Depois aplica-se o fator de criticidade (0,85 a 1,30) e o resultado é
travado em 0–100.

**DRI do projeto:** `0,7 × pior marco + 0,3 × média ponderada por impacto econômico`.
Deliberadamente **não** é a média. Sob TOC o sistema é limitado pela restrição
dominante; diluir o pior marco numa média esconderia exatamente o que o produto
existe para revelar.

**Confiança (0–1):** publicada junto com o score. Confiança baixa significa
*dado insuficiente*, não *ausência de risco* — e a UI diz isso explicitamente.

### Faixas

| DRI | Faixa |
|---|---|
| 0–34 | Estável |
| 35–54 | Atenção |
| 55–74 | Restrição provável |
| 75–100 | Restrição dominante |

### Recalibração

Os pesos e janelas estão todos em `DRI_CONFIG` (topo de `lib/dri.ts`). Após a
Semana 6, ajuste ali e rode `npm test` — os testes checam propriedades
(monotonicidade, limites, dominância) e não valores fixos, então continuam
válidos depois da recalibração.

---

## Ingestão da Camada 1

Não há template obrigatório. `lib/parse-systemic.ts` reconhece cabeçalhos em
português e inglês, com ou sem acento, e aceita:

- Datas: `dd/mm/aaaa`, `aaaa-mm-dd`, serial do Excel.
- Números: `R$ 1.234,56`, `1,234.56`, `1234.56`.
- CSV com `,` `;` `\t` ou `|` (detecção automática).

Marcos ainda inexistentes são criados na importação — o cliente não precisa
cadastrar nada antes de subir a primeira planilha. Exemplo em
`examples/cronograma-exemplo.csv`.

---

## Testes

```bash
npm test    # 26 testes: motor do DRI + parser de planilha
```

Cobrem limites (0–100), marcos concluídos, renormalização de pesos, janela de
sinais, divergência, monotonicidade do atraso, dominância no score do projeto,
e o parsing de datas/números/cabeçalhos em pt-BR e en-US.

---

## Decisões que fogem do plano (e por quê)

**Auth.** O plano previa Clerk na Semana 1. Está implementado um adaptador em
`lib/auth.ts` com identidade anônima por cookie, já no formato pseudonimizado
final. Trocar por Clerk é reescrever uma função — nada mais no app conhece a
identidade real do respondente. Motivo: não travar a coleta da Camada 2 atrás de
um cadastro de chaves antes do piloto existir.

**`types/models.ts`.** Os resultados das queries são tipados explicitamente com
tipos mais largos que os do client gerado (`unknown` onde o Prisma devolve
`Decimal`/`Json`). Ao adicionar campo a uma query, adicione ali também.

---

## Pendências conhecidas

- **Conector ACC (seção 3.1).** Não implementado. Requer app registrado no
  Autodesk Platform Services, OAuth 2-legged e a Data Connector API. O schema já
  reserva `SignalSource.ACC` e `Project.externalRef`; o cron já existe e é o
  lugar natural para pendurar a extração diária.
- **Google Sheets API.** Não implementado — o upload cobre o mesmo caso de uso.
- **LGPD.** Há pseudonimização do respondente e agregação na exibição. Antes do
  primeiro piloto com **dados reais de cliente externo**, ainda faltam política
  de retenção e um caminho de exclusão a pedido. O plano marca isso como o único
  item de "depois" que vira bloqueador — continua sendo.
- **Multi-tenancy.** Não há isolamento por organização. Vale para 1 piloto;
  não vale para o 2º cliente.

---

## Critério de go/no-go (Semana 6)

O plano define isto — e vale reler antes de escrever mais código:

**Go:** o DRI teria sinalizado a restrição antes do relatório formal; os
respondentes preenchem sem fricção alta; obter dados sistêmicos foi barato o
suficiente para repetir.

**No-go:** o DRI não diverge do que a equipe já sabia informalmente; a coleta
exige convencimento desproporcional; os dados do cliente são bagunçados demais.

A forma mais rápida de testar: rodar com dados **retroativos** de um projeto
encerrado e ver se o DRI subiria antes do estouro aparecer.
