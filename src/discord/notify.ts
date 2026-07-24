import { Client } from 'discord.js';

export type NotifyFn = (discordThreadId: string, content: string) => Promise<void>;

export function createDiscordNotifier(client: Client): NotifyFn {
  return async (discordThreadId, content) => {
    const channel = await client.channels.fetch(discordThreadId);
    if (!channel?.isThread()) return;
    await channel.send(content);
  };
}
