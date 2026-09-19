/**
 * Regras compartilhadas (servidor e navegador) dos arquivos do projeto.
 * Sem imports de servidor: o formulário de envio também usa isto.
 */

/** Teto por arquivo. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Teto de armazenamento do store inteiro (compartilhado entre organizações). A cota gratuita do Blob é 1 GB e,
 * ao estourar, a Vercel bloqueia o Blob por 30 dias — melhor recusar o envio
 * antes, com folga. Sobe junto com o plano.
 */
export const ORG_QUOTA_BYTES = 900 * 1024 * 1024;

export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
];

/** Sugestões de tipo — o campo é livre, como `Milestone.type`. */
export const FILE_KIND_SUGGESTIONS = [
  "Ordem de serviço",
  "Processo SEI",
  "Contrato",
  "Controle",
  "ART",
  "Proposta",
  "Ata",
  "Outro",
];

/** Tipos exibidos direto no navegador; o resto baixa. */
export const INLINE_CONTENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain"];

export function blobPrefix(projectId: string): string {
  return `projetos/${projectId}/`;
}

/** Caminho válido do projeto: prefixo + um único nome seguro (sem `..`, `/` extra ou símbolo). */
export function isBlobPathnameFor(projectId: string, pathname: string): boolean {
  if (!pathname.startsWith(blobPrefix(projectId))) return false;
  return /^[A-Za-z0-9._-]+$/.test(pathname.slice(blobPrefix(projectId).length));
}

/** `text/plain; charset=utf-8` -> `text/plain`. */
export function baseContentType(value: string): string {
  return value.split(";")[0].trim().toLowerCase();
}

/** Nome seguro para o caminho do blob: sem acento, espaço ou símbolo. */
export function safeBlobName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-120);
  return cleaned || "arquivo";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
