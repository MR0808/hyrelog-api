// Import PrismaClient from generated client
import { PrismaClient } from '../../node_modules/.prisma/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getDatabaseUrl, type Region } from './config.js';

/**
 * Region Router - Manages Prisma clients per region
 * 
 * Lazy-initializes Prisma clients for each region and provides
 * a unified interface to access the correct client based on region.
 */
class RegionRouter {
  private clients: Map<Region, PrismaClient> = new Map();

  /**
   * Get Prisma client for a specific region
   * Lazy-initializes if not already created
   */
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

  /**
   * Get Prisma client for all regions (for cross-region queries)
   */
  getAllRegions(): Region[] {
    return ['US', 'EU', 'UK', 'AU'];
  }

  /**
   * Close all Prisma clients (cleanup)
   */
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

