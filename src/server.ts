import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { config } from './config.js';
import { applyStatusUpdate } from './featureRequests/service.js';
import type { NotifyFn } from './discord/notify.js';

const StatusUpdateBodySchema = z.object({
  featureRequestId: z.string(),
  status: z.enum(['dev_in_progress', 'pr_open', 'merged', 'deployed']),
  prNumber: z.number().int().positive().optional(),
});

export function createServer(notify: NotifyFn): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  // Called by GitHub Actions (feature-dev.yml) / Railway to report status transitions - see
  // docs/FEATURE_REQUEST_LIFECYCLE.md and applyStatusUpdate() in featureRequests/service.ts.
  app.post('/webhooks/status', async (request, reply) => {
    if (request.headers.authorization !== `Bearer ${config.statusWebhookSecret}`) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const body = StatusUpdateBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid body' });
    }

    const result = await applyStatusUpdate(body.data);
    if (result.type === 'not_found') {
      return reply.code(404).send({ error: 'feature request not found' });
    }
    if (result.type === 'invalid_transition') {
      return reply.code(409).send({ error: 'invalid status transition' });
    }

    await notify(result.discordThreadId, result.content);
    return reply.code(200).send({ ok: true });
  });

  return app;
}

export async function startServer(app: FastifyInstance): Promise<void> {
  await app.listen({ port: config.port, host: '0.0.0.0' });
}
