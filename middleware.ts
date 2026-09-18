import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "dp_session";

/**
 * Porteiro de borda: barra quem não tem cookie de sessão.
 *
 * Deliberadamente NÃO valida a sessão contra o banco — o middleware roda no
 * edge, sem acesso ao Prisma. A validação real (sessão existe, não expirou,
 * usuário ativo) acontece em `getCurrentUser`, chamada nas páginas e actions.
 * Aqui só evitamos renderizar página protegida para quem nem cookie tem.
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/api/acc/callback",
  "/api/cron",
  "/_next",
  "/favicon",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
