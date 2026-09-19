"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { registerProjectFile } from "@/app/actions/project-files";
import { Button, Field, inputClass } from "@/components/ui";
import {
  ALLOWED_CONTENT_TYPES,
  FILE_KIND_SUGGESTIONS,
  MAX_FILE_BYTES,
  baseContentType,
  blobPrefix,
  formatBytes,
  safeBlobName,
} from "@/lib/files";

/**
 * Envio em dois passos: o arquivo vai direto do navegador ao Blob (token
 * emitido e autorizado em /api/files/upload) e, depois, a action registra os
 * metadados no banco lendo tamanho e tipo do próprio blob.
 */
export function ProjectFileUpload({
  projectId,
  kindSuggestions,
}: {
  projectId: string;
  kindSuggestions: string[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const busy = progress !== null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return setError("Escolha um arquivo.");
    if (file.size > MAX_FILE_BYTES) return setError(`Arquivo acima de ${formatBytes(MAX_FILE_BYTES)}.`);
    if (!String(data.get("kind") ?? "").trim()) return setError("Informe o tipo do documento.");
    if (!ALLOWED_CONTENT_TYPES.includes(baseContentType(file.type))) {
      return setError("Tipo não permitido. Use PDF, Word, Excel, imagem, texto ou ZIP.");
    }

    setProgress(0);
    try {
      const blob = await upload(`${blobPrefix(projectId)}${safeBlobName(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/files/upload",
        clientPayload: JSON.stringify({ projectId }),
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });

      const meta = new FormData();
      meta.set("projectId", projectId);
      meta.set("pathname", blob.pathname);
      meta.set("fileName", file.name);
      for (const key of ["title", "kind", "reference", "issuedAt", "note"]) {
        meta.set(key, String(data.get(key) ?? ""));
      }
      const result = await registerProjectFile(meta);
      if (result.error) {
        setError(result.error);
      } else {
        form.reset();
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message || "Falha no envio.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Arquivo" hint={`PDF, Word, Excel, imagem, texto ou ZIP · até ${formatBytes(MAX_FILE_BYTES)}`}>
          <input
            name="file"
            type="file"
            required
            disabled={busy}
            accept={ALLOWED_CONTENT_TYPES.join(",")}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Tipo" hint="Escolha uma sugestão ou digite outro.">
        <input name="kind" required list="file-kinds" disabled={busy} className={inputClass} placeholder="Ordem de serviço" />
        <datalist id="file-kinds">
          {kindSuggestions.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </Field>
      <Field label="Nº / referência" hint="Ex.: nº do processo SEI ou da OS.">
        <input name="reference" disabled={busy} className={inputClass} placeholder="00000.000000/2026-00" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Título" hint="Se ficar vazio, usa o nome do arquivo.">
          <input name="title" disabled={busy} className={inputClass} />
        </Field>
      </div>
      <Field label="Data do documento">
        <input type="date" name="issuedAt" disabled={busy} className={inputClass} />
      </Field>
      <Field label="Observação">
        <input name="note" disabled={busy} className={inputClass} />
      </Field>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? `Enviando… ${progress}%` : "Enviar arquivo"}
        </Button>
      </div>
    </form>
  );
}
