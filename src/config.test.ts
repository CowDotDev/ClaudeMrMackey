import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent config.ts's `dotenv/config` import from reloading the real .env and
// silently undoing the env vars this test sets/deletes.
vi.mock('dotenv/config', () => ({}));

const REQUIRED_VARS = [
  'DISCORD_BOT_TOKEN',
  'DATABASE_URL',
  'ANTHROPIC_API_KEY',
  'FEATURE_REQUEST_CHANNEL_ID',
  'APPROVER_DISCORD_USER_ID',
  'GITHUB_TOKEN',
  'GITHUB_REPO',
  'STATUS_WEBHOOK_SECRET',
] as const;

describe('config', () => {
  const originalValues = Object.fromEntries(REQUIRED_VARS.map((name) => [name, process.env[name]]));

  beforeEach(() => {
    vi.resetModules();
    for (const name of REQUIRED_VARS) delete process.env[name];
  });

  afterEach(() => {
    for (const name of REQUIRED_VARS) {
      const original = originalValues[name];
      if (original !== undefined) process.env[name] = original;
    }
  });

  it('throws when DISCORD_BOT_TOKEN is missing', async () => {
    await expect(import('./config.js')).rejects.toThrow(/DISCORD_BOT_TOKEN/);
  });

  it('loads config when required env vars are set', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.FEATURE_REQUEST_CHANNEL_ID = 'channel-1';
    process.env.APPROVER_DISCORD_USER_ID = 'user-1';
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_REPO = 'CowDotDev/ClaudeMrMackey';
    process.env.STATUS_WEBHOOK_SECRET = 'test-webhook-secret';

    const { config } = await import('./config.js');
    expect(config.discordToken).toBe('test-token');
    expect(config.databaseUrl).toBe('postgresql://test');
    expect(config.anthropicApiKey).toBe('sk-ant-test');
    expect(config.featureRequestChannelId).toBe('channel-1');
    expect(config.approverDiscordUserId).toBe('user-1');
    expect(config.githubToken).toBe('ghp_test');
    expect(config.githubRepo).toBe('CowDotDev/ClaudeMrMackey');
    expect(config.statusWebhookSecret).toBe('test-webhook-secret');
  });
});
