import { requireRole } from "@/lib/authz";
import { WorkloadGrid } from "@/components/workload-grid";

export const dynamic = "force-dynamic";

export default async function WorkloadPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; disciplina?: string }>;
}) {
  const user = await requireRole(["ADMIN", "MANAGER"], "/workload");
  const { semana, disciplina } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Carga da equipe</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Como está a semana de cada especialista. Clique em um dia para ver o que compõe as horas e
          quais documentos vencem.
        </p>
      </div>
      <WorkloadGrid user={user} week={semana} disciplineId={disciplina} basePath="/workload" />
    </div>
  );
}
