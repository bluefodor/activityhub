/** Count unread messages per chat from one batched fetch (avoids N count queries). */
export function countUnreadByChat(
  rows: Array<{ chat_id: string; created_at: string; sender_id?: string; user_id?: string }>,
  chatIds: string[],
  userId: string,
  lastReadByChat: Map<string, string>,
  senderField: 'sender_id' | 'user_id' = 'sender_id',
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const chatId of chatIds) counts.set(chatId, 0);

  for (const row of rows) {
    const authorId = row[senderField];
    if (!authorId || authorId === userId) continue;
    const lastRead = lastReadByChat.get(row.chat_id) || '1970-01-01';
    if (row.created_at > lastRead) {
      counts.set(row.chat_id, (counts.get(row.chat_id) ?? 0) + 1);
    }
  }

  return counts;
}

/** First row per key while preserving overall sort (expects newest-first input). */
export function firstRowByKey<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const id = String(row[key] ?? '');
    if (!id || map.has(id)) continue;
    map.set(id, row);
  }
  return map;
}
