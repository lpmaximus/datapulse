"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronsUpDown, Pencil, X } from "lucide-react";
import { renameWorkspace, type RenameWorkspaceState } from "@/app/actions/workspaces";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Bloco do workspace no menu lateral. Quem tem mais de um workspace clica para
 * trocar; ADMIN vê o lápis para renomear o workspace ativo.
 */
export function WorkspaceBadge({
  name,
  canSwitch,
  canRename,
  onNavigate,
}: {
  name: string;
  canSwitch?: boolean;
  canRename?: boolean;
  onNavigate?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<RenameWorkspaceState, FormData>(
    renameWorkspace,
    {},
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <form action={formAction} className="space-y-1">
        <div className="flex items-center gap-1 rounded-md border border-accent px-1.5 py-1">
          <input
            ref={inputRef}
            name="name"
            defaultValue={name}
            maxLength={60}
            required
            aria-label="Nome do workspace"
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 bg-transparent px-1 text-sm font-medium text-ink outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            aria-label="Salvar nome"
            title="Salvar"
            className="rounded p-1 text-accent hover:bg-canvas disabled:opacity-50"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancelar"
            title="Cancelar"
            className="rounded p-1 text-ink-soft hover:bg-canvas hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
        {state.error ? <p className="px-1 text-xs text-red-600">{state.error}</p> : null}
      </form>
    );
  }

  const body = (
    <>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">
        {initials(name)}
      </span>
      <span className="truncate text-sm font-medium text-ink">{name}</span>
      {canSwitch ? <ChevronsUpDown size={14} className="ml-auto shrink-0 text-ink-soft" /> : null}
    </>
  );
  const box = "flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2";

  return (
    <div className="group flex items-center rounded-md border border-line">
      {canSwitch ? (
        <Link
          href="/workspaces"
          title="Trocar de workspace"
          onClick={onNavigate}
          className={clsx(box, "rounded-md hover:bg-canvas")}
        >
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
      {canRename ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Renomear workspace"
          title="Renomear workspace"
          className="mr-1 shrink-0 rounded p-1.5 text-ink-soft hover:bg-canvas hover:text-ink"
        >
          <Pencil size={13} />
        </button>
      ) : null}
    </div>
  );
}
