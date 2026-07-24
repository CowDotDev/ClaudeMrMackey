import { describe, expect, it, vi } from 'vitest';

import { createDiscordNotifier } from './notify.js';

function fakeClient(channel: unknown) {
  return {
    channels: {
      fetch: vi.fn().mockResolvedValue(channel),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('createDiscordNotifier', () => {
  it('sends the message into the fetched thread', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ isThread: () => true, send });

    const notify = createDiscordNotifier(client);
    await notify('thread-1', 'hello');

    expect(client.channels.fetch).toHaveBeenCalledWith('thread-1');
    expect(send).toHaveBeenCalledWith('hello');
  });

  it('does nothing if the fetched channel is not a thread', async () => {
    const send = vi.fn();
    const client = fakeClient({ isThread: () => false, send });

    const notify = createDiscordNotifier(client);
    await notify('thread-1', 'hello');

    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing if the channel cannot be fetched', async () => {
    const client = fakeClient(null);

    const notify = createDiscordNotifier(client);
    await expect(notify('thread-1', 'hello')).resolves.toBeUndefined();
  });
});
