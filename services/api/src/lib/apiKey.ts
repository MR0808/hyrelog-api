import { createHmac, randomBytes } from 'crypto';
import { loadConfig } from './config.js';
import type { Region } from './config.js';

export type ApiKeyScope = 'COMPANY' | 'WORKSPACE';

export interface ApiKeyInfo {
  id: string;
  region: Region;
  scope: ApiKeyScope;
  companyId: string;
  workspaceId: string | null;
  status: 'ACTIVE' | 'REVOKED';
  expiresAt: Date | null;
  ipAllowlist: string[];
}

/**
 * Hash an API key using HMAC-SHA256
 */
export function hashApiKey(plaintextKey: string): string {
  const config = loadConfig();
  const hmac = createHmac('sha256', config.apiKeySecret);
  hmac.update(plaintextKey);
  return hmac.digest('hex');
}

/**
 * Generate a random API key prefix
 */
export function generateKeyPrefix(scope: ApiKeyScope): string {
  const random = randomBytes(8).toString('hex');
  const prefix = scope === 'COMPANY' ? 'hlk_co_' : 'hlk_ws_';
  return `${prefix}${random}`;
}

/**
 * Generate a full API key (prefix + random suffix)
 */
export function generateApiKey(scope: ApiKeyScope): string {
  const prefix = generateKeyPrefix(scope);
  const suffix = randomBytes(16).toString('hex');
  return `${prefix}${suffix}`;
}

/**
 * Parse API key from Authorization header
 * Format: "Bearer <key>"
 */
export function parseApiKeyFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

