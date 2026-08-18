import { PrismaClient } from "@prisma/client";

/**
 * Singleton do Prisma. Em serverless (Vercel) cada invocação pode reusar o
 * mesmo processo — sem o cache global, o hot reload em dev estoura o limite
 * de conexões do Neon.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
