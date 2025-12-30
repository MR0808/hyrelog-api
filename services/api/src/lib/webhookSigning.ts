import { createHmac, randomBytes } from 'crypto';

/**
 * Webhook Signing Utilities
 * 
 * Handles generation, hashing, and signing of webhook secrets and payloads.
 */

/**
 * Generate a random webhook secret (32 bytes, base64url encoded)
 */
export function generateWebhookSecret(): string {
  const secret = randomBytes(32);
  // Convert to base64url (URL-safe base64)
  return secret.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Hash a webhook secret for storage
 * Uses SHA-256 (simple and sufficient for this use case)
 */
export function hashWebhookSecret(plaintextSecret: string): string {
  const hash = createHmac('sha256', 'webhook-secret-salt')
    .update(plaintextSecret)
    .digest('hex');
  return hash;
}

/**
 * Verify a webhook secret against a stored hash
 */
export function verifyWebhookSecret(
  plaintextSecret: string,
  hashedSecret: string
): boolean {
  const computedHash = hashWebhookSecret(plaintextSecret);
  return computedHash === hashedSecret;
}

/**
 * Sign a webhook payload with HMAC-SHA256
 * 
 * @param secretPlaintext - The plaintext webhook secret
 * @param rawBodyBytes - The raw request body as Buffer or string
 * @returns Hex-encoded HMAC signature
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

/**
 * Parse signature from header value
 * Returns the signature hex string or null if invalid
 */
export function parseSignatureHeader(headerValue: string): string | null {
  const match = headerValue.match(/^v1=([a-f0-9]+)$/i);
  return match ? match[1] : null;
}

/**
 * Verify a webhook signature
 * 
 * @param signatureHeader - The x-hyrelog-signature header value
 * @param secretPlaintext - The plaintext webhook secret
 * @param rawBodyBytes - The raw request body
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  signatureHeader: string,
  secretPlaintext: string,
  rawBodyBytes: Buffer | string
): boolean {
  const providedSignature = parseSignatureHeader(signatureHeader);
  if (!providedSignature) {
    return false;
  }

  const computedSignature = signWebhookPayload(secretPlaintext, rawBodyBytes);
  return providedSignature === computedSignature;
}

