import { Client, Events } from 'discord.js';

import { coinflipCommand, handleCoinFlip } from '../commands/coinflip.js';
import { handleRoll, rollCommand } from '../commands/roll.js';

export function registerCommandHandlers(client: Client): void {
  client.once(Events.ClientReady, async (readyClient) => {
    await readyClient.application.commands.set([rollCommand.toJSON(), coinflipCommand.toJSON()]);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === 'roll') {
        const dice = interaction.options.getString('dice', true);
        await interaction.reply(handleRoll(dice));
      } else if (interaction.commandName === 'coinflip') {
        await interaction.reply(handleCoinFlip());
      }
    } catch (error) {
      console.error(`Error handling /${interaction.commandName} command:`, error);
    }
  });
}
