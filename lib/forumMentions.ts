export type MentionLookupEntry = { id: string; name: string };

export type MessageTextPart =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; display: string; userId: string | null };

/** True if the character after a candidate name ends the mention (not mid-word). */
function isMentionEnd(text: string, indexAfterName: number): boolean {
  if (indexAfterName >= text.length) return true;
  return /[\s,.!?;:'")\]\n]/.test(text[indexAfterName]);
}

/**
 * After "@", pick the longest known display name from lookup, else at most two words.
 * Avoids "@Brian Cavallaro is the expert" matching the whole sentence.
 */
function readMentionAfterAt(
  textAfterAt: string,
  lookup: Map<string, MentionLookupEntry>
): { display: string; name: string; userId: string | null } | null {
  if (!textAfterAt) return null;

  const knownNames = [...lookup.values()]
    .map((e) => e.name)
    .sort((a, b) => b.length - a.length);

  for (const name of knownNames) {
    if (textAfterAt.length < name.length) continue;
    if (textAfterAt.slice(0, name.length).toLowerCase() !== name.toLowerCase()) continue;
    if (!isMentionEnd(textAfterAt, name.length)) continue;
    const entry = lookup.get(name.toLowerCase());
    return {
      display: `@${name}`,
      name,
      userId: entry?.id ?? null,
    };
  }

  const fallback = textAfterAt.match(/^([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?)/);
  if (!fallback?.[1]) return null;

  const name = fallback[1].trim();
  if (!isMentionEnd(textAfterAt, name.length)) return null;

  const entry = lookup.get(name.toLowerCase());
  return {
    display: `@${name}`,
    name,
    userId: entry?.id ?? null,
  };
}

function scanMentionsInText(
  text: string,
  lookup: Map<string, MentionLookupEntry>
): MessageTextPart[] {
  if (!text) return [];

  const parts: MessageTextPart[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const at = text.indexOf('@', cursor);
    if (at === -1) {
      parts.push({ kind: 'text', value: text.slice(cursor) });
      break;
    }

    if (at > cursor) {
      parts.push({ kind: 'text', value: text.slice(cursor, at) });
    }

    const parsed = readMentionAfterAt(text.slice(at + 1), lookup);
    if (parsed) {
      parts.push({
        kind: 'mention',
        display: parsed.display,
        userId: parsed.userId,
      });
      cursor = at + parsed.display.length;
    } else {
      parts.push({ kind: 'text', value: '@' });
      cursor = at + 1;
    }
  }

  return parts.length > 0 ? parts : [{ kind: 'text', value: text }];
}

export function extractMentionNames(
  text: string,
  lookup: Map<string, MentionLookupEntry> = new Map()
): string[] {
  const names: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf('@', cursor);
    if (at === -1) break;
    const parsed = readMentionAfterAt(text.slice(at + 1), lookup);
    if (parsed) {
      names.push(parsed.name);
      cursor = at + parsed.display.length;
    } else {
      cursor = at + 1;
    }
  }
  return [...new Set(names)];
}

export function buildMentionLookup(
  entries: MentionLookupEntry[]
): Map<string, MentionLookupEntry> {
  const map = new Map<string, MentionLookupEntry>();
  for (const entry of entries) {
    if (!entry.id || !entry.name?.trim()) continue;
    map.set(entry.name.trim().toLowerCase(), {
      id: entry.id,
      name: entry.name.trim(),
    });
  }
  return map;
}

export function resolveMentionUserIds(
  text: string,
  lookup: Map<string, MentionLookupEntry>
): string[] {
  const ids = new Set<string>();
  for (const name of extractMentionNames(text, lookup)) {
    const hit = lookup.get(name.toLowerCase());
    if (hit?.id) ids.add(hit.id);
  }
  return [...ids];
}

export function splitMessageWithMentions(
  text: string,
  lookup: Map<string, MentionLookupEntry>
): MessageTextPart[] {
  return scanMentionsInText(text, lookup);
}
