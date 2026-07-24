import { config } from './config.js';
import { createDiscordClient, login } from './discord/client.js';
import { registerCommandHandlers } from './discord/commands.js';
import { registerFeatureRequestHandlers } from './discord/featureRequests.js';
import { createDiscordNotifier } from './discord/notify.js';
import { createServer, startServer } from './server.js';

async function main(): Promise<void> {
  const client = createDiscordClient();
  registerCommandHandlers(client);
  registerFeatureRequestHandlers(client);

  const server = createServer(createDiscordNotifier(client));
  await startServer(server);
  console.log(`Health check listening on port ${config.port}`);

  await login(client);
}

main().catch((error: unknown) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
