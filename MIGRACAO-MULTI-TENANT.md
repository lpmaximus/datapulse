# Migração multi-tenant — passo a passo

Antes: todos os cadastros (clientes, setores, disciplinas, empresas, funções,
códigos de análise, papéis de acesso) e todos os projetos eram **globais**.
Qualquer usuário logado via os dados de todos os outros.

Depois: existe a entidade **Organization**. Cada empresa cliente do DataPulse é
uma organização, e tudo — cadastros, projetos, documentos, tarefas, sinais —
vive dentro de uma. Uma organização nunca enxerga a outra.

Não há autocadastro público: organizações novas são criadas por você, via
script.

---

## Antes de começar

Rode **no seu terminal do Windows** (não pelo Claude — a VM aqui não consegue
baixar os engines do Prisma). Tenha a `DATABASE_URL` do Neon no `.env`.

Se quiser uma rede de segurança extra, tire um branch/snapshot do banco no
console do Neon antes do passo 2.

---

## 1. Exportar os cadastros atuais

```bash
npx tsx scripts/export-registers.ts
```

Gera `cadastros-export.json` na raiz com clientes, setores, disciplinas,
empresas, funções, códigos de análise, papéis de acesso e usuários — estes
**com o hash da senha preservado**, então todo mundo volta a entrar com a
mesma senha de sempre.

O arquivo já está no `.gitignore` (tem hash de senha dentro). Copie ele para
fora do projeto antes do passo seguinte, por segurança.

**Não vem junto:** projetos, documentos, tarefas, impedimentos, solicitações,
sinais e histórico. Se houver algum projeto de teste que você queira manter,
me fale antes de seguir — dá para estender o export.

## 2. Aplicar a migração

`organizationId` é coluna obrigatória e as tabelas têm linhas. O Prisma não
consegue simplesmente adicionar a coluna nesse caso — ele para com
"Added the required column ... it is not possible to execute this step".
Por isso o banco é zerado primeiro (o passo 1 já guardou o que importa):

```bash
npx prisma migrate reset --skip-seed
npx prisma migrate dev --name multi_tenant
```

`--skip-seed` é necessário: o `prisma/seed.ts` já espera a organização, que
só passa a existir depois da segunda linha. O `migrate dev` roda o
`prisma generate` no fim, então não precisa chamar à parte.

**O reset apaga tudo**, inclusive projetos, documentos, tarefas e sinais —
que o export do passo 1 não cobre.

## 3. Criar sua organização e o admin

```bash
npx tsx scripts/create-organization.ts "L2tech" "Luiz Paulo" "seu@email.com"
```

Imprime uma senha provisória. **Use um e-mail seu de verdade** — a única
conta que existia no banco era o admin de demonstração do seed
(`admin@datapulse.local`), que não serve para o app online.

O passo 4 vai trazer esse admin de demonstração de volta junto com os
cadastros. Depois de conferir, desative ele em `/users`.

## 4. Reimportar os cadastros

```bash
npx tsx scripts/import-registers.ts "L2tech"
```

Idempotente — se precisar, pode rodar de novo sem duplicar nada.

## 5. Conferir

```bash
npm run dev
```

Entre com seu e-mail e a **senha antiga**. Confira `/settings/registers`,
`/users` e `/projects`.

---

## Daqui em diante

**Nova empresa cliente:**

```bash
npx tsx scripts/create-organization.ts "Nome da Empresa" "Nome do Admin" "admin@empresa.com"
```

Entrega a organização já com um ADMIN e senha provisória. Esse admin cadastra
o resto pela interface, e o que ele cadastra só existe dentro da organização
dele.

**Carga da planilha CONTROLE MASTER** (agora exige a organização):

```bash
npm run import:master -- "examples/CONTROLE MASTER MRS.xlsx" --organizacao "L2tech"
```

**Limpeza** (agora também por organização, e nunca toca nas outras):

```bash
npx tsx scripts/clean-database.ts "L2tech"        # dry run, só mostra o plano
npx tsx scripts/clean-database.ts "L2tech" --yes  # apaga de verdade
```

**`scripts/backfill-organization.ts`** só serve para o caminho alternativo de
migrar sem resetar o banco. Seguindo este roteiro, você não precisa dele.

---

## O que mudou no código

- `organizationId` em 10 entidades raiz: User, Client, Sector, Discipline,
  Empresa, JobFunction, AnalysisCode, RoleProfile, Project, AccConnection.
  Todo o resto (documentos, tarefas, sinais, solicitações) herda a
  organização pela cadeia de chaves estrangeiras até uma dessas.
- Unicidade que era global virou **por organização**: duas empresas podem ter
  um cliente "MRS" cada uma, sem colidir. Exceções de propósito: `User.email`
  (chave de login, global) e `AccConnection.hubId` (identificador da Autodesk,
  global — protegido contra sequestro por outra organização).
- Toda consulta e toda escrita passou a filtrar/gravar por organização,
  inclusive validando ids vindos de formulário (cliente, gerente, responsável,
  disciplina...) antes de aceitá-los.
- Telas que **não tinham nenhuma checagem de permissão** ganharam uma:
  `/projects`, `/reports`, `/signals`, `/settings/acc` e as ações de conexão
  ACC (`app/actions/acc.ts`), além das duas rotas de OAuth do ACC.
