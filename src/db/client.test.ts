import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from './client.js';

describe('prisma FeatureRequest model', () => {
  const threadId = `test-thread-${crypto.randomUUID()}`;

  afterEach(async () => {
    await prisma.featureRequest.deleteMany({ where: { discordThreadId: threadId } });
  });

  it('creates a feature request with events and reads it back', async () => {
    const created = await prisma.featureRequest.create({
      data: {
        discordThreadId: threadId,
        guildId: 'guild-1',
        opUserId: 'user-1',
        events: {
          create: [{ author: 'op', content: 'Please add a /roll command' }],
        },
      },
      include: { events: true },
    });

    expect(created.status).toBe('gathering_info');
    expect(created.events).toHaveLength(1);

    const found = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(found.id).toBe(created.id);
  });
});
