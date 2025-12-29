import { FastifyPluginAsync } from 'fastify';

const startTime = Date.now();

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    return reply.send({
      status: 'ok',
      uptime,
      timestamp: new Date().toISOString(),
      service: 'hyrelog-api',
    });
  });
};

