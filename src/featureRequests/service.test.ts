import { afterEach, describe, expect, it } from 'vitest';

import { config } from '../config.js';
import { prisma } from '../db/client.js';
import { applyStatusUpdate, handleFeatureRequestMessage } from './service.js';
import type { ConfirmationVerdict, TriageVerdict } from '../ai/triage.js';
import type { DispatchFn } from '../github/dispatch.js';
import type { ConfirmFn } from './service.js';

const threadId = `test-thread-${crypto.randomUUID()}`;
const opUserId = 'op-user-1';
const guildId = 'guild-1';

function triageReturning(verdict: TriageVerdict) {
  return async () => verdict;
}

function confirmReturning(verdict: ConfirmationVerdict): ConfirmFn {
  return async () => verdict;
}

const noopConfirm: ConfirmFn = confirmReturning({ confirmed: true, updatedSummary: 'unused' });
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
      noopConfirm,
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
      noopConfirm,
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
      noopConfirm,
      noopDispatch,
    );

    expect(action).toEqual({ type: 'none' });

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('gathering_info');
  });

  it('moves to confirming_summary once the OP provides enough detail', async () => {
    await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: opUserId,
        content: 'Add a dice roll command',
        isStarterMessage: true,
      },
      triageReturning({ ready: false, summary: null, clarifyingQuestion: 'Which dice notation?' }),
      noopConfirm,
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
      noopConfirm,
      noopDispatch,
    );

    expect(action.type).toBe('reply');
    if (action.type === 'reply') {
      expect(action.content).toContain('Add a /roll command');
      expect(action.content).toContain('Does this look right');
    }

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('confirming_summary');
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
      noopConfirm,
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
        noopConfirm,
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
      noopConfirm,
      noopDispatch,
    );

    expect(action).toEqual({ type: 'none' });

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('pending_approval');
  });

  it('routes a non-"Approved" approver message back to confirming_summary as a change request', async () => {
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
        authorId: config.approverDiscordUserId,
        content: 'Can you also support d100?',
        isStarterMessage: false,
      },
      triageReturning({ ready: true, summary: 'unused', clarifyingQuestion: null }),
      confirmReturning({ confirmed: false, updatedSummary: 'Add a /roll command, including d100' }),
      noopDispatch,
    );

    expect(action.type).toBe('reply');
    if (action.type === 'reply') {
      expect(action.content).toContain(opUserId);
      expect(action.content).toContain('Can you also support d100?');
      expect(action.content).toContain('Add a /roll command, including d100');
    }

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('confirming_summary');
    expect(request.summary).toBe('Add a /roll command, including d100');
  });
});

describe('confirming_summary', () => {
  it('moves to pending_approval when the OP confirms the summary', async () => {
    await prisma.featureRequest.create({
      data: {
        discordThreadId: threadId,
        guildId,
        opUserId,
        status: 'confirming_summary',
        summary: 'Add a /roll command',
      },
    });

    const action = await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: opUserId,
        content: 'Yes, that looks right',
        isStarterMessage: false,
      },
      triageReturning({ ready: true, summary: 'unused', clarifyingQuestion: null }),
      confirmReturning({ confirmed: true, updatedSummary: 'Add a /roll command' }),
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
  });

  it('stays in confirming_summary and updates the summary when the OP requests a change', async () => {
    await prisma.featureRequest.create({
      data: {
        discordThreadId: threadId,
        guildId,
        opUserId,
        status: 'confirming_summary',
        summary: 'Add a /roll command',
      },
    });

    const action = await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: opUserId,
        content: 'Actually cap it at 20 dice',
        isStarterMessage: false,
      },
      triageReturning({ ready: true, summary: 'unused', clarifyingQuestion: null }),
      confirmReturning({
        confirmed: false,
        updatedSummary: 'Add a /roll command, capped at 20 dice',
      }),
      noopDispatch,
    );

    expect(action).toEqual({
      type: 'reply',
      content:
        "Add a /roll command, capped at 20 dice\n\nDoes this look right, or is there anything else you'd like to add or change?",
    });

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('confirming_summary');
    expect(request.summary).toBe('Add a /roll command, capped at 20 dice');
  });

  it('ignores messages from someone other than the OP', async () => {
    await prisma.featureRequest.create({
      data: {
        discordThreadId: threadId,
        guildId,
        opUserId,
        status: 'confirming_summary',
        summary: 'Add a /roll command',
      },
    });

    const action = await handleFeatureRequestMessage(
      {
        discordThreadId: threadId,
        guildId,
        authorId: 'someone-else',
        content: 'looks good to me',
        isStarterMessage: false,
      },
      triageReturning({ ready: true, summary: 'unused', clarifyingQuestion: null }),
      confirmReturning({ confirmed: true, updatedSummary: 'unused' }),
      noopDispatch,
    );

    expect(action).toEqual({ type: 'none' });

    const request = await prisma.featureRequest.findUniqueOrThrow({
      where: { discordThreadId: threadId },
    });
    expect(request.status).toBe('confirming_summary');
  });
});

describe('applyStatusUpdate', () => {
  it('returns not_found for an unknown feature request id', async () => {
    const result = await applyStatusUpdate({
      featureRequestId: 'does-not-exist',
      status: 'dev_in_progress',
    });
    expect(result).toEqual({ type: 'not_found' });
  });

  it('advances approved -> dev_in_progress and returns a notify result', async () => {
    const request = await prisma.featureRequest.create({
      data: { discordThreadId: threadId, guildId, opUserId, status: 'approved' },
    });

    const result = await applyStatusUpdate({
      featureRequestId: request.id,
      status: 'dev_in_progress',
    });

    expect(result).toEqual({
      type: 'notify',
      discordThreadId: threadId,
      content: 'Development has started on this request.',
    });

    const updated = await prisma.featureRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe('dev_in_progress');
  });

  it('records the PR number and links it on pr_open', async () => {
    const request = await prisma.featureRequest.create({
      data: { discordThreadId: threadId, guildId, opUserId, status: 'dev_in_progress' },
    });

    const result = await applyStatusUpdate({
      featureRequestId: request.id,
      status: 'pr_open',
      prNumber: 42,
    });

    expect(result.type).toBe('notify');
    if (result.type === 'notify') {
      expect(result.content).toContain(`${config.githubRepo}/pull/42`);
    }

    const updated = await prisma.featureRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe('pr_open');
    expect(updated.githubPrNumber).toBe(42);
  });

  it('rejects a transition that skips a step', async () => {
    const request = await prisma.featureRequest.create({
      data: { discordThreadId: threadId, guildId, opUserId, status: 'approved' },
    });

    const result = await applyStatusUpdate({ featureRequestId: request.id, status: 'merged' });

    expect(result).toEqual({ type: 'invalid_transition' });

    const unchanged = await prisma.featureRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(unchanged.status).toBe('approved');
  });

  it('records a bot event alongside the status change', async () => {
    const request = await prisma.featureRequest.create({
      data: { discordThreadId: threadId, guildId, opUserId, status: 'pr_open' },
    });

    await applyStatusUpdate({ featureRequestId: request.id, status: 'merged' });

    const events = await prisma.featureRequestEvent.findMany({
      where: { featureRequestId: request.id },
    });
    expect(events).toEqual([
      expect.objectContaining({
        author: 'bot',
        content: 'The pull request has been merged into main.',
      }),
    ]);
  });
});
