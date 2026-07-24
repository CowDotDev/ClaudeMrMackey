import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  discordToken: requireEnv('DISCORD_BOT_TOKEN'),
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: requireEnv('DATABASE_URL'),
  anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
  featureRequestChannelId: requireEnv('FEATURE_REQUEST_CHANNEL_ID'),
  approverDiscordUserId: requireEnv('APPROVER_DISCORD_USER_ID'),
  githubToken: requireEnv('GITHUB_TOKEN'),
  githubRepo: requireEnv('GITHUB_REPO'),
  statusWebhookSecret: requireEnv('STATUS_WEBHOOK_SECRET'),
};
