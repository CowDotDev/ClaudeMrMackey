import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent config.ts's `dotenv/config` import from reloading the real .env and
// silently undoing the env vars this test sets/deletes.
vi.mock('dotenv/config', () => ({}));

describe('config', () => {
  const originalToken = process.env.DISCORD_BOT_TOKEN;
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalToken !== undefined) process.env.DISCORD_BOT_TOKEN = originalToken;
    if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
  });

  it('throws when DISCORD_BOT_TOKEN is missing', async () => {
    await expect(import('./config.js')).rejects.toThrow(/DISCORD_BOT_TOKEN/);
  });

  it('loads config when required env vars are set', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    process.env.DATABASE_URL = 'postgresql://test';
    const { config } = await import('./config.js');
    expect(config.discordToken).toBe('test-token');
    expect(config.databaseUrl).toBe('postgresql://test');
  });
});
