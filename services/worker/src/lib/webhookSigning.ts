// Re-export webhook signing utilities from API service
// In a monorepo, we could share this, but for now we'll duplicate the logic

import { createHmac } from 'crypto';

/**
 * Sign a webhook payload with HMAC-SHA256
 */
export function signWebhookPayload(
  secretPlaintext: string,
  rawBodyBytes: Buffer | string
): string {
  const hmac = createHmac('sha256', secretPlaintext);
  const body = typeof rawBodyBytes === 'string' 
    ? Buffer.from(rawBodyBytes, 'utf-8')
    : rawBodyBytes;
  hmac.update(body);
  return hmac.digest('hex');
}

/**
 * Generate webhook signature header value
 * Format: "v1=<hex_signature>"
 */
export function generateSignatureHeader(signature: string): string {
  return `v1=${signature}`;
}

