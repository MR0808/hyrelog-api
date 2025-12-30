// Import PrismaClient from generated client
import { PrismaClient } from '../../node_modules/.prisma/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getDatabaseUrl, loadConfig, type Region } from './config.js';

/**
 * Create a PrismaClient instance for a specific region
 * 
 * In Prisma 7, we must pass the adapter to the PrismaClient constructor.
 * The adapter type is not fully exposed in Prisma 7's types, so we use a type assertion.
 */
export function createPrismaClient(region: Region): PrismaClient {
  const databaseUrl = getDatabaseUrl(region);
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);

  // Prisma 7 adapter type is not fully exposed in TypeScript definitions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any);
}

/**
 * Get the default PrismaClient (for the default region)
 */
let defaultClient: PrismaClient | null = null;

export function getPrismaClient(region?: Region): PrismaClient {
  if (!region) {
    if (!defaultClient) {
      const config = loadConfig();
      defaultClient = createPrismaClient(config.defaultDataRegion);
    }
    return defaultClient;
  }
  return createPrismaClient(region);
}

