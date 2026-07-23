import { Client, Events, GatewayIntentBits } from 'discord.js';

import { config } from '../config.js';

export function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`MrMackey logged in as ${readyClient.user.tag}`);
  });

  return client;
}

export async function login(client: Client): Promise<void> {
  await client.login(config.discordToken);
}
