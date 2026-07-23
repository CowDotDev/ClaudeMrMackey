import Fastify, { FastifyInstance } from 'fastify';

import { config } from './config.js';

export function createServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

export async function startServer(app: FastifyInstance): Promise<void> {
  await app.listen({ port: config.port, host: '0.0.0.0' });
}
