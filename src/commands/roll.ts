import { SlashCommandBuilder } from 'discord.js';

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 100;
export const MIN_SIDES = 1;
export const MAX_SIDES = 100;

export interface ParsedDice {
  quantity: number;
  sides: number;
}

export type ParseResult = { ok: true; dice: ParsedDice } | { ok: false; error: string };

const DICE_PATTERN = /^\s*(\d+)\s*[dD]\s*(\d+)\s*$/;

export function parseDiceNotation(input: string): ParseResult {
  const match = DICE_PATTERN.exec(input);
  if (!match) {
    return {
      ok: false,
      error: 'Invalid dice notation. Use `<quantity>d<sides>`, e.g. `1d20`.',
    };
  }

  const quantity = Number(match[1]);
  const sides = Number(match[2]);

  if (quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    return {
      ok: false,
      error: `Quantity of dice must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}.`,
    };
  }

  if (sides < MIN_SIDES || sides > MAX_SIDES) {
    return {
      ok: false,
      error: `Sides per die must be between ${MIN_SIDES} and ${MAX_SIDES}.`,
    };
  }

  return { ok: true, dice: { quantity, sides } };
}

export interface RollResult {
  rolls: number[];
  total: number;
}

export function rollDice(
  { quantity, sides }: ParsedDice,
  rng: () => number = Math.random,
): RollResult {
  const rolls: number[] = [];
  for (let i = 0; i < quantity; i++) {
    rolls.push(Math.floor(rng() * sides) + 1);
  }
  const total = rolls.reduce((sum, roll) => sum + roll, 0);
  return { rolls, total };
}

export function formatRollResult(dice: ParsedDice, result: RollResult): string {
  const notation = `${dice.quantity}d${dice.sides}`;
  if (result.rolls.length === 1) {
    return `🎲 **${notation}** → **${result.total}**`;
  }
  return `🎲 **${notation}** → [${result.rolls.join(', ')}] = **${result.total}**`;
}

export function handleRoll(input: string): string {
  const parsed = parseDiceNotation(input);
  if (!parsed.ok) {
    return parsed.error;
  }
  return formatRollResult(parsed.dice, rollDice(parsed.dice));
}

export const rollCommand = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Roll dice using notation like 1d20.')
  .addStringOption((option) =>
    option
      .setName('dice')
      .setDescription(
        `Dice notation <quantity>d<sides>, e.g. 1d20. Quantity ${MIN_QUANTITY}-${MAX_QUANTITY}, sides ${MIN_SIDES}-${MAX_SIDES}.`,
      )
      .setRequired(true),
  );
