import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getRegionRouter } from '../lib/regionRouter.js';
import { hashApiKey, parseApiKeyFromHeader, type ApiKeyInfo } from '../lib/apiKey.js';
import { getApiKeyCache } from '../lib/apiKeyCache.js';
import { getLogger } from '../lib/logger.js';
import { getTraceId } from '../lib/trace.js';

import type { PrismaClientType } from '../lib/regionRouter.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKeyInfo;
    prisma?: PrismaClientType;
  }
}

/**
 * API Key Authentication Plugin
 * 
 * Authenticates requests using API keys in Authorization header.
 * Looks up keys across all regions and caches results.
 */
export const authPlugin: FastifyPluginAsync = async (fastify) => {
  const logger = getLogger();
  logger.info('Auth plugin: Starting registration');
  
  const regionRouter = getRegionRouter();
  const cache = getApiKeyCache();

  logger.info('Auth plugin: Registering onRequest hook');

  // Register hook - must be done synchronously in the plugin function
  fastify.addHook('onRequest', async (request: FastifyRequest, reply) => {
    try {
      // Log that hook is executing - this should appear for EVERY request
      logger.info({ url: request.url, method: request.method }, 'Auth plugin: Hook executing');
      
      // Skip auth for internal routes
      if (request.url.startsWith('/internal')) {
        logger.debug({ url: request.url }, 'Auth plugin: Skipping internal route');
        return;
      }

      // Skip auth for root route
      if (request.url === '/') {
        logger.debug({ url: request.url }, 'Auth plugin: Skipping root route');
        return;
      }

        logger.info({ url: request.url, hasAuth: !!request.headers.authorization }, 'Auth plugin: processing request');

      // Parse API key from Authorization header
      const plaintextKey = parseApiKeyFromHeader(request.headers.authorization);

      if (!plaintextKey) {
        logger.warn({ url: request.url }, 'Auth plugin: Missing or invalid Authorization header');
        return reply.code(401).send({
          error: 'Missing or invalid Authorization header',
          code: 'UNAUTHORIZED',
        });
      }

      logger.debug({ url: request.url, keyPrefix: plaintextKey.substring(0, 10) + '...' }, 'Auth plugin: Found API key');

      // Hash the key
      const hashedKey = hashApiKey(plaintextKey);

      // Check cache first
      let apiKeyInfo = cache.get(hashedKey);

      if (!apiKeyInfo) {
        // Search across all regions
        let found = false;
        const regions = regionRouter.getAllRegions();

        for (const region of regions) {
          const prisma = regionRouter.getPrisma(region);

          const apiKey = await prisma.apiKey.findFirst({
            where: { hashedKey },
            include: {
              company: true,
              workspace: true,
            },
          });

          if (apiKey) {
            // Verify status
            if (apiKey.status !== 'ACTIVE') {
              return reply.code(401).send({
                error: 'API key is revoked',
                code: 'UNAUTHORIZED',
              });
            }

            // Verify expiration
            if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
              return reply.code(401).send({
                error: 'API key has expired',
                code: 'UNAUTHORIZED',
              });
            }

            // Verify IP allowlist
            if (apiKey.ipAllowlist.length > 0) {
              const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
              const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp.split(',')[0].trim();

              if (!apiKey.ipAllowlist.includes(ip)) {
                return reply.code(403).send({
                  error: 'IP address not allowed',
                  code: 'FORBIDDEN',
                });
              }
            }

            // Get company to determine region
            let company = apiKey.company;
            if (!company && apiKey.companyId) {
              company = await prisma.company.findUnique({ 
                where: { id: apiKey.companyId } 
              });
            }

            if (!company) {
              return reply.code(401).send({
                error: 'API key company not found',
                code: 'UNAUTHORIZED',
              });
            }

            apiKeyInfo = {
              id: apiKey.id,
              region: company.dataRegion,
              scope: apiKey.scope as 'COMPANY' | 'WORKSPACE',
              companyId: apiKey.companyId || '',
              workspaceId: apiKey.workspaceId,
              status: apiKey.status as 'ACTIVE' | 'REVOKED',
              expiresAt: apiKey.expiresAt,
              ipAllowlist: apiKey.ipAllowlist,
            };

            // Cache the result
            cache.set(hashedKey, apiKeyInfo);
            found = true;
            break;
          }
        }

        if (!found || !apiKeyInfo) {
          logger.warn({ 
            url: request.url, 
            hashedKey: hashedKey.substring(0, 20) + '...',
            plaintextPrefix: plaintextKey.substring(0, 20) + '...',
            regionsSearched: regions.length 
          }, 'Auth plugin: API key not found in any region');
          return reply.code(401).send({
            error: 'Invalid API key',
            code: 'UNAUTHORIZED',
          });
        }
      }

      logger.debug({ url: request.url, apiKeyId: apiKeyInfo.id, scope: apiKeyInfo.scope }, 'Auth plugin: API key authenticated');

      // Attach API key info to request (apiKeyInfo is guaranteed to be set here)
      if (!apiKeyInfo) {
        return reply.code(401).send({
          error: 'Invalid API key',
          code: 'UNAUTHORIZED',
        });
      }

      request.apiKey = apiKeyInfo;

      // Attach region-specific Prisma client
      request.prisma = regionRouter.getPrisma(apiKeyInfo.region);

      // Update last used (best-effort, non-blocking)
      const traceId = getTraceId(request);
      const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
      const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp.split(',')[0].trim();
      const userAgent = request.headers['user-agent'] || undefined;

      // Update in background (don't await)
      updateLastUsed(apiKeyInfo.id, apiKeyInfo.region, ip, request.url, userAgent).catch((err) => {
        logger.warn({ err, traceId, apiKeyId: apiKeyInfo.id }, 'Failed to update API key last used');
      });
    } catch (error) {
      logger.error({ err: error, url: request.url }, 'Auth plugin: Error in hook');
      return reply.code(500).send({
        error: 'Internal server error during authentication',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  async function updateLastUsed(
    apiKeyId: string,
    region: string,
    ip: string,
    endpoint: string,
    userAgent?: string
  ): Promise<void> {
    const prisma = regionRouter.getPrisma(region as any);
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: ip,
        lastUsedEndpoint: endpoint,
      },
    });
  }
};

/**
 * Setup auth hook directly on server instance
 * This is an alternative to using the plugin approach
 */
export function setupAuthHook(server: any): void {
  const logger = getLogger();
  logger.info('Setting up auth hook directly on server');
  
  const regionRouter = getRegionRouter();
  const cache = getApiKeyCache();

  server.addHook('onRequest', async (request: any, reply: any) => {
    // Log that hook is executing - this should appear for EVERY request
    logger.info({ url: request.url, method: request.method }, 'Auth hook: Executing');
    
    try {
      // Skip auth for internal routes
      if (request.url.startsWith('/internal')) {
        logger.debug({ url: request.url }, 'Auth hook: Skipping internal route');
        return;
      }

      // Skip auth for root route
      if (request.url === '/') {
        logger.debug({ url: request.url }, 'Auth hook: Skipping root route');
        return;
      }

      logger.info({ url: request.url, hasAuth: !!request.headers.authorization }, 'Auth hook: Processing request');

      // Parse API key from Authorization header
      const plaintextKey = parseApiKeyFromHeader(request.headers.authorization);

      if (!plaintextKey) {
        logger.warn({ url: request.url }, 'Auth hook: Missing or invalid Authorization header');
        return reply.code(401).send({
          error: 'Missing or invalid Authorization header',
          code: 'UNAUTHORIZED',
        });
      }

      logger.debug({ url: request.url, keyPrefix: plaintextKey.substring(0, 10) + '...' }, 'Auth hook: Found API key');

      // Hash the key
      const hashedKey = hashApiKey(plaintextKey);

      // Check cache first
      let apiKeyInfo = cache.get(hashedKey);

      if (!apiKeyInfo) {
        // Search across all regions
        let found = false;
        const regions = regionRouter.getAllRegions();

        for (const region of regions) {
          const prisma = regionRouter.getPrisma(region);

          const apiKey = await prisma.apiKey.findFirst({
            where: { hashedKey },
            include: {
              company: true,
              workspace: true,
            },
          });

          if (apiKey) {
            // Verify status
            if (apiKey.status !== 'ACTIVE') {
              return reply.code(401).send({
                error: 'API key is revoked',
                code: 'UNAUTHORIZED',
              });
            }

            // Verify expiration
            if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
              return reply.code(401).send({
                error: 'API key has expired',
                code: 'UNAUTHORIZED',
              });
            }

            // Verify IP allowlist
            if (apiKey.ipAllowlist.length > 0) {
              const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
              const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp.split(',')[0].trim();

              if (!apiKey.ipAllowlist.includes(ip)) {
                return reply.code(403).send({
                  error: 'IP address not allowed',
                  code: 'FORBIDDEN',
                });
              }
            }

            // Get company to determine region
            let company = apiKey.company;
            if (!company && apiKey.companyId) {
              company = await prisma.company.findUnique({ 
                where: { id: apiKey.companyId } 
              });
            }

            if (!company) {
              return reply.code(401).send({
                error: 'API key company not found',
                code: 'UNAUTHORIZED',
              });
            }

            apiKeyInfo = {
              id: apiKey.id,
              region: company.dataRegion,
              scope: apiKey.scope as 'COMPANY' | 'WORKSPACE',
              companyId: apiKey.companyId || '',
              workspaceId: apiKey.workspaceId,
              status: apiKey.status as 'ACTIVE' | 'REVOKED',
              expiresAt: apiKey.expiresAt,
              ipAllowlist: apiKey.ipAllowlist,
            };

            // Cache the result
            cache.set(hashedKey, apiKeyInfo);
            found = true;
            break;
          }
        }

        if (!found || !apiKeyInfo) {
          logger.warn({ 
            url: request.url, 
            hashedKey: hashedKey.substring(0, 20) + '...',
            plaintextPrefix: plaintextKey.substring(0, 20) + '...',
            regionsSearched: regions.length 
          }, 'Auth hook: API key not found in any region');
          return reply.code(401).send({
            error: 'Invalid API key',
            code: 'UNAUTHORIZED',
          });
        }
      }

      logger.debug({ url: request.url, apiKeyId: apiKeyInfo.id, scope: apiKeyInfo.scope }, 'Auth hook: API key authenticated');

      // Attach API key info to request
      request.apiKey = apiKeyInfo;

      // Attach region-specific Prisma client
      request.prisma = regionRouter.getPrisma(apiKeyInfo.region);

      // Update last used (best-effort, non-blocking)
      const traceId = getTraceId(request);
      const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
      const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp.split(',')[0].trim();
      const userAgent = request.headers['user-agent'] || undefined;

      // Update in background (don't await)
      // Use the same Prisma client that found the key to avoid region mismatch
      const updatePrisma = regionRouter.getPrisma(apiKeyInfo.region);
      updatePrisma.apiKey.update({
        where: { id: apiKeyInfo.id },
        data: {
          lastUsedAt: new Date(),
          lastUsedIp: ip,
          lastUsedEndpoint: request.url,
        },
      }).catch((err: any) => {
        // Ignore P2025 (record not found) - key might have been deleted/revoked
        if (err?.code !== 'P2025') {
          logger.warn({ err, traceId, apiKeyId: apiKeyInfo.id }, 'Failed to update API key last used');
        }
      });
    } catch (error) {
      logger.error({ err: error, url: request.url }, 'Auth hook: Error in hook');
      return reply.code(500).send({
        error: 'Internal server error during authentication',
        code: 'INTERNAL_ERROR',
      });
    }
  });
}

