import { FastifyRequest } from 'fastify';
import { getLogger } from './logger.js';
import { getTraceId } from './trace.js';
import type { ApiKeyInfo } from './apiKey.js';

const logger = getLogger();

/**
 * Security restrictions for key management operations
 * 
 * These restrictions apply to sensitive key management endpoints
 * to prevent abuse and ensure proper security practices.
 */

/**
 * Check if the authenticated company key has IP allowlist restrictions
 * Company keys used for key management MUST have IP allowlist configured
 */
export function requireIpAllowlistForKeyManagement(
  request: FastifyRequest,
  apiKey: ApiKeyInfo
): { allowed: boolean; error?: string } {
  // Only apply to company keys (workspace keys can't do key management)
  if (apiKey.scope !== 'COMPANY') {
    return { allowed: true };
  }

  // Company keys used for key management must have IP allowlist
  if (apiKey.ipAllowlist.length === 0) {
    const traceId = getTraceId(request);
    logger.warn(
      {
        traceId,
        apiKeyId: apiKey.id,
        ipAddress: request.ip,
        endpoint: request.url,
      },
      'Key management attempted without IP allowlist on company key'
    );

    return {
      allowed: false,
      error: 'Company keys used for key management must have IP allowlist configured. Please configure IP allowlist via dashboard.',
    };
  }

  // Verify IP is in allowlist
  const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
  const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp.split(',')[0].trim();

  if (!apiKey.ipAllowlist.includes(ip)) {
    const traceId = getTraceId(request);
    logger.warn(
      {
        traceId,
        apiKeyId: apiKey.id,
        ipAddress: ip,
        allowedIps: apiKey.ipAllowlist,
        endpoint: request.url,
      },
      'Key management attempted from IP not in allowlist'
    );

    return {
      allowed: false,
      error: `IP address ${ip} is not in the API key's IP allowlist`,
    };
  }

  return { allowed: true };
}

/**
 * Log key management operation for audit trail
 */
export function logKeyManagementOperation(
  operation: 'create' | 'rotate' | 'revoke' | 'status' | 'enable' | 'disable',
  request: FastifyRequest,
  apiKey: ApiKeyInfo,
  details: Record<string, unknown> = {}
): void {
  const traceId = getTraceId(request);
  const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
  const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp.split(',')[0].trim();

  logger.info(
    {
      traceId,
      operation,
      apiKeyId: apiKey.id,
      apiKeyScope: apiKey.scope,
      companyId: apiKey.companyId,
      workspaceId: apiKey.workspaceId,
      ipAddress: ip,
      endpoint: request.url,
      userAgent: request.headers['user-agent'],
      ...details,
    },
    `Key management operation: ${operation}`
  );
}

/**
 * Get stricter rate limit for key management endpoints
 * Key management operations are more sensitive and should be rate limited more strictly
 */
export function getKeyManagementRateLimit(): { perMinute: number } {
  // Stricter rate limit: 10 operations per minute for key management
  // This is separate from the general API rate limit
  return { perMinute: 10 };
}

