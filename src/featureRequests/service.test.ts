import { afterEach, describe, expect, it } from 'vitest';

import { config } from '../config.js';
import { prisma } from '../db/client.js';
import { handleFeatureRequestMessage } from './service.js';
import type { TriageVerdict } from '../ai/triage.js';
import type { DispatchFn } from '../github/dispatch.js';

const threadId = `test-thread-${crypto.randomUUID()}`;
const opUserId = 'op-user-1';
const guildId = 'guild-1';

function triageReturning(verdict: TriageVerdict) {
  return async () => verdict;
}

const noopDispatch: DispatchFn = async () => {};

afterEach(async () => {
  await prisma.featureRequest.deleteMany({ where: { discordThreadId: threadId } });
});

describe('handleFeatureRequestMessage', () => {
  it('creates a gathering_info request and asks a clarifying question when not ready', async () => {
    const action = await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: opUserId,
        content: 'Add a dice roll command',
        isStarterMessage: true,
      },
      triageReturning({ ready: false, summary: null, clarifyingQuestion: 'Which dice notation?' }),
      noopDispatch,
    );

    expect(action).toEqual({ type: 'reply', content: 'Which dice notation?' });

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('gathering_info');
    expect(request.opUserId).toBe(opUserId);
  });

  it('ignores follow-up messages from users other than the OP', async () => {
    await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: opUserId,
        content: 'Add a dice roll command',
        isStarterMessage: true,
      },
      triageReturning({ ready: false, summary: null, clarifyingQuestion: 'Which dice notation?' }),
      noopDispatch,
    );

    const action = await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: 'someone-else',
        content: 'I think 1d20 would be cool',
        isStarterMessage: false,
      },
      triageReturning({ ready: true, summary: 'should not be reached', clarifyingQuestion: null }),
      noopDispatch,
    );

    expect(action).toEqual({ type: 'none' });

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('gathering_info');
  });

  it('moves to pending_approval once the OP provides enough detail', async () => {
    await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: opUserId,
        content: 'Add a dice roll command',
        isStarterMessage: true,
      },
      triageReturning({ ready: false, summary: null, clarifyingQuestion: 'Which dice notation?' }),
      noopDispatch,
    );

    const action = await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: opUserId,
        content: '1d20 and 2d6',
        isStarterMessage: false,
      },
      triageReturning({ ready: true, summary: 'Add a /roll command', clarifyingQuestion: null }),
      noopDispatch,
    );

    expect(action.type).toBe('reply');
    if (action.type === 'reply') {
      expect(action.content).toContain('Add a /roll command');
      expect(action.content).toContain(config.approverDiscordUserId);
    }

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('pending_approval');
    expect(request.summary).toBe('Add a /roll command');
  });

  it('approves the request and dispatches to GitHub when the configured approver comments "Approved"', async () => {
    const created = await prisma.featureRequest.create({
      data: {
        discordThreadId: threadId,
        guildId,
        opUserId,
        status: 'pending_approval',
        summary: 'Add a /roll command',
      },
    });

    const dispatched: unknown[] = [];
    const dispatch: DispatchFn = async (payload) => {
      dispatched.push(payload);
    };

    const action = await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: config.approverDiscordUserId,
        content: 'Approved',
        isStarterMessage: false,
      },
      triageReturning({ ready: true, summary: 'unused', clarifyingQuestion: null }),
      dispatch,
    );

    expect(action.type).toBe('reply');
    expect(dispatched).toEqual([
      {
        featureRequestId: created.id,
        discordThreadId: threadId,
        summary: 'Add a /roll command',
      },
    ]);

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('approved');
  });

  it('leaves the request pending_approval if the GitHub dispatch fails', async () => {
    await prisma.featureRequest.create({
      data: {
        discordThreadId: threadId,
        guildId,
        opUserId,
        status: 'pending_approval',
        summary: 'Add a /roll command',
      },
    });

    const failingDispatch: DispatchFn = async () => {
      throw new Error('GitHub API unavailable');
    };

    await expect(
      handleFeatureRequestMessage(
        {
          discordThreadId: threadId,
          guildId,
          authorId: config.approverDiscordUserId,
          content: 'Approved',
          isStarterMessage: false,
        },
        triageReturning({ ready: true, summary: 'unused', clarifyingQuestion: null }),
        failingDispatch,
      ),
    ).rejects.toThrow('GitHub API unavailable');

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('pending_approval');
  });

  it('ignores an "Approved" comment from someone other than the configured approver', async () => {
    await prisma.featureRequest.create({
      data: {
        discordThreadId: threadId,
        guildId,
        opUserId,
        status: 'pending_approval',
        summary: 'Add a /roll command',
      },
    });

    const action = await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: 'not-the-approver',
        content: 'Approved',
        isStarterMessage: false,
      },
      triageReturning({ ready: true, summary: 'unused', clarifyingQuestion: null }),
      noopDispatch,
    );

    expect(action).toEqual({ type: 'none' });

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('pending_approval');
  });
});
