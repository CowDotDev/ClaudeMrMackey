import { prisma } from '../db/client.js';

export interface CustomCommandRecord {
  keyword: string;
  response: string;
}

// "list" is reserved for the built-in !list command and can never be registered or removed.
export const PROTECTED_KEYWORDS = ['list'] as const;

const KEYWORD_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAX_RESPONSE_LENGTH = 1900;
const URL_PATTERN = /(https?:\/\/\S+)/gi;

export function normalizeKeyword(raw: string): string {
  return raw.trim().replace(/^!+/, '').toLowerCase();
}

export function isProtectedKeyword(keyword: string): boolean {
  return (PROTECTED_KEYWORDS as readonly string[]).includes(keyword);
}

export type KeywordValidation = { ok: true; keyword: string } | { ok: false; error: string };

export function validateKeyword(raw: string): KeywordValidation {
  const keyword = normalizeKeyword(raw);
  if (!KEYWORD_PATTERN.test(keyword)) {
    return {
      ok: false,
      error:
        'Keywords must be 1-32 characters using letters, numbers, hyphens or underscores, and start with a letter or number.',
    };
  }
  return { ok: true, keyword };
}

export type ResponseValidation = { ok: true; response: string } | { ok: false; error: string };

export function validateResponse(raw: string): ResponseValidation {
  const response = raw.trim();
  if (response.length === 0) {
    return { ok: false, error: 'The response cannot be empty.' };
  }
  if (response.length > MAX_RESPONSE_LENGTH) {
    return { ok: false, error: `The response must be ${MAX_RESPONSE_LENGTH} characters or fewer.` };
  }
  return { ok: true, response };
}

// Wrap URLs in backticks so !list can't be used to make the bot post unfurling/clickable
// links on someone else's behalf.
export function wrapUrls(text: string): string {
  return text.replace(URL_PATTERN, '`$1`');
}

export function formatCommandList(commands: CustomCommandRecord[]): string {
  if (commands.length === 0) {
    return 'No custom commands have been configured yet. Add one with `/on <keyword> <response>`.';
  }
  const sorted = [...commands].sort((a, b) => a.keyword.localeCompare(b.keyword));
  const lines = sorted.map((c) => `• \`!${c.keyword}\` → ${wrapUrls(c.response)}`);
  return `**Custom commands:**\n${lines.join('\n')}`;
}

export function parseTrigger(content: string): string | null {
  const match = /^!([^\s]+)\s*$/.exec(content.trim());
  const raw = match?.[1];
  if (!raw) return null;
  return normalizeKeyword(raw);
}

export async function findCommand(
  guildId: string,
  keyword: string,
): Promise<CustomCommandRecord | null> {
  const command = await prisma.customCommand.findUnique({
    where: { guildId_keyword: { guildId, keyword } },
  });
  return command ? { keyword: command.keyword, response: command.response } : null;
}

export async function listCommands(guildId: string): Promise<CustomCommandRecord[]> {
  const commands = await prisma.customCommand.findMany({
    where: { guildId },
    orderBy: { keyword: 'asc' },
  });
  return commands.map((c) => ({ keyword: c.keyword, response: c.response }));
}

export type RegisterResult =
  | { type: 'invalid'; message: string }
  | { type: 'protected'; message: string }
  | { type: 'saved'; message: string }
  | { type: 'needs_confirmation'; message: string; keyword: string; response: string };

export async function registerCommand(
  guildId: string,
  rawKeyword: string,
  rawResponse: string,
): Promise<RegisterResult> {
  const keywordCheck = validateKeyword(rawKeyword);
  if (!keywordCheck.ok) return { type: 'invalid', message: keywordCheck.error };

  const responseCheck = validateResponse(rawResponse);
  if (!responseCheck.ok) return { type: 'invalid', message: responseCheck.error };

  const { keyword } = keywordCheck;
  const { response } = responseCheck;

  if (isProtectedKeyword(keyword)) {
    return {
      type: 'protected',
      message: `\`${keyword}\` is a protected keyword and cannot be overwritten.`,
    };
  }

  const existing = await findCommand(guildId, keyword);
  if (existing) {
    return {
      type: 'needs_confirmation',
      keyword,
      response,
      message: `\`!${keyword}\` already exists (currently: ${wrapUrls(existing.response)}). Update it to the new response?`,
    };
  }

  await saveCommand(guildId, keyword, response);
  return { type: 'saved', message: `Registered \`!${keyword}\`.` };
}

export async function saveCommand(
  guildId: string,
  keyword: string,
  response: string,
): Promise<void> {
  await prisma.customCommand.upsert({
    where: { guildId_keyword: { guildId, keyword } },
    create: { guildId, keyword, response },
    update: { response },
  });
}

export type RemoveResult =
  | { type: 'not_found'; message: string }
  | { type: 'invalid'; message: string }
  | { type: 'needs_confirmation'; message: string; keyword: string };

export async function removeCommand(guildId: string, rawKeyword: string): Promise<RemoveResult> {
  const keywordCheck = validateKeyword(rawKeyword);
  if (!keywordCheck.ok) return { type: 'invalid', message: keywordCheck.error };

  const { keyword } = keywordCheck;
  const existing = await findCommand(guildId, keyword);
  if (!existing) {
    return { type: 'not_found', message: `There is no \`!${keyword}\` command to remove.` };
  }

  return {
    type: 'needs_confirmation',
    keyword,
    message: `Remove \`!${keyword}\`? This can't be undone.`,
  };
}

export async function deleteCommand(guildId: string, keyword: string): Promise<boolean> {
  const result = await prisma.customCommand.deleteMany({ where: { guildId, keyword } });
  return result.count > 0;
}

export type TriggerResult = { type: 'reply'; content: string } | { type: 'none' };

export async function handleTrigger(guildId: string, content: string): Promise<TriggerResult> {
  const keyword = parseTrigger(content);
  if (keyword === null) return { type: 'none' };

  if (keyword === 'list') {
    const commands = await listCommands(guildId);
    return { type: 'reply', content: formatCommandList(commands) };
  }

  const command = await findCommand(guildId, keyword);
  if (!command) return { type: 'none' };
  return { type: 'reply', content: command.response };
}
