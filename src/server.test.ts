import { afterEach, describe, expect, it } from 'vitest';

import { config } from './config.js';
import { prisma } from './db/client.js';
import { createServer } from './server.js';
import type { NotifyFn } from './discord/notify.js';

const threadId = `test-thread-${crypto.randomUUID()}`;
const noopNotify: NotifyFn = async () => {};

afterEach(async () => {
  await prisma.featureRequest.deleteMany({ where: { discordThreadId: threadId } });
});

describe('GET /health', () => {
  it('responds ok', async () => {
    const app = createServer(noopNotify);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /webhooks/status', () => {
  it('rejects requests with a missing or wrong bearer token', async () => {
    const app = createServer(noopNotify);

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/status',
      payload: { featureRequestId: 'x', status: 'pr_open' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a body that does not match the schema', async () => {
    const app = createServer(noopNotify);

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/status',
      headers: { authorization: `Bearer ${config.statusWebhookSecret}` },
      payload: { featureRequestId: 'x', status: 'not-a-real-status' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 for an unknown feature request', async () => {
    const app = createServer(noopNotify);

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/status',
      headers: { authorization: `Bearer ${config.statusWebhookSecret}` },
      payload: { featureRequestId: 'does-not-exist', status: 'pr_open' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 409 for an invalid transition', async () => {
    const request = await prisma.featureRequest.create({
      data: { discordThreadId: threadId, guildId: 'guild-1', opUserId: 'op-1', status: 'approved' },
    });
    const app = createServer(noopNotify);

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/status',
      headers: { authorization: `Bearer ${config.statusWebhookSecret}` },
      payload: { featureRequestId: request.id, status: 'merged' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('applies a valid transition and notifies the originating thread', async () => {
    const request = await prisma.featureRequest.create({
      data: { discordThreadId: threadId, guildId: 'guild-1', opUserId: 'op-1', status: 'approved' },
    });
    const notified: Array<[string, string]> = [];
    const notify: NotifyFn = async (id, content) => {
      notified.push([id, content]);
    };
    const app = createServer(notify);

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/status',
      headers: { authorization: `Bearer ${config.statusWebhookSecret}` },
      payload: { featureRequestId: request.id, status: 'dev_in_progress' },
    });

    expect(response.statusCode).toBe(200);
    expect(notified).toEqual([[threadId, 'Development has started on this request.']]);
  });
});
