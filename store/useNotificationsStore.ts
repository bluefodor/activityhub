import { create } from 'zustand';
import type { InboxNotification } from '@/hooks/useNotificationsInbox';

interface NotificationsState {
  items: InboxNotification[];
  unreadCount: number;
  loading: boolean;
  setItems: (items: InboxNotification[]) => void;
  setLoading: (loading: boolean) => void;
  markReadLocal: (notificationId: string) => void;
  markAllReadLocal: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  unreadCount: 0,
  loading: true,
  setItems: (items) =>
    set({ items, unreadCount: items.filter((n) => !n.read_at).length }),
  setLoading: (loading) => set({ loading }),
  markReadLocal: (notificationId) =>
    set((state) => {
      const now = new Date().toISOString();
      const items = state.items.map((n) =>
        n.id === notificationId ? { ...n, read_at: now } : n
      );
      return { items, unreadCount: items.filter((n) => !n.read_at).length };
    }),
  markAllReadLocal: () =>
    set((state) => {
      const now = new Date().toISOString();
      const items = state.items.map((n) => ({ ...n, read_at: n.read_at ?? now }));
      return { items, unreadCount: 0 };
    }),
}));
