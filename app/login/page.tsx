import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="mx-auto max-w-sm py-12">
      <div className="mb-6 text-center">
        <Logo size={44} className="justify-center" />
        <p className="mt-1 text-sm text-ink-soft">
          Inteligência para projetos em movimento
        </p>
      </div>
      <Card>
        <LoginForm next={next} />
      </Card>
    </div>
  );
}
