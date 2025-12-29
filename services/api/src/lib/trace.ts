import { randomBytes } from 'crypto';

/**
 * Generate a unique trace ID for request tracking
 */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Extract trace ID from request headers or generate a new one
 */
export function getTraceId(request: { headers: Record<string, string | string[] | undefined> }): string {
  const traceIdHeader = request.headers['x-trace-id'] || request.headers['x-request-id'];
  const traceId = Array.isArray(traceIdHeader) ? traceIdHeader[0] : traceIdHeader;
  return traceId || generateTraceId();
}

