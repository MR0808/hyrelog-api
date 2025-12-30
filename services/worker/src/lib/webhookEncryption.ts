import { createDecipheriv } from 'crypto';

/**
 * Simple decryption for webhook secrets (local dev)
 * 
 * In production, use a proper secrets manager (AWS Secrets Manager, etc.)
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment
 */
function getEncryptionKey(): Buffer {
  const key = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY environment variable is required');
  }

  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  return keyBuffer;
}

/**
 * Decrypt a webhook secret
 */
export function decryptWebhookSecret(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

