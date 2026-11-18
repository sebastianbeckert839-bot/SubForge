import { PrismaClient } from "@prisma/client";
import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/**
 * Prisma client factory.
 *
 * - Local / sandbox: uses the local SQLite file via DATABASE_URL (see .env).
 * - Serverless deploys (Vercel): the filesystem is read-only and ephemeral, so
 *   a local SQLite file cannot persist. When TURSO_DATABASE_URL is set,
 *   queries are routed to a Turso (libSQL) database through Prisma's driver
 *   adapter so usage stats survive across deploys.
 * - Without either, queries fail soft (the API routes return empty stats).
 */
function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  if (tursoUrl) {
    const libsql = createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter: new PrismaLibSQL(libsql) });
  }

  // Ensures a fresh clone or a serverless build never crashes on a missing env var.
  process.env.DATABASE_URL ??= "file:./db/custom.db";

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
