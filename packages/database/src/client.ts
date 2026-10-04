import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type CreateClientOptions = {
  connectionString: string;
  /** Tamanho máximo do pool. Mantenha baixo no plano gratuito/Pro pequeno do Supabase. */
  maxConnections?: number;
};

/**
 * Cria o PrismaClient com o driver adapter do Postgres (obrigatório no Prisma 7).
 * Crie UMA instância por processo e reutilize.
 */
export function createPrismaClient({ connectionString, maxConnections = 10 }: CreateClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString, max: maxConnections });
  return new PrismaClient({ adapter });
}
