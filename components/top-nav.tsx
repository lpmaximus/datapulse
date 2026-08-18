"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Bell, HelpCircle, Search, ChevronDown, LayoutGrid } from "lucide-react";

const TABS = [
  { href: "/", label: "Painel" },
  { href: "/projects", label: "Projetos" },
  { href: "/milestones", label: "Marcos" },
  { href: "/signals", label: "Sinais" },
  { href: "/reports", label: "Relatórios" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Barra superior fixa, estilo Ads Manager: logo, abas, busca, ícones utilitários. */
export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-white">
            <LayoutGrid size={15} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Data<span className="text-accent">Pulse</span>
          </span>
        </Link>

        <nav className="flex h-full items-stretch gap-1">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  "flex items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-soft hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Buscar"
            className="rounded-md p-2 text-ink-soft hover:bg-canvas hover:text-ink"
          >
            <Search size={17} />
          </button>
          <button
            type="button"
            aria-label="Notificações"
            className="rounded-md p-2 text-ink-soft hover:bg-canvas hover:text-ink"
          >
            <Bell size={17} />
          </button>
          <button
            type="button"
            aria-label="Ajuda"
            className="rounded-md p-2 text-ink-soft hover:bg-canvas hover:text-ink"
          >
            <HelpCircle size={17} />
          </button>
          <button
            type="button"
            className="ml-1 flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-canvas"
          >
            L2tech
            <ChevronDown size={13} />
          </button>
          <span className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
            LP
          </span>
        </div>
      </div>
    </header>
  );
}
