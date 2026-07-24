import { Octokit } from '@octokit/rest';

import { config } from '../config.js';

export interface FeatureRequestDispatchPayload {
  featureRequestId: string;
  discordThreadId: string;
  summary: string;
}

export type DispatchFn = (payload: FeatureRequestDispatchPayload) => Promise<void>;

const DISPATCH_EVENT_TYPE = 'feature-request-approved';

const defaultClient = new Octokit({ auth: config.githubToken });

export async function dispatchFeatureRequest(
  payload: FeatureRequestDispatchPayload,
  client: Octokit = defaultClient,
): Promise<void> {
  const [owner, repo] = config.githubRepo.split('/');
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPO must be in "owner/repo" format, got: ${config.githubRepo}`);
  }

  await client.repos.createDispatchEvent({
    owner,
    repo,
    event_type: DISPATCH_EVENT_TYPE,
    client_payload: { ...payload },
  });
}
