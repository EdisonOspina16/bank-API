import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL environment variable for Prisma.');
}

/**
 * Singleton instance of PrismaClient to prevent connection leaks.
 * In development, it reuses the global instance to survive hot reloads.
 */
const prisma =
  globalThis.prisma ||
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;
export { prisma };
