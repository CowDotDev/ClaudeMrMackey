import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '../db/client.js';
import {
  formatCommandList,
  handleTrigger,
  normalizeKeyword,
  parseTrigger,
  registerCommand,
  removeCommand,
  deleteCommand,
  saveCommand,
  validateKeyword,
  validateResponse,
  wrapUrls,
} from './service.js';

const guildId = `test-guild-${crypto.randomUUID()}`;
const otherGuildId = `test-guild-${crypto.randomUUID()}`;

afterEach(async () => {
  await prisma.customCommand.deleteMany({ where: { guildId: { in: [guildId, otherGuildId] } } });
});

describe('normalizeKeyword', () => {
  it('lowercases, trims and strips a leading bang', () => {
    expect(normalizeKeyword('  Pizza ')).toBe('pizza');
    expect(normalizeKeyword('!PIZZA')).toBe('pizza');
    expect(normalizeKeyword('!!foo')).toBe('foo');
  });
});

describe('validateKeyword', () => {
  it('accepts simple keywords', () => {
    expect(validateKeyword('pizza')).toEqual({ ok: true, keyword: 'pizza' });
    expect(validateKeyword('my-command_2')).toEqual({ ok: true, keyword: 'my-command_2' });
  });

  it('rejects keywords with whitespace or illegal characters', () => {
    expect(validateKeyword('two words').ok).toBe(false);
    expect(validateKeyword('bad!char').ok).toBe(false);
    expect(validateKeyword('').ok).toBe(false);
  });

  it('rejects keywords longer than 32 characters', () => {
    expect(validateKeyword('a'.repeat(33)).ok).toBe(false);
  });
});

describe('validateResponse', () => {
  it('trims and accepts non-empty responses', () => {
    expect(validateResponse('  hello ')).toEqual({ ok: true, response: 'hello' });
  });

  it('rejects empty responses', () => {
    expect(validateResponse('   ').ok).toBe(false);
  });

  it('rejects responses that are too long', () => {
    expect(validateResponse('a'.repeat(2000)).ok).toBe(false);
  });
});

describe('wrapUrls', () => {
  it('wraps http and https URLs in backticks', () => {
    expect(wrapUrls('http://imageurl.com/1234')).toBe('`http://imageurl.com/1234`');
    expect(wrapUrls('see https://example.com now')).toBe('see `https://example.com` now');
  });

  it('leaves plain text untouched', () => {
    expect(wrapUrls('just some text')).toBe('just some text');
  });
});

describe('parseTrigger', () => {
  it('extracts and normalizes the keyword', () => {
    expect(parseTrigger('!pizza')).toBe('pizza');
    expect(parseTrigger('  !Pizza  ')).toBe('pizza');
    expect(parseTrigger('!list')).toBe('list');
  });

  it('returns null for non-trigger messages', () => {
    expect(parseTrigger('pizza')).toBeNull();
    expect(parseTrigger('!two words')).toBeNull();
    expect(parseTrigger('hello !pizza')).toBeNull();
    expect(parseTrigger('!')).toBeNull();
  });
});

describe('formatCommandList', () => {
  it('reports when there are no commands', () => {
    expect(formatCommandList([])).toContain('No custom commands');
  });

  it('lists commands alphabetically with URLs wrapped in backticks', () => {
    const output = formatCommandList([
      { keyword: 'pizza', response: 'http://imageurl.com/1234' },
      { keyword: 'hello', response: 'world' },
    ]);
    expect(output.indexOf('!hello')).toBeLessThan(output.indexOf('!pizza'));
    expect(output).toContain('`!pizza` → `http://imageurl.com/1234`');
    expect(output).toContain('`!hello` → world');
  });
});

describe('registerCommand', () => {
  it('registers a brand-new keyword', async () => {
    const result = await registerCommand(guildId, 'pizza', 'http://imageurl.com/1234');
    expect(result.type).toBe('saved');

    const stored = await prisma.customCommand.findUnique({
      where: { guildId_keyword: { guildId, keyword: 'pizza' } },
    });
    expect(stored?.response).toBe('http://imageurl.com/1234');
  });

  it('normalizes the keyword before storing', async () => {
    await registerCommand(guildId, '!PIZZA', 'slice');
    const stored = await prisma.customCommand.findUnique({
      where: { guildId_keyword: { guildId, keyword: 'pizza' } },
    });
    expect(stored?.response).toBe('slice');
  });

  it('asks for confirmation when the keyword already exists and does not overwrite yet', async () => {
    await saveCommand(guildId, 'pizza', 'original');
    const result = await registerCommand(guildId, 'pizza', 'updated');
    expect(result.type).toBe('needs_confirmation');
    if (result.type === 'needs_confirmation') {
      expect(result.keyword).toBe('pizza');
      expect(result.response).toBe('updated');
    }

    const stored = await prisma.customCommand.findUnique({
      where: { guildId_keyword: { guildId, keyword: 'pizza' } },
    });
    expect(stored?.response).toBe('original');
  });

  it('refuses to overwrite the protected "list" keyword', async () => {
    const result = await registerCommand(guildId, 'list', 'nope');
    expect(result.type).toBe('protected');

    const stored = await prisma.customCommand.findUnique({
      where: { guildId_keyword: { guildId, keyword: 'list' } },
    });
    expect(stored).toBeNull();
  });

  it('rejects invalid keywords', async () => {
    const result = await registerCommand(guildId, 'two words', 'x');
    expect(result.type).toBe('invalid');
  });

  it('keeps commands scoped per guild', async () => {
    await registerCommand(guildId, 'pizza', 'here');
    await registerCommand(otherGuildId, 'pizza', 'there');

    const mine = await prisma.customCommand.findUnique({
      where: { guildId_keyword: { guildId, keyword: 'pizza' } },
    });
    const theirs = await prisma.customCommand.findUnique({
      where: { guildId_keyword: { guildId: otherGuildId, keyword: 'pizza' } },
    });
    expect(mine?.response).toBe('here');
    expect(theirs?.response).toBe('there');
  });
});

describe('saveCommand', () => {
  it('updates an existing keyword in place', async () => {
    await saveCommand(guildId, 'pizza', 'first');
    await saveCommand(guildId, 'pizza', 'second');

    const stored = await prisma.customCommand.findMany({ where: { guildId, keyword: 'pizza' } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.response).toBe('second');
  });
});

describe('removeCommand', () => {
  it('asks for confirmation when the keyword exists', async () => {
    await saveCommand(guildId, 'pizza', 'slice');
    const result = await removeCommand(guildId, 'pizza');
    expect(result.type).toBe('needs_confirmation');

    const stored = await prisma.customCommand.findUnique({
      where: { guildId_keyword: { guildId, keyword: 'pizza' } },
    });
    expect(stored).not.toBeNull();
  });

  it('reports when the keyword does not exist', async () => {
    const result = await removeCommand(guildId, 'ghost');
    expect(result.type).toBe('not_found');
  });
});

describe('deleteCommand', () => {
  it('deletes an existing keyword and reports success', async () => {
    await saveCommand(guildId, 'pizza', 'slice');
    expect(await deleteCommand(guildId, 'pizza')).toBe(true);
    expect(await deleteCommand(guildId, 'pizza')).toBe(false);
  });
});

describe('handleTrigger', () => {
  it('replies with the raw response for a registered keyword', async () => {
    await saveCommand(guildId, 'pizza', 'http://imageurl.com/1234');
    const result = await handleTrigger(guildId, '!pizza');
    expect(result).toEqual({ type: 'reply', content: 'http://imageurl.com/1234' });
  });

  it('lists all keywords for !list with URLs wrapped', async () => {
    await saveCommand(guildId, 'pizza', 'http://imageurl.com/1234');
    const result = await handleTrigger(guildId, '!list');
    expect(result.type).toBe('reply');
    if (result.type === 'reply') {
      expect(result.content).toContain('`!pizza` → `http://imageurl.com/1234`');
    }
  });

  it('ignores unknown keywords and non-trigger messages', async () => {
    expect(await handleTrigger(guildId, '!unknown')).toEqual({ type: 'none' });
    expect(await handleTrigger(guildId, 'just chatting')).toEqual({ type: 'none' });
  });

  it('does not leak commands across guilds', async () => {
    await saveCommand(otherGuildId, 'pizza', 'theirs');
    expect(await handleTrigger(guildId, '!pizza')).toEqual({ type: 'none' });
  });
});
