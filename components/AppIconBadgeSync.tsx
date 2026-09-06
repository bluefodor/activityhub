import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadChatCount } from '@/hooks/useUnreadChatCount';
import { clearAppIconBadge, setAppIconBadgeCount } from '@/lib/appIconBadge';

/** Home-screen badge = unread chats only (DMs + plan group chats). Not forum or new plans. */
export function AppIconBadgeSync() {
  const { user } = useAuth();
  const { unreadCount: chatUnread, refetchChats, refetchGroupChats } = useUnreadChatCount();

  useEffect(() => {
    if (!user?.id) {
      void clearAppIconBadge();
      return;
    }
    void setAppIconBadgeCount(chatUnread);
  }, [user?.id, chatUnread]);

  useEffect(() => {
    if (!user?.id) return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refetchChats();
      refetchGroupChats();
    });

    return () => sub.remove();
  }, [user?.id, refetchChats, refetchGroupChats]);

  return null;
}
