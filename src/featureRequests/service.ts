import { config } from '../config.js';
import { prisma } from '../db/client.js';
import type { TriageMessage, TriageVerdict } from '../ai/triage.js';
import type { DispatchFn } from '../github/dispatch.js';

export type TriageFn = (messages: TriageMessage[]) => Promise<TriageVerdict>;

export type DevStatus = 'dev_in_progress' | 'pr_open' | 'merged' | 'deployed';

export interface StatusUpdate {
  featureRequestId: string;
  status: DevStatus;
  prNumber?: number;
}

export type StatusUpdateResult =
  | { type: 'notify'; discordThreadId: string; content: string }
  | { type: 'not_found' }
  | { type: 'invalid_transition' };

export interface IncomingMessage {
  discordThreadId: string;
  guildId: string;
  authorId: string;
  content: string;
  // A forum post's starter message shares its ID with the thread itself.
  isStarterMessage: boolean;
}

export type ServiceAction = { type: 'reply'; content: string } | { type: 'none' };

export async function handleFeatureRequestMessage(
  message: IncomingMessage,
  triage: TriageFn,
  dispatch: DispatchFn,
): Promise<ServiceAction> {
  if (message.isStarterMessage) {
    return createFeatureRequest(message, triage);
  }
  return handleFollowUp(message, triage, dispatch);
}

async function createFeatureRequest(
  message: IncomingMessage,
  triage: TriageFn,
): Promise<ServiceAction> {
  const request = await prisma.featureRequest.create({
    data: {
      discordThreadId: message.discordThreadId,
      guildId: message.guildId,
      opUserId: message.authorId,
      events: {
        create: [{ author: 'op', content: message.content }],
      },
    },
  });

  return runTriageAndRespond(request.id, [{ author: 'op', content: message.content }], triage);
}

async function handleFollowUp(
  message: IncomingMessage,
  triage: TriageFn,
  dispatch: DispatchFn,
): Promise<ServiceAction> {
  const request = await prisma.featureRequest.findUnique({
    where: { discordThreadId: message.discordThreadId },
  });
  if (!request) return { type: 'none' };

  if (request.status === 'gathering_info') {
    if (message.authorId !== request.opUserId) return { type: 'none' };

    await prisma.featureRequestEvent.create({
      data: { featureRequestId: request.id, author: 'op', content: message.content },
    });
    const events = await prisma.featureRequestEvent.findMany({
      where: { featureRequestId: request.id },
      orderBy: { createdAt: 'asc' },
    });
    return runTriageAndRespond(
      request.id,
      events.map((e) => ({ author: e.author, content: e.content })),
      triage,
    );
  }

  if (request.status === 'pending_approval') {
    if (message.authorId !== config.approverDiscordUserId) return { type: 'none' };
    if (!/\bapproved\b/i.test(message.content)) return { type: 'none' };

    await dispatch({
      featureRequestId: request.id,
      discordThreadId: request.discordThreadId,
      summary: request.summary ?? '',
    });

    await prisma.featureRequest.update({
      where: { id: request.id },
      data: { status: 'approved' },
    });
    const content =
      "Approved. This has been queued for development - I'll post an update once a PR is open.";
    await prisma.featureRequestEvent.create({
      data: { featureRequestId: request.id, author: 'bot', content },
    });
    return { type: 'reply', content };
  }

  return { type: 'none' };
}

async function runTriageAndRespond(
  requestId: string,
  events: TriageMessage[],
  triage: TriageFn,
): Promise<ServiceAction> {
  const verdict = await triage(events);

  let content: string;
  if (verdict.ready) {
    content = `${verdict.summary}\n\nWaiting for <@${config.approverDiscordUserId}> to comment \`Approved\` in this thread to start development.`;
    await prisma.featureRequest.update({
      where: { id: requestId },
      data: { status: 'pending_approval', summary: verdict.summary },
    });
  } else {
    content = verdict.clarifyingQuestion ?? 'Could you share more detail about this request?';
  }

  await prisma.featureRequestEvent.create({
    data: { featureRequestId: requestId, author: 'bot', content },
  });

  return { type: 'reply', content };
}

// See docs/FEATURE_REQUEST_LIFECYCLE.md - each status only ever advances to the one next
// status in this sequence, driven by GitHub Actions / Railway calling POST /webhooks/status.
const NEXT_STATUS: Record<string, DevStatus> = {
  approved: 'dev_in_progress',
  dev_in_progress: 'pr_open',
  pr_open: 'merged',
  merged: 'deployed',
};

const STATUS_MESSAGES: Record<DevStatus, (prNumber?: number) => string> = {
  dev_in_progress: () => 'Development has started on this request.',
  pr_open: (prNumber) =>
    `A pull request is open: https://github.com/${config.githubRepo}/pull/${prNumber}`,
  merged: () => 'The pull request has been merged into main.',
  deployed: () => "This feature is live! Let us know if it doesn't behave as expected.",
};

export async function applyStatusUpdate(update: StatusUpdate): Promise<StatusUpdateResult> {
  const request = await prisma.featureRequest.findUnique({
    where: { id: update.featureRequestId },
  });
  if (!request) return { type: 'not_found' };
  if (NEXT_STATUS[request.status] !== update.status) return { type: 'invalid_transition' };

  await prisma.featureRequest.update({
    where: { id: request.id },
    data: {
      status: update.status,
      ...(update.prNumber !== undefined ? { githubPrNumber: update.prNumber } : {}),
    },
  });

  const content = STATUS_MESSAGES[update.status](update.prNumber);
  await prisma.featureRequestEvent.create({
    data: { featureRequestId: request.id, author: 'bot', content },
  });

  return { type: 'notify', discordThreadId: request.discordThreadId, content };
}
