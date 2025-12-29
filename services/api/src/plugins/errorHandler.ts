import { FastifyPluginAsync, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { getLogger } from '../lib/logger.js';

interface StandardError {
  error: string;
  code: string;
}

export const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const logger = getLogger();
    const traceId = request.headers['x-trace-id'] as string | undefined;

    // Log the error
    logger.error(
      {
        err: error,
        traceId,
        method: request.method,
        url: request.url,
      },
      'Request error'
    );

    // Handle Zod validation errors
    if (error.validation || error instanceof ZodError) {
      const validationError = error.validation || (error instanceof ZodError ? error.errors : undefined);
      return reply.code(400).send({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: validationError,
      } as StandardError & { details: unknown });
    }

    // Handle 404s
    if (error.statusCode === 404) {
      return reply.code(404).send({
        error: 'Not found',
        code: 'NOT_FOUND',
      });
    }

    // Handle 401s
    if (error.statusCode === 401) {
      return reply.code(401).send({
        error: error.message || 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    // Default error response
    const statusCode = error.statusCode || 500;
    const errorResponse: StandardError = {
      error: error.message || 'Internal server error',
      code: error.code || 'INTERNAL_ERROR',
    };

    // Only expose detailed errors in development
    if (process.env.NODE_ENV === 'development' && statusCode === 500) {
      return reply.code(statusCode).send({
        ...errorResponse,
        stack: error.stack,
      });
    }

    return reply.code(statusCode).send(errorResponse);
  });
};

