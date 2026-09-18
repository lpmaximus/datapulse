import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Card, SectionTitle } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const { required } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/password");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alterar senha</h1>
        <p className="mt-1 text-sm text-ink-soft">{user.email}</p>
      </div>

      {required || user.mustChangePassword ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Sua senha é provisória. Defina uma senha própria para continuar.
        </p>
      ) : null}

      <Card>
        <SectionTitle>Nova senha</SectionTitle>
        <PasswordForm />
      </Card>
    </div>
  );
}
