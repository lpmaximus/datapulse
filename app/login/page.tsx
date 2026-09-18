import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "@/components/login-form";
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
        <p className="text-xl font-semibold tracking-tight">
          Data<span className="text-accent">Pulse</span>
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Onde este projeto vai travar?
        </p>
      </div>
      <Card>
        <LoginForm next={next} />
      </Card>
    </div>
  );
}
