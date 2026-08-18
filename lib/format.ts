export function formatCurrency(
  value: number | null | undefined,
  currency = "BRL",
): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

/** Decimal do Prisma chega como objeto; normaliza para number|null. */
export function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza um objeto para gravação em coluna Json do Postgres.
 *
 * O round-trip por JSON não é só para satisfazer o tipo: ele garante que o
 * valor é realmente serializável (Date vira ISO, `undefined` some), evitando
 * erro em runtime na escrita.
 */
export function toJsonValue(value: unknown): Record<string, never> {
  return JSON.parse(JSON.stringify(value ?? {}));
}
