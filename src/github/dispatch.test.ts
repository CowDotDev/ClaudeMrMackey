import { describe, expect, it, vi } from 'vitest';

import { dispatchFeatureRequest } from './dispatch.js';
import { config } from '../config.js';

function fakeClient() {
  return {
    repos: {
      createDispatchEvent: vi.fn().mockResolvedValue(undefined),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('dispatchFeatureRequest', () => {
  it('fires a repository_dispatch event with the feature-request payload', async () => {
    const client = fakeClient();
    const payload = {
      featureRequestId: 'req-1',
      discordThreadId: 'thread-1',
      summary: 'Add a /roll command',
    };

    await dispatchFeatureRequest(payload, client);

    expect(client.repos.createDispatchEvent).toHaveBeenCalledTimes(1);
    const [owner, repo] = config.githubRepo.split('/');
    expect(client.repos.createDispatchEvent).toHaveBeenCalledWith({
      owner,
      repo,
      event_type: 'feature-request-approved',
      client_payload: payload,
    });
  });
});
