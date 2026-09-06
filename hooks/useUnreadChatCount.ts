import { useMemo } from 'react';
import { useChats } from './useChats';
import { usePlanGroupChatsList } from './usePlanGroupChatsList';

/** Total unread direct + plan group chat messages. */
export function useUnreadChatCount() {
  const { chats, refetch: refetchChats } = useChats();
  const { chats: groupChats, refetch: refetchGroupChats } = usePlanGroupChatsList();

  const unreadCount = useMemo(
    () =>
      chats.reduce((n, c) => n + c.unreadCount, 0) +
      groupChats.reduce((n, c) => n + c.unreadCount, 0),
    [chats, groupChats]
  );

  return { unreadCount, refetchChats, refetchGroupChats };
}
