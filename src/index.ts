import { config } from './config.js';
import { createDiscordClient, login } from './discord/client.js';
import { createServer, startServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  await startServer(server);
  console.log(`Health check listening on port ${config.port}`);

  const client = createDiscordClient();
  await login(client);
}

main().catch((error: unknown) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
