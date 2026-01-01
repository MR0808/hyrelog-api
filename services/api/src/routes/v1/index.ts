import { FastifyPluginAsync } from 'fastify';
import { eventsRoutes } from './events.js';
import { keysRoutes } from './keys.js';
import { webhooksRoutes } from './webhooks.js';
import { exportsRoutes } from './exports.js';

/**
 * V1 API Routes
 * 
 * All routes under /v1 prefix
 */
export const v1Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(eventsRoutes);
  await fastify.register(keysRoutes);
  await fastify.register(webhooksRoutes);
  await fastify.register(exportsRoutes);
};

