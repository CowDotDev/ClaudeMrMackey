import { Client, Events } from 'discord.js';

import { config } from '../config.js';
import { triageFeatureRequest } from '../ai/triage.js';
import { dispatchFeatureRequest } from '../github/dispatch.js';
import { handleFeatureRequestMessage } from '../featureRequests/service.js';

export function registerFeatureRequestHandlers(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;
    if (message.channel.parentId !== config.featureRequestChannelId) return;

    try {
      const action = await handleFeatureRequestMessage(
        {
          discordThreadId: message.channel.id,
          guildId: message.guildId ?? '',
          authorId: message.author.id,
          content: message.content,
          isStarterMessage: message.id === message.channel.id,
        },
        triageFeatureRequest,
        dispatchFeatureRequest,
      );

      if (action.type === 'reply') {
        await message.reply(action.content);
      }
    } catch (error) {
      console.error('Error handling feature-request message:', error);
    }
  });
}
