import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  const original = process.env.DISCORD_BOT_TOKEN;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.DISCORD_BOT_TOKEN;
  });

  afterEach(() => {
    if (original !== undefined) process.env.DISCORD_BOT_TOKEN = original;
  });

  it('throws when DISCORD_BOT_TOKEN is missing', async () => {
    await expect(import('./config.js')).rejects.toThrow(/DISCORD_BOT_TOKEN/);
  });

  it('loads config when DISCORD_BOT_TOKEN is set', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    const { config } = await import('./config.js');
    expect(config.discordToken).toBe('test-token');
  });
});
