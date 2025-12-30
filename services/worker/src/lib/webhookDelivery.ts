import { PrismaClient } from '../../../api/node_modules/.prisma/client/index.js';
import { signWebhookPayload } from './webhookSigning.js';
import { decryptWebhookSecret } from './webhookEncryption.js';
import { createHash } from 'crypto';

/**
 * Retry backoff schedule (in milliseconds)
 * Attempts: 1 (immediate), 2 (+1m), 3 (+5m), 4 (+30m), 5 (+6h)
 */
const RETRY_BACKOFF_MS = [
  0, // Immediate (attempt 1)
  1 * 60 * 1000, // +1 minute (attempt 2)
  5 * 60 * 1000, // +5 minutes (attempt 3)
  30 * 60 * 1000, // +30 minutes (attempt 4)
  6 * 60 * 60 * 1000, // +6 hours (attempt 5)
];

const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Get next attempt time based on attempt number
 */
export function getNextAttemptAt(attempt: number): Date {
  if (attempt >= RETRY_BACKOFF_MS.length) {
    // Max attempts reached - return far future (will be marked as failed)
    return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
  }

  const delayMs = RETRY_BACKOFF_MS[attempt - 1] || 0;
  return new Date(Date.now() + delayMs);
}

/**
 * Deliver webhook payload to endpoint
 */
export async function deliverWebhook(
  url: string,
  payload: unknown,
  secretPlaintext: string,
  deliveryId: string,
  attempt: number,
  traceId?: string
): Promise<{
  success: boolean;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}> {
  const startTime = Date.now();

  try {
    // Serialize payload to JSON
    const bodyString = JSON.stringify(payload);
    const bodyBytes = Buffer.from(bodyString, 'utf-8');

    // Generate signature
    const signature = signWebhookPayload(secretPlaintext, bodyBytes);
    const signatureHeader = `v1=${signature}`;
    const timestamp = Math.floor(Date.now() / 1000);

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-hyrelog-signature': signatureHeader,
      'x-hyrelog-timestamp': timestamp.toString(),
      'x-hyrelog-delivery-id': deliveryId,
      'x-hyrelog-attempt': attempt.toString(),
    };

    if (traceId) {
      headers['x-trace-id'] = traceId;
      headers['traceparent'] = `00-${traceId}-${traceId.substring(0, 16)}-01`;
    }

    // Make HTTP request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;

      // Collect response headers (minimal set)
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        // Only store a few important headers
        if (['content-type', 'content-length', 'x-request-id'].includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });

      // Success if 2xx status code
      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          statusCode: response.status,
          responseHeaders,
          durationMs,
        };
      } else {
        return {
          success: false,
          statusCode: response.status,
          responseHeaders,
          errorCode: 'HTTP_ERROR',
          errorMessage: `HTTP ${response.status}`,
          durationMs,
        };
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (fetchError.name === 'AbortError') {
        return {
          success: false,
          errorCode: 'TIMEOUT',
          errorMessage: 'Request timeout after 10 seconds',
          durationMs,
        };
      }

      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: fetchError.message || 'Network error',
        durationMs,
      };
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      errorCode: 'UNKNOWN_ERROR',
      errorMessage: error.message || 'Unknown error',
      durationMs,
    };
  }
}

/**
 * Process a single webhook job
 */
export async function processWebhookJob(
  prisma: PrismaClient,
  jobId: string
): Promise<void> {
  // Load job with related data
  const job = await prisma.webhookJob.findUnique({
    where: { id: jobId },
    include: {
      webhook: true,
      event: true,
    },
  });

  if (!job) {
    throw new Error(`Webhook job not found: ${jobId}`);
  }

  // Check if webhook is still active
  if (job.webhook.status !== 'ACTIVE') {
    await prisma.webhookJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
      },
    });
    return;
  }

  // Mark job as SENDING
  await prisma.webhookJob.update({
    where: { id: jobId },
    data: {
      status: 'SENDING',
      lastAttemptAt: new Date(),
    },
  });

  // Decrypt webhook secret
  const secretPlaintext = decryptWebhookSecret(job.webhook.secretEncrypted);

  // Build payload
  const payload = {
    id: job.event.id,
    timestamp: job.event.timestamp.toISOString(),
    companyId: job.event.companyId,
    workspaceId: job.event.workspaceId,
    projectId: job.event.projectId,
    category: job.event.category,
    action: job.event.action,
    actor: {
      id: job.event.actorId,
      email: job.event.actorEmail,
      role: job.event.actorRole,
    },
    resource: {
      type: job.event.resourceType,
      id: job.event.resourceId,
    },
    metadata: job.event.metadata,
    traceId: job.event.traceId,
    hash: job.event.hash,
    prevHash: job.event.prevHash,
  };

  // Deliver webhook
  const result = await deliverWebhook(
    job.webhook.url,
    payload,
    secretPlaintext, // TODO: Use actual plaintext secret
    jobId,
    job.attempt,
    job.event.traceId
  );

  // Calculate request body SHA-256 for audit
  const bodyString = JSON.stringify(payload);
  const bodySha256 = createHash('sha256')
    .update(bodyString)
    .digest('hex');

  // Record delivery attempt
  await prisma.webhookDeliveryAttempt.create({
    data: {
      jobId: job.id,
      webhookId: job.webhookId,
      eventId: job.eventId,
      attempt: job.attempt,
      status: result.success ? 'SUCCEEDED' : 'FAILED',
      requestUrl: job.webhook.url,
      requestHeaders: {
        'Content-Type': 'application/json',
        'x-hyrelog-delivery-id': jobId,
        'x-hyrelog-attempt': job.attempt.toString(),
      },
      requestBodySha256: bodySha256,
      responseStatus: result.statusCode || null,
      responseHeaders: (result.responseHeaders || null) as any, // Prisma JSON field
      errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null,
      durationMs: result.durationMs,
    },
  });

  if (result.success) {
    // Success - mark job as succeeded
    await prisma.webhookJob.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
      },
    });

    // Update webhook endpoint stats
    await prisma.webhookEndpoint.update({
      where: { id: job.webhookId },
      data: {
        lastSuccessAt: new Date(),
        failureCount: 0, // Reset on success
      },
    });
  } else {
    // Failure - check if we should retry
    if (job.attempt >= MAX_ATTEMPTS) {
      // Max attempts reached - mark as failed
      await prisma.webhookJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
        },
      });

      // Update webhook endpoint stats
      await prisma.webhookEndpoint.update({
        where: { id: job.webhookId },
        data: {
          lastFailureAt: new Date(),
          failureCount: {
            increment: 1,
          },
        },
      });
    } else {
      // Schedule retry
      const nextAttempt = getNextAttemptAt(job.attempt + 1);
      await prisma.webhookJob.update({
        where: { id: jobId },
        data: {
          status: 'RETRY_SCHEDULED',
          attempt: job.attempt + 1,
          nextAttemptAt: nextAttempt,
        },
      });
    }
  }
}

