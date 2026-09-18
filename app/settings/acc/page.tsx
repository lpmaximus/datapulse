import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, Button, Empty, SectionTitle, Chip } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { daysUntilReauth, REFRESH_TOKEN_WARNING_DAYS } from "@/lib/acc/auth";
import { AccProjectLinker } from "@/components/acc-project-linker";
import { syncAccNow, disconnectAcc, unlinkProjectFromAcc } from "@/app/actions/acc";
import { requireRole } from "@/lib/authz";
import type { AccConnectionViewRow, UnlinkedProjectRow } from "@/types/models";
import { AlertTriangle, CheckCircle2, Link2, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_VIEW: Record<string, { label: string; className: string }> = {
  NEVER_RUN: { label: "Nunca sincronizou", className: "text-ink-soft" },
  OK: { label: "Sincronizado", className: "text-green-700" },
  FAILED: { label: "Falhou", className: "text-red-700" },
  REAUTH_REQUIRED: { label: "Reautorização necessária", className: "text-orange-700" },
};

export default async function AccSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

  // Conexões ACC e o token que carregam são um recurso sensível por
  // organização — só ADMIN da própria organização enxerga e opera aqui.
  const me = await requireRole(["ADMIN"]);

  const connections: AccConnectionViewRow[] = await prisma.accConnection.findMany({
    where: { organizationId: me.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      hubId: true,
      hubName: true,
      refreshTokenExpiresAt: true,
      dataRequestId: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
      createdAt: true,
      projects: {
        select: { id: true, name: true, accProjectId: true, accProjectName: true },
      },
    },
  });

  const unlinked: UnlinkedProjectRow[] = await prisma.project.findMany({
    where: { accConnectionId: null, organizationId: me.organizationId },
    select: {
      id: true,
      name: true,
      clientRef: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const configured = Boolean(process.env.APS_CLIENT_ID && process.env.APS_CLIENT_SECRET);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Autodesk Construction Cloud
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Importa custo e issues automaticamente para a Camada 1.
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <p className="text-sm font-medium text-amber-900">
          O que o ACC entrega — e o que não entrega
        </p>
        <p className="mt-2 text-sm text-amber-800">
          A Data Connector API do ACC <strong>não expõe cronograma</strong>. Os
          grupos disponíveis são admin, issues, RFIs, submittals, cost e
          locations — não há dados de tarefas com data planejada e real.
        </p>
        <p className="mt-2 text-sm text-amber-800">
          Como o componente de prazo pesa 45% no DRI, ele continua vindo do
          upload de planilha. O ACC complementa com custo e issues; não
          substitui a importação manual do cronograma.
        </p>
      </Card>

      {connected ? (
        <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          <CheckCircle2 size={15} />
          Hub conectado. Vincule os projetos abaixo para começar a sincronizar.
        </p>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <XCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {!configured ? (
        <Card>
          <SectionTitle>Configuração pendente</SectionTitle>
          <p className="text-sm text-ink-soft">
            Defina <code className="rounded bg-canvas px-1">APS_CLIENT_ID</code>,{" "}
            <code className="rounded bg-canvas px-1">APS_CLIENT_SECRET</code>,{" "}
            <code className="rounded bg-canvas px-1">APS_CALLBACK_URL</code> e{" "}
            <code className="rounded bg-canvas px-1">ACC_TOKEN_KEY</code> nas
            variáveis de ambiente. Veja o README para o passo a passo do registro
            do app no Autodesk Platform Services.
          </p>
        </Card>
      ) : connections.length === 0 ? (
        <Card>
          <SectionTitle>Nenhum hub conectado</SectionTitle>
          <p className="mb-4 text-sm text-ink-soft">
            A autorização exige um usuário com permissão de{" "}
            <strong>Account Admin / Executive</strong> no ACC — a API não aceita
            conta de serviço.
          </p>
          <Link href="/api/acc/authorize">
            <Button>
              <Link2 size={15} />
              Conectar ao Autodesk
            </Button>
          </Link>
        </Card>
      ) : (
        connections.map((c) => {
          const days = daysUntilReauth(c.refreshTokenExpiresAt);
          const status = STATUS_VIEW[c.lastSyncStatus] ?? STATUS_VIEW.NEVER_RUN;

          return (
            <Card key={c.id} className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{c.hubName ?? c.hubId}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Hub {c.hubId} · conectado em {formatDateTime(c.createdAt)}
                  </p>
                  <p className={`mt-2 text-sm ${status.className}`}>
                    {status.label}
                    {c.lastSyncAt ? ` · último ciclo em ${formatDateTime(c.lastSyncAt)}` : ""}
                  </p>
                  {c.lastSyncError ? (
                    <p className="mt-1 max-w-xl text-xs text-red-700">{c.lastSyncError}</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <form action={syncAccNow}>
                    <input type="hidden" name="connectionId" value={c.id} />
                    <Button variant="outline" type="submit">
                      Sincronizar agora
                    </Button>
                  </form>
                  <form action={disconnectAcc}>
                    <input type="hidden" name="connectionId" value={c.id} />
                    <Button variant="ghost" type="submit">
                      Desconectar
                    </Button>
                  </form>
                </div>
              </div>

              {days <= REFRESH_TOKEN_WARNING_DAYS ? (
                <p className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-800">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {days <= 0
                    ? "A autorização expirou. Reconecte para retomar a sincronização."
                    : `A autorização expira em ${days} dia(s). O refresh token da Autodesk dura 15 dias e se renova a cada sincronização — se o cron ficar parado além disso, será preciso reautorizar manualmente.`}
                </p>
              ) : null}

              <div>
                <SectionTitle hint={`${c.projects.length} vinculado(s)`}>
                  Projetos vinculados
                </SectionTitle>
                {c.projects.length === 0 ? (
                  <Empty>
                    Nenhum projeto vinculado. Sem vínculo, não há o que sincronizar.
                  </Empty>
                ) : (
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {c.projects.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/projects/${p.id}`}
                            className="text-sm font-medium hover:text-accent"
                          >
                            {p.name}
                          </Link>
                          <p className="text-xs text-ink-faint">
                            ACC: {p.accProjectName ?? p.accProjectId ?? "—"}
                          </p>
                        </div>
                        <form action={unlinkProjectFromAcc}>
                          <input type="hidden" name="projectId" value={p.id} />
                          <Button variant="ghost" type="submit" className="text-xs">
                            Desvincular
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <SectionTitle>Vincular novo projeto</SectionTitle>
                {unlinked.length === 0 ? (
                  <Empty>Todos os projetos já estão vinculados.</Empty>
                ) : (
                  <AccProjectLinker connectionId={c.id} projects={unlinked} />
                )}
              </div>

              {c.dataRequestId ? (
                <p className="text-xs text-ink-faint">
                  Request de extração <Chip>{c.dataRequestId}</Chip> ativo no ACC
                  (diário).
                </p>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}
