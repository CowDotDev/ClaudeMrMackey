import { SlashCommandBuilder } from 'discord.js';

export type CoinSide = 'Heads' | 'Tails';

export function flipCoin(rng: () => number = Math.random): CoinSide {
  return rng() < 0.5 ? 'Heads' : 'Tails';
}

export function formatCoinResult(side: CoinSide): string {
  return `🪙 **${side}**`;
}

export function handleCoinFlip(rng: () => number = Math.random): string {
  return formatCoinResult(flipCoin(rng));
}

export const coinflipCommand = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Flip a coin and get heads or tails.');
