import { Client, Events } from 'discord.js';

import { handleRoll, rollCommand } from '../commands/roll.js';

export function registerCommandHandlers(client: Client): void {
  client.once(Events.ClientReady, async (readyClient) => {
    await readyClient.application.commands.set([rollCommand.toJSON()]);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'roll') return;

    try {
      const dice = interaction.options.getString('dice', true);
      await interaction.reply(handleRoll(dice));
    } catch (error) {
      console.error('Error handling /roll command:', error);
    }
  });
}
