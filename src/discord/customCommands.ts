import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';

import {
  deleteCommand,
  handleTrigger,
  registerCommand,
  removeCommand,
  saveCommand,
} from '../customCommands/service.js';

export const onCommand = new SlashCommandBuilder()
  .setName('on')
  .setDescription('Register a custom !keyword that replies with a response or URL.')
  .addStringOption((option) =>
    option
      .setName('keyword')
      .setDescription('The keyword, triggered later with !keyword.')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('response').setDescription('The text or URL to reply with.').setRequired(true),
  );

export const removeCustomCommand = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove a custom !keyword.')
  .addStringOption((option) =>
    option.setName('keyword').setDescription('The keyword to remove.').setRequired(true),
  );

type PendingConfirmation =
  | { kind: 'register'; guildId: string; keyword: string; response: string }
  | { kind: 'remove'; guildId: string; keyword: string };

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

const pending = new Map<string, PendingConfirmation>();

function confirmationRow(token: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cc-confirm:${token}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cc-cancel:${token}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}

function rememberConfirmation(token: string, confirmation: PendingConfirmation): void {
  pending.set(token, confirmation);
  setTimeout(() => pending.delete(token), CONFIRMATION_TTL_MS).unref?.();
}

async function handleOn(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'Custom commands can only be used inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const keyword = interaction.options.getString('keyword', true);
  const response = interaction.options.getString('response', true);
  const result = await registerCommand(interaction.guildId, keyword, response);

  if (result.type === 'needs_confirmation') {
    rememberConfirmation(interaction.id, {
      kind: 'register',
      guildId: interaction.guildId,
      keyword: result.keyword,
      response: result.response,
    });
    await interaction.reply({
      content: result.message,
      components: [confirmationRow(interaction.id)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'Custom commands can only be used inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const keyword = interaction.options.getString('keyword', true);
  const result = await removeCommand(interaction.guildId, keyword);

  if (result.type === 'needs_confirmation') {
    rememberConfirmation(interaction.id, {
      kind: 'remove',
      guildId: interaction.guildId,
      keyword: result.keyword,
    });
    await interaction.reply({
      content: result.message,
      components: [confirmationRow(interaction.id)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [action, token] = interaction.customId.split(':');
  if (action !== 'cc-confirm' && action !== 'cc-cancel') return;
  if (!token) return;

  const confirmation = pending.get(token);
  if (!confirmation) {
    await interaction.update({ content: 'This confirmation has expired.', components: [] });
    return;
  }
  pending.delete(token);

  if (action === 'cc-cancel') {
    await interaction.update({ content: 'Cancelled - nothing was changed.', components: [] });
    return;
  }

  if (confirmation.kind === 'register') {
    await saveCommand(confirmation.guildId, confirmation.keyword, confirmation.response);
    await interaction.update({
      content: `Updated \`!${confirmation.keyword}\`.`,
      components: [],
    });
    return;
  }

  const removed = await deleteCommand(confirmation.guildId, confirmation.keyword);
  await interaction.update({
    content: removed
      ? `Removed \`!${confirmation.keyword}\`.`
      : `\`!${confirmation.keyword}\` no longer exists.`,
    components: [],
  });
}

export function registerCustomCommandHandlers(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'on') {
          await handleOn(interaction);
        } else if (interaction.commandName === 'remove') {
          await handleRemove(interaction);
        }
      } else if (interaction.isButton()) {
        await handleButton(interaction);
      }
    } catch (error) {
      console.error('Error handling custom-command interaction:', error);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.guildId) return;

    try {
      const result = await handleTrigger(message.guildId, message.content);
      if (result.type === 'reply') {
        await message.reply(result.content);
      }
    } catch (error) {
      console.error('Error handling custom-command trigger:', error);
    }
  });
}
