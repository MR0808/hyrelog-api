import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { loadConfig } from '../lib/config.js';

declare module 'fastify' {
  interface FastifyRequest {
    isInternal?: boolean;
  }
}

export const internalAuthPlugin: FastifyPluginAsync = async (fastify) => {
  const config = loadConfig();

  fastify.addHook('onRequest', async (request: FastifyRequest, reply) => {
    // Only protect /internal/* routes
    if (!request.url.startsWith('/internal')) {
      return;
    }

    const token = request.headers['x-internal-token'];

    if (!token || token !== config.internalToken) {
      return reply.code(401).send({
        error: 'Unauthorized: Invalid or missing internal token',
        code: 'UNAUTHORIZED',
      });
    }

    request.isInternal = true;
  });
};

