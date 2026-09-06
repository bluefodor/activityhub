import type { RefObject } from 'react';
import type { FlatList } from 'react-native';

type ChatListRef = RefObject<FlatList<any> | null>;

/** How many messages to load initially — keeps open-at-bottom reliable. */
export const CHAT_MESSAGES_INITIAL_LIMIT = 40;

/** Normal (non-inverted) chat list — always use scrollToEnd, not scrollToIndex. */
export function scrollChatListToLatest(listRef: ChatListRef, animated = false) {
  listRef.current?.scrollToEnd({ animated });
}

export function scrollChatListToLatestWithRetries(
  listRef: ChatListRef,
  onDone: () => void,
  options?: {   maxAttempts?: number; delayMs?: number },
) {
  const maxAttempts = options?.maxAttempts ?? 20;
  const delayMs = options?.delayMs ?? 100;
  let attempts = 0;
  let cancelled = false;

  const attempt = () => {
    if (cancelled) return;
    scrollChatListToLatest(listRef, false);
    attempts += 1;
    if (attempts >= maxAttempts) {
      onDone();
      return;
    }
    setTimeout(attempt, delayMs);
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(attempt);
  });

  return () => {
    cancelled = true;
  };
}
