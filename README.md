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
npm run db:seed              # cria usuários e projeto de demonstração
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
| Semana 3.1 — Conector ACC | ✅ custo e issues (cronograma é impossível pela API — ver abaixo) |
| Semana 4 — DRI + Vercel Cron | ✅ |
| Semana 5 — Dashboard com tendência | ✅ |
| Semana 6 — Piloto real | 🫵 depende de você |

### Telas

Layout no estilo de um gerenciador de anúncios (tabela densa, tema claro,
barra superior com abas) — mais adequado do que cards para operar dezenas de
projetos e centenas de marcos por dia.

- `/` — **Painel**: só projetos ativos. Filtros por setor, responsável,
  prioridade e busca; KPIs (em andamento, em alerta por DRI, atrasadas,
  concluídas no mês); tarefas críticas; carteira agrupada por setor com
  avanço, etapa atual e cronograma; linha do tempo; carga por pessoa;
  distribuição por status; impedimentos ativos.
- `/projects` — **Projetos**: tabela com busca, toggle ativar/pausar por linha,
  DRI, restrição dominante e contagem de sinais por projeto. Projetos sem
  marco ou sem DRI calculado ficam agrupados em "rascunhos", colapsados.
- `/projects/new` — criação de projeto.
- `/projects/[id]` — DRI do projeto, restrição dominante, ranking de marcos, tendência.
- `/projects/[id]/import` — upload da planilha (Camada 1).
- `/projects/[id]/milestones/[milestoneId]` — formulário de sinal humano (Camada 2) + histórico.
- `/projects/[id]/tasks/[taskId]` — **Tarefa**: status, avanço, responsável,
  datas (base × previsão × real), impedimentos, convocações e sinais.
  Não há lista global de tarefas: tarefa se acessa pelo projeto (ver
  "Projeto pausado" abaixo). `/milestones` redireciona para `/projects`.
- `/signals` — **Sinais**: abas Humanos/Sistêmicos, tabela dos 100 registros
  mais recentes de cada camada.
- `/reports` — **Relatórios**: variação do DRI de cada projeto na última
  semana (o que piorou, não só o estado atual).
- `/my-work` — **Minhas demandas**: área do especialista. Fila de avaliações
  pendentes ordenada por urgência, histórico das próprias respostas, DRI dos
  marcos avaliados e documentos abertos nos projetos em que está alocado.
- `/users` — cadastro de usuários, papéis, ativação e reset de senha (só ADMIN).
- `/documents` — todos os documentos, com destaque para parados e em looping.
  Cadastro manual direto daqui, escolhendo o projeto.
- `/documents/[id]` — revisões do documento e rastreamento consolidado, da
  criação ao encerramento.
- `/projects/[id]/documents` — documentos de um projeto e cadastro manual
  (painel "Novo documento" no topo da lista).
- `/settings/registers` — clientes, setores, disciplinas, empresas,
  funções, papéis de acesso e códigos de análise.
- `/login` e `/account/password` — autenticação e troca de senha.
- `/settings/acc` — conexão com o Autodesk Construction Cloud e vínculo de projetos.
- `GET /api/cron/dri` — recálculo diário, protegido por `CRON_SECRET`.
- `GET /api/cron/acc-sync` — sincronização diária com o ACC (roda 1h antes do DRI).
- `GET /api/acc/authorize` e `/api/acc/callback` — fluxo OAuth do Autodesk.

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

## Pessoas, papéis e acesso

Login próprio, sem dependência externa. Senha com **scrypt** (`node:crypto`,
sem binário nativo para compilar em serverless) e **sessão revogável em banco**
— o cookie carrega o token cru, o banco guarda só o SHA-256. Vazar a tabela de
sessões não permite assumir a sessão de ninguém, e desativar um usuário encerra
os acessos dele na hora, sem esperar o cookie expirar.

| Papel | Pode |
|---|---|
| **ADMIN** | Tudo, inclusive usuários e integrações |
| **MANAGER** | Criar projetos e marcos, cadastrar documentos e cadastros de referência, convocar avaliações |
| **SPECIALIST** | Responder as avaliações em que foi convocado |
| **EXECUTIVE** | Apenas visualizar painéis e relatórios |

Usuário novo recebe **senha provisória exibida uma única vez** (não há e-mail
transacional no MVP) e é obrigado a trocá-la no primeiro acesso.

### Demanda nominal, resposta agregada

O EVT exige "anonimização das contribuições individuais", mas o gestor precisa
saber a quem cobrar. A solução separa as duas coisas:

- `SignalRequest` é **nominal** — quem foi convocado, prazo, e se já respondeu.
- `HumanSignal` guarda apenas um **pseudônimo** derivado do usuário e **não é
  referenciado** pela convocação.

O gestor acompanha adesão sem conseguir ler "quem disse o quê".

**Limite honesto — isto é pseudonimato, não anonimato forte.** Duas brechas
reais: com um único convocado no marco, a correlação é óbvia por inferência; e
quem tiver acesso ao banco *e* ao `RESPONDENT_SALT` consegue recomputar o hash
de qualquer usuário. Anonimato de verdade exigiria abrir mão de saber quem
respondeu — o que quebraria o acompanhamento de adesão. Antes de prometer
anonimato a um respondente externo, isto precisa ser dito a ele.

---

## Cadastros de referência

O que antes era texto livre virou tabela. Sem isso, "Elétrica", "eletrica" e
"ELE" conviveriam como coisas diferentes e quebrariam qualquer agregação.

| Cadastro | Papel |
|---|---|
| **Clientes** | Contratante do projeto, com contato |
| **Setores** | Área organizacional do projeto |
| **Disciplinas** | Sigla + nome (ELE, CIV, MEC…), usada na numeração do documento |
| **Empresas** | Contratada que elabora os projetos (ex-"Projetistas"), com coordenador e contato — também é o vínculo empregador de um `User` (`User.companyId`) |
| **Funções** | Cargo/função organizacional do usuário (Coordenador, Fiscal...) — não é o papel de acesso |
| **Papéis de acesso** | Rótulo/descrição de cada `UserRole` (ADMIN/MANAGER/SPECIALIST/EXECUTIVE) — o papel em si é fixo no código, só o texto exibido é cadastro |
| **Códigos de análise** | Pareceres possíveis: APR, REJ, COM, CLD |

Administrados em `/settings/registers`. Registros já usados são
**desativados, nunca excluídos** — o histórico precisa continuar legível;
ficam fora da lista por padrão (grupo recolhível "N inativo(s)" no fim da
tabela) para não poluir a tela.

### Códigos de análise são dados, não código

`AnalysisCode` tem uma sigla, um nome e um **efeito** (`AnalysisEffect`). O
motor de fluxo lê o efeito, não a sigla — por isso o cliente pode cadastrar
`APR-R` ("aprovado com ressalva") e o fluxo continua funcionando sem alterar
o código-fonte.

| Efeito | O que faz |
|---|---|
| `APPROVES` | Encerra a revisão como aprovada |
| `APPROVES_WITH_COMMENTS` | Aprova, com pendência registrada |
| `COMMENTS` | Devolve ao emissor com comentários |
| `REJECTS` | Reprova e devolve ao emissor |
| `CANCELS` | Encerra sem aprovação |

O conjunto de efeitos é pequeno e estável de propósito: é a única parte que o
código precisa conhecer. Tudo o mais é configuração.

---

## Documentos, revisões e rastreamento

O DataPulse registra **apenas a informação sobre o documento** — número,
disciplina, projetista, responsável, datas e um link opcional. O arquivo
continua no SharePoint / Drive / ACC Docs do cliente, coerente com "o DataPulse
não substitui as ferramentas de execução".

### Revisão = pacote de envio da projetista ao cliente

Esta é a definição que rege todo o modelo. **Todo trâmite é uma revisão nova.**
A projetista envia um pacote; o cliente analisa e dá um parecer; se não
aprovar, a projetista envia o pacote seguinte — que é outra revisão.

```
Document (PE-ELE-001)
├── R00  enviada → COM (comentada)   ← 18 dias em análise
├── R01  enviada → REJ (reprovada)   ← 15 dias em análise
└── R02  enviada → em análise        ← parada há 11 dias
```

**A sequência de revisões É o histórico da análise.** Contar revisões é contar
quantas idas e vindas o documento exigiu — não há métrica separada a inventar.

Consequência direta no fluxo: **uma revisão analisada é terminal**. Nunca é
reenviada, nem quando reprovada. Só existe uma revisão em curso por vez, e a
próxima só pode ser emitida depois que a atual teve desfecho.

```
DRAFT ──enviar──▶ IN_REVIEW ──┬── APR ──▶ APPROVED    (encerra o documento)
 (emitida)         (análise)   ├── COM ──▶ COMMENTED   ─┐ exigem
                               ├── REJ ──▶ REJECTED    ─┘ nova revisão
                               └── CLD ──▶ CANCELLED
```

Cada parecer tem seu **próprio status terminal** — comentada e reprovada não
são colapsadas no mesmo estado, porque são desfechos diferentes e o gestor
precisa distinguir "faltou detalhe" de "está errado".

Uma revisão só vira `SUPERSEDED` se estava **aprovada** e foi sucedida por
outra. Comentada ou reprovada preserva seu desfecho: sobrescrevê-lo apagaria
justamente o motivo pelo qual houve a revisão seguinte.

### Como o documento entra

**Digitado, sempre.** O ACC não entrega lista documental pela Data Connector
API (ver a seção da integração), então a entrada é o cadastro manual — não um
caminho de exceção. Por isso o painel "Novo documento" fica no topo da lista,
em `/documents` e em `/projects/[id]/documents`, e não no rodapé da página:
após salvar ele continua aberto, limpo e com o foco no número, porque quem
cadastra documento cadastra vários seguidos.

Número repetido no mesmo projeto é recusado: dois registros para o mesmo
documento partiriam o histórico em dois, que é justamente o que o
rastreamento existe para evitar.

### Carga do controle em Excel

Quem já controla documentos numa planilha não precisa redigitar tudo:

```bash
npm run import:master -- "examples/CONTROLE MASTER MRS.xlsx" --dry   # confere
npm run import:master -- "examples/CONTROLE MASTER MRS.xlsx"         # carrega
```

Lê as duas abas que interessam — `ANEXO` (cadastros: projetos, projetistas,
disciplinas, códigos de análise, equipe) e `BANCO DADOS` (um lançamento por
análise) — e grava projetos, documentos, revisões e histórico.

Duas leituras da planilha decidem o resultado, e as duas foram conferidas
contra os dados reais:

- **Cada linha é um ciclo de análise, não um documento.** A mesma revisão
  reaparece quando voltou para análise; agrupar por documento + revisão e
  ordenar por data de envio reconstrói o trâmite. Tratar linha como registro
  novo inventaria documentos que não existem.
- **Arquivos diferentes do mesmo código são documentos diferentes.** O mesmo
  código costuma existir em `.dwg`, `.pdf` e `.ifc`, cada um com seu próprio
  ciclo. Fundi-los criaria retrabalho que não houve.

Sem parecer preenchido, a revisão entra como *em análise* — que é o que a
coluna ATIV já diz. A interpretação mora em `lib/parse-master.ts`, módulo puro
com testes em `test/parse-master.test.mjs`; `scripts/import-master.ts` só grava.
Rodar duas vezes não duplica: cadastros, pessoas e projetos são reaproveitados,
e os documentos são recarregados do zero (`--manter` preserva os existentes).

O tipo do documento é a sigla do próprio código (`DE`, `MC`, `MP`, `PQ`…) — o
importador não inventa o significado dela.

### Rastreamento

`DocumentTransition` é um log **append-only** por revisão: nada é editado ou
apagado. O `status` da revisão é só a projeção do último evento — a verdade é
a tabela de transições. A tela do documento consolida os eventos de **todas**
as revisões numa linha do tempo única: é o rastreamento da criação ao
encerramento.

Cada evento congela o `daysInPreviousStage` no momento da gravação. Disso saem
três métricas com valor decisório direto: **revisões**, **devolvidas** (quantas
voltaram para a projetista) e **dias em análise**. Documento em looping é um
gargalo que **antecede** o atraso formal do marco — é o tipo de sinal fraco que
o produto existe para revelar.

> Ainda **não ligado ao DRI**. As métricas estão calculadas e visíveis, mas não
> alimentam o score. Ligar isso é uma decisão de calibração que faz mais
> sentido depois do piloto, com dados reais para dizer qual peso é justo.

---


## Integração com o Autodesk Construction Cloud

> **Três correções ao plano original (seção 3.1).** O plano descreve a
> integração de forma que não corresponde à API real. Verificado na
> documentação e no sample oficial da Autodesk antes de implementar.

**1. Não existe autenticação 2-legged.** O plano previa "OAuth 2.0 2-legged
(client credentials / service account), não exige login do usuário final". A
Data Connector API aceita **somente token 3-legged**, e quem autoriza precisa
ser **Account Admin / Executive** no ACC. Não há conta de serviço.

**2. A autorização tem prazo de validade.** Access token dura 60 minutos;
refresh token dura **15 dias e é de uso único** (cada renovação devolve um
novo). O cron diário mantém a conexão viva sozinho, mas se ficar 15 dias
parado, um humano precisa reautorizar pelo navegador. A tela de configuração
avisa a partir de 4 dias restantes.

**3. O ACC não expõe cronograma.** O plano dizia que a extração traria
"Schedule/Daily Logs". Os service groups reais são admin, issues, RFIs,
submittals, cost, locations e activities — e "activities" ali é log de
auditoria (quem alterou o quê no Docs/Issues), não tarefas com data planejada
e real. O tool de Schedule do ACC Build não tem API pública.

Isso importa porque **o desvio de cronograma pesa 45% no componente sistêmico
do DRI**. A decisão foi o modelo híbrido: o ACC alimenta custo e issues, e o
prazo continua vindo do upload de planilha.

### Como está implementado

| Arquivo | Papel |
|---|---|
| `lib/acc/auth.ts` | OAuth 3-legged: authorize URL, troca de code, refresh |
| `lib/acc/crypto.ts` | Cifragem AES-256-GCM dos tokens em repouso |
| `lib/acc/connection.ts` | Token válido sob demanda + persistência do token rotacionado |
| `lib/acc/data-connector.ts` | Cliente da Data Connector API (requests, jobs, download) |
| `lib/acc/parse-acc.ts` | Mapeia CSVs do ACC para `SystemicSignal` (módulo puro) |
| `lib/acc/sync.ts` | Orquestra o ciclo completo e recalcula o DRI |

Decisões que valem registro:

- **Tokens cifrados em repouso.** O refresh token dá acesso de leitura ao hub
  inteiro do cliente por 15 dias. Em texto puro, um dump de banco viraria
  acesso ao ACC do cliente — inadequado para o ambiente regulado que o produto
  se propõe a atender. Chave em `ACC_TOKEN_KEY`.
- **Match de custo sem fuzzy.** Itens de orçamento só casam com marcos por
  nome idêntico após normalização. Um match aproximado erraria em silêncio e
  contaminaria o DRI — melhor deixar o dado de fora do que atribuí-lo ao marco
  errado.
- **Issues não são replicadas por marco.** A contagem é do projeto; espalhá-la
  por todos os marcos inflaria o DRI artificialmente. Só é anexada onde houve
  custo casado.
- **`state` anti-CSRF** no fluxo OAuth, comparado com `timingSafeEqual`.

### Como conectar

1. Crie um app em [aps.autodesk.com/myapps/create](https://aps.autodesk.com/myapps/create),
   com callback `https://SEU-DOMINIO/api/acc/callback`.
2. Peça a um Account Admin do ACC para **provisionar o Client ID** na conta
   (sem isso, nenhum hub aparece).
3. Configure `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_CALLBACK_URL`,
   `APP_URL` e `ACC_TOKEN_KEY` (`openssl rand -base64 32`).
4. Acesse `/settings/acc` → **Conectar ao Autodesk** → autorize.
5. Vincule cada projeto do DataPulse ao projeto correspondente no ACC.

O primeiro ciclo apenas cria o request de extração no ACC; os dados chegam no
ciclo seguinte, porque o job leva alguns minutos para rodar do lado da Autodesk.

**Ainda não testado contra uma conta ACC real** — a lógica tem testes
unitários, mas os formatos exatos de CSV (`cost_budgets.csv`,
`issues_issues.csv`) e os nomes de coluna podem variar por versão do ACC. O
parser casa colunas por sinônimo justamente para absorver essa variação, mas o
primeiro sync real provavelmente vai exigir ajuste nos sinônimos.

---

## Testes

```bash
npm test    # 94 testes: DRI, tarefas/hierarquia/histórico de prazo, solicitações,
            # parser de planilha, ACC, fluxo documental e senhas
```

Cobrem limites (0–100), marcos concluídos, renormalização de pesos, janela de
sinais, divergência, monotonicidade do atraso, dominância no score do projeto,
o parsing de datas/números/cabeçalhos em pt-BR e en-US, o mapeamento dos CSVs
do ACC, a cifragem dos tokens OAuth (round-trip, não-determinismo do IV,
rejeição de payload adulterado, margem de renovação do access token), as
transições válidas do fluxo documental (incluindo a regra de que revisão
analisada é terminal, um documento percorrendo três revisões até a aprovação,
e um código de análise customizado funcionando pelo efeito e não pela sigla),
a sugestão do próximo nome de revisão, e o hash de senhas (salt aleatório, parâmetros embutidos,
rejeição de hash corrompido sem estourar).

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

- **Cronograma pelo ACC.** Impossível pela API — ver a seção sobre o ACC acima.
  A planilha continua sendo a fonte de prazo.
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


---

## Tarefas (antes "marcos")

Na interface a unidade de trabalho é **Tarefa**; **marco** é um tipo de tarefa
sem duração (convenção P6/MS Project). No banco a tabela continua `Milestone`,
porque DRI, sinais e convocações apontam para ela. Regras puras em
`lib/tasks.ts` (testes em `test/tasks.test.mjs`):

- Prazo vigente = previsão, senão a linha de base. Atrasada = em aberto e
  prazo antes de hoje.
- Concluir fecha em 100% e grava o término real; reabrir limpa.
- Avanço do projeto = média ponderada pela duração das tarefas (só as
  "folhas" — `leafTasks()` — contam; marco com filhas não soma de novo).
- Registrar impedimento passa a tarefa para "Impedida"; resolver o último
  devolve para "Em andamento".
- Gerente edita tudo; o responsável atualiza só status, avanço e previsão.

### Hierarquia: Marco agrupa Tarefas

Dois níveis, sem marco dentro de marco: `Milestone.parentId` — só um registro
`kind = MILESTONE` pode ser pai, só `kind = TASK` pode ter pai, e sempre no
mesmo projeto (`validateParentLink` em `lib/tasks.ts`). Status, avanço e
prazo previsto de um marco com filhas **não são digitados** — vêm do rollup
das tarefas filhas (`rollupMilestone`, aplicado em `recomputeRollup` a cada
`app/actions/tasks.ts`): concluído só quando todas as filhas concluírem,
prazo previsto = o mais tardio das filhas. DRI do marco continua próprio
(sinais humanos/sistêmicos apontam pra ele independente do rollup) — um
checkpoint pode carregar risco mesmo com as filhas em dia.

### Histórico de reprogramação

`DeadlineChange` é um log append-only (ligado a uma Tarefa/Marco **ou** a uma
Solicitação, nunca os dois) que grava toda vez que o prazo previsto muda —
data anterior, data nova, motivo. Complementa `plannedDate`/`actualDate`
(declarado/finalizado, campo único) com "quantas vezes mudou e para quando",
no espírito do `DocumentTransition`. Aparece na página da tarefa em
"Histórico de prazo" (`DeadlineHistoryList`).

### Solicitações

`Request` é diferente de `Impediment`: não bloqueia a tarefa necessariamente,
é qualquer pedido em acompanhamento até a conclusão — documento de
referência, informação complementar etc. Pode estar ligada a uma
tarefa/marco (`milestoneId`) e a um ou mais documentos (`RequestDocument`),
ou ser só do projeto (sem vínculo nenhum) — "tudo referente ao projeto", não
só documentos. Aparece na página do projeto (todas) e na página de cada
tarefa (as dela), com reprogramação de prazo gravando no mesmo histórico
(`app/actions/requests.ts`).

## Projeto pausado ou encerrado

É **somente leitura**, checado no servidor em cada ação que grava (tarefas,
solicitações, impedimentos, sinais, convocações, importação, documentos e
revisões). O projeto continua visível como histórico, mas sai do Painel e de
"Minhas demandas", e o cron do DRI não o recalcula.

Depois da migração que criou as tarefas, rode uma vez
`npx tsx scripts/backfill-tasks.ts` (marca como concluídas as que já tinham
término real e preenche o projeto de demonstração).
