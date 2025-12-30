import { PrismaClient } from '../../../api/node_modules/.prisma/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getDatabaseUrl, type Region } from './config.js';

/**
 * Region Router for Worker
 * Manages Prisma clients per region
 */
class RegionRouter {
  private clients: Map<Region, PrismaClient> = new Map();

  getPrisma(region: Region): PrismaClient {
    if (!this.clients.has(region)) {
      const databaseUrl = getDatabaseUrl(region);
      const pool = new Pool({ connectionString: databaseUrl });
      const adapter = new PrismaPg(pool);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new PrismaClient({ adapter } as any);
      this.clients.set(region, client);
    }

    return this.clients.get(region)!;
  }

  getAllRegions(): Region[] {
    return ['US', 'EU', 'UK', 'AU'];
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map((client) => client.$disconnect())
    );
    this.clients.clear();
  }
}

// Singleton instance
let regionRouter: RegionRouter | null = null;

export function getRegionRouter(): RegionRouter {
  if (!regionRouter) {
    regionRouter = new RegionRouter();
  }
  return regionRouter;
}

export type PrismaClientType = PrismaClient;

