import { describe, expect, it, vi } from 'vitest';

import { triageFeatureRequest } from './triage.js';

function fakeClient(parsed_output: unknown) {
  return {
    messages: {
      parse: vi.fn().mockResolvedValue({ parsed_output }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('triageFeatureRequest', () => {
  it('formats the conversation and returns the parsed verdict', async () => {
    const verdict = { ready: true, summary: 'Add a /roll command', clarifyingQuestion: null };
    const client = fakeClient(verdict);

    const result = await triageFeatureRequest(
      [
        { author: 'op', content: 'Add a dice roll command' },
        { author: 'bot', content: 'What dice notation should it support?' },
        { author: 'op', content: '1d20 and similar' },
      ],
      client,
    );

    expect(result).toEqual(verdict);
    expect(client.messages.parse).toHaveBeenCalledTimes(1);

    const call = client.messages.parse.mock.calls[0][0];
    expect(call.model).toBe('claude-opus-4-8');
    expect(call.messages[0].content).toBe(
      'Requester: Add a dice roll command\n\nBot: What dice notation should it support?\n\nRequester: 1d20 and similar',
    );
  });

  it('throws when the response has no parsed output', async () => {
    const client = fakeClient(null);
    await expect(triageFeatureRequest([{ author: 'op', content: 'hi' }], client)).rejects.toThrow(
      /did not match the expected schema/,
    );
  });
});
