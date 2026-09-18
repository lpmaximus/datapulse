"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileText,
  FolderKanban,
  HelpCircle,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Search,
  Users,
  X,
} from "lucide-react";
import { logout } from "@/app/actions/auth";

export interface NavUser {
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SPECIALIST" | "EXECUTIVE";
}

type Role = NavUser["role"];

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles?: Role[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Navegação lateral no padrão monday.com: seções com título discreto,
 * item ativo em azul claro. O papel do usuário filtra itens e seções vazias.
 */
const SECTIONS: NavSection[] = [
  {
    title: "Trabalho",
    items: [
      { href: "/", label: "Painel", icon: LayoutDashboard },
      {
        href: "/my-work",
        label: "Minhas demandas",
        icon: Inbox,
        roles: ["ADMIN", "MANAGER", "SPECIALIST"],
      },
    ],
  },
  {
    title: "Carteira",
    items: [
      { href: "/projects", label: "Projetos", icon: FolderKanban },
      { href: "/documents", label: "Documentos", icon: FileText },
      {
        href: "/signals",
        label: "Sinais",
        icon: Activity,
        roles: ["ADMIN", "MANAGER", "EXECUTIVE"],
      },
    ],
  },
  {
    title: "Análise",
    items: [{ href: "/reports", label: "Painéis e relatórios", icon: BarChart3 }],
  },
  {
    title: "Administração",
    items: [
      { href: "/settings/registers", label: "Cadastros", icon: Database, roles: ["ADMIN", "MANAGER"] },
      { href: "/users", label: "Usuários", icon: Users, roles: ["ADMIN"] },
      { href: "/settings/acc", label: "Integração ACC", icon: Plug, roles: ["ADMIN"] },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const iconButton =
  "rounded-md p-2 text-ink-soft transition-colors hover:bg-surface hover:text-ink";

function Sidebar({
  user,
  pathname,
  collapsed,
  onToggle,
  onNavigate,
}: {
  user: NavUser;
  pathname: string;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.roles || i.roles.includes(user.role)),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div
        className={clsx(
          "flex items-center gap-2 px-4 pb-2 pt-4",
          collapsed && "justify-center px-2",
        )}
      >
        {collapsed ? null : (
          <span className="text-sm text-ink-soft">Área de trabalho</span>
        )}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={clsx(
              "rounded-md p-1 text-ink-soft hover:bg-canvas hover:text-ink",
              !collapsed && "ml-auto",
            )}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        ) : null}
      </div>

      {collapsed ? null : (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-md border border-line px-2.5 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">
              DP
            </span>
            <span className="truncate text-sm font-medium text-ink">
              Carteira principal
            </span>
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.title}>
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-line" />
            ) : (
              <p className="px-2 pb-1 text-xs font-semibold text-ink">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={clsx(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        collapsed && "justify-center",
                        active
                          ? "bg-accent-soft/70 text-ink"
                          : "text-ink-soft hover:bg-canvas hover:text-ink",
                      )}
                    >
                      <Icon size={16} className={active ? "text-accent" : undefined} />
                      {collapsed ? null : <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

/**
 * Casca da aplicação: barra superior sobre a moldura cinza, menu lateral e
 * área de conteúdo branca com cantos arredondados — o layout do monday.com.
 */
export function AppShell({
  user,
  children,
}: {
  user: NavUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [pathname]);

  if (!user) {
    return <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-frame">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-frame px-4">
        <button
          type="button"
          aria-label="Abrir menu"
          onClick={() => setDrawerOpen(true)}
          className={clsx(iconButton, "md:hidden")}
        >
          <Menu size={18} />
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex items-end gap-[3px]" aria-hidden>
            <span className="h-2.5 w-2 rounded-full bg-st-stuck" />
            <span className="h-3.5 w-2 rounded-full bg-st-working" />
            <span className="h-2.5 w-2 rounded-full bg-st-done" />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-ink">
            DataPulse
          </span>
        </Link>

        <form
          action="/documents"
          className="relative mx-auto hidden w-full max-w-md sm:block"
        >
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
          />
          <input
            name="q"
            placeholder="Pesquisar documentos…"
            className="w-full rounded-full border border-transparent bg-surface/70 py-1.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink-soft focus:border-accent focus:bg-surface focus:outline-none"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:ml-0">
          <button type="button" aria-label="Notificações" className={iconButton}>
            <Bell size={18} />
          </button>
          <button type="button" aria-label="Ajuda" className={clsx(iconButton, "hidden sm:block")}>
            <HelpCircle size={18} />
          </button>
          <Link href="/account/password" aria-label="Alterar senha" className={iconButton}>
            <KeyRound size={18} />
          </Link>
          <form action={logout}>
            <button type="submit" aria-label="Sair" className={iconButton}>
              <LogOut size={18} />
            </button>
          </form>
          <span
            title={`${user.name} — ${user.email}`}
            className="ml-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white"
          >
            {initials(user.name)}
          </span>
        </div>
      </header>

      <div className="flex flex-1 px-2 pb-2">
        <div className="flex min-h-[calc(100vh-4rem)] flex-1 overflow-hidden rounded-xl bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <aside
            className={clsx(
              "hidden shrink-0 border-r border-line transition-[width] duration-200 md:block",
              collapsed ? "w-14" : "w-64",
            )}
          >
            <Sidebar
              user={user}
              pathname={pathname}
              collapsed={collapsed}
              onToggle={() => setCollapsed((v) => !v)}
            />
          </aside>

          <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-8 sm:py-6">
            <div className="mx-auto max-w-[1600px]">{children}</div>
            <footer className="mx-auto mt-10 max-w-[1600px] text-xs text-ink-faint">
              DRI é indicador antecipado, não previsão. Score com confiança
              baixa significa dado insuficiente — não ausência de risco.
            </footer>
          </main>
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/30"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-xl">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-3 rounded-md p-1.5 text-ink-soft hover:bg-canvas"
            >
              <X size={16} />
            </button>
            <Sidebar
              user={user}
              pathname={pathname}
              collapsed={false}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
