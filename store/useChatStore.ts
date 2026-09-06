import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useProfileStore } from '@/store/useProfileStore';
import { markInboxNotificationsRead } from '@/hooks/useNotificationsInbox';
import { RealtimeChannel } from '@supabase/supabase-js';
import { sendLocalNotification } from '@/hooks/useNotifications';
import { countUnreadByChat } from '@/lib/chatPreviewUtils';

export interface ChatPreview {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: Date;
  unreadCount: number;
  awaitingReply: boolean;
  avatar: string;
  otherUserId: string;
}

interface ChatState {
  chats: ChatPreview[];
  loading: boolean;
  initialized: boolean;
  activeChatId: string | null;
  setActiveChat: (chatId: string | null) => void;
  setChats: (chats: ChatPreview[]) => void;
  fetchChats: (userId: string) => Promise<void>;
  markAsRead: (chatId: string, userId: string) => Promise<void>;
  subscribeToChanges: (userId: string) => void;
  unsubscribe: () => void;
}

let subscription: RealtimeChannel | null = null;
let fetchInFlight = false;
let lastFetchAt = 0;
const FETCH_THROTTLE_MS = 1500;
/** After subscription closes, don't resubscribe for this long (stops log loop on remounts) */
const REALTIME_RESUBSCRIBE_COOLDOWN_MS = 60000;
let lastRealtimeClosedAt = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  loading: false,
  initialized: false,
  activeChatId: null,

  setChats: (chats) => set({ chats }),

  setActiveChat: (chatId) => set({ activeChatId: chatId }),

  fetchChats: async (userId) => {
    if (!userId) return;
    const now = Date.now();
    if (fetchInFlight || now - lastFetchAt < FETCH_THROTTLE_MS) {
      return;
    }
    fetchInFlight = true;
    lastFetchAt = now;
    if (!get().initialized) set({ loading: true });

    try {
      // First, get list of blocked user IDs
      const { data: blockedData } = await supabase
        .from('blocked_users')
        .select('blocked_user_id')
        .eq('user_id', userId);
      
      const blockedUserIds = new Set(blockedData?.map(b => b.blocked_user_id) || []);

      const { data: chatsData, error } = await supabase
        .from('chats')
        .select('*')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
        .order('last_message_at', { ascending: false })
        .limit(50);

      if (error || !chatsData) throw error;

      // Filter out chats with blocked users
      const filteredChats = chatsData.filter(chat => {
        const otherUserId = chat.participant_1 === userId ? chat.participant_2 : chat.participant_1;
        return !blockedUserIds.has(otherUserId);
      });

      const chatIds = filteredChats.map(c => c.id);
      const otherUserIds = filteredChats.map(chat =>
        chat.participant_1 === userId ? chat.participant_2 : chat.participant_1
      );

      // Fetch latest message per chat (one query each). A single global
      // `.order(created_at).limit(N)` across all chats drops quieter threads
      // when a few busy chats fill the limit — that made old DMs disappear.
      const [{ data: profilesData }, lastMessageRows, { data: unreadCandidates }] =
        await Promise.all([
        supabase.from('profiles').select('id, name, avatar_url').in('id', otherUserIds),
        Promise.all(
          chatIds.map(async (chatId) => {
            const { data } = await supabase
              .from('chat_messages')
              .select('chat_id, message, created_at, image_urls, sender_id')
              .eq('chat_id', chatId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            return data;
          }),
        ),
        supabase
          .from('chat_messages')
          .select('chat_id, created_at, sender_id')
          .in('chat_id', chatIds)
          .neq('sender_id', userId),
      ]);

      const profileMap = new Map((profilesData || []).map(p => [p.id, p]));
      const lastMessageMap = new Map(
        (lastMessageRows || [])
          .filter((row): row is NonNullable<typeof row> => !!row?.chat_id)
          .map((row) => [row.chat_id, row]),
      );

      const lastReadByChat = new Map<string, string>();
      for (const chat of filteredChats) {
        const myLastRead =
          chat.participant_1 === userId ? chat.last_read_p1 : chat.last_read_p2;
        lastReadByChat.set(chat.id, myLastRead || '1970-01-01');
      }
      const unreadByChat = countUnreadByChat(
        unreadCandidates || [],
        chatIds,
        userId,
        lastReadByChat,
        'sender_id',
      );

      const chatPreviews = filteredChats.map((chat) => {
          const otherUserId = chat.participant_1 === userId ? chat.participant_2 : chat.participant_1;

          const profile = profileMap.get(otherUserId);
          const lastMsg = lastMessageMap.get(chat.id);

          const isActive = get().activeChatId === chat.id;
          const finalUnreadCount = isActive ? 0 : (unreadByChat.get(chat.id) || 0);
          const awaitingReply =
            !!lastMsg?.sender_id && lastMsg.sender_id !== userId;

          return {
            id: chat.id,
            name: profile?.name || 'Unknown',
            lastMessage: lastMsg?.image_urls?.length ? "📷 Photo" : lastMsg?.message ?? "No messages",
            timestamp: new Date(lastMsg?.created_at || chat.created_at),
            unreadCount: finalUnreadCount,
            awaitingReply,
            avatar: profile?.avatar_url ?? null,
            otherUserId
          };
        });

      chatPreviews.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      set({ chats: chatPreviews.filter((c) => lastMessageMap.has(c.id)), loading: false, initialized: true });
    } catch (e) {
      console.log('Error fetching chats:', e);
      set({ loading: false });
    } finally {
      fetchInFlight = false;
    }
  },

  markAsRead: async (chatId, userId) => {
    // 1. Optimistic Update (clear unread only — awaitingReply stays until user sends a message)
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
    }));

    // 2. Database Update
    const { data: chat } = await supabase
      .from('chats')
      .select('participant_1, participant_2')
      .eq('id', chatId)
      .single();
    if (!chat) return;
    const field = chat.participant_1 === userId ? 'last_read_p1' : 'last_read_p2';

    await supabase
      .from('chats')
      .update({ [field]: new Date().toISOString() })
      .eq('id', chatId);

    const otherUserId =
      chat.participant_1 === userId ? chat.participant_2 : chat.participant_1;
    void markInboxNotificationsRead(userId, {
      types: ['direct_message'],
      chatId,
      otherUserId,
    });
  },

  // NEW: Realtime Subscription
  subscribeToChanges: (userId: string) => {
    if (subscription) return; // Already subscribed
    if (lastRealtimeClosedAt && Date.now() - lastRealtimeClosedAt < REALTIME_RESUBSCRIBE_COOLDOWN_MS) {
      return; // Recently closed; skip to avoid loop
    }

    subscription = supabase
      .channel('public:chat_updates')
      // Listen for NEW chats being created (check if current user is a participant)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chats'
      }, async (payload) => {
        const newChat = payload.new as { participant_1: string; participant_2: string };
        // Only refresh if current user is a participant
        if (newChat.participant_1 === userId || newChat.participant_2 === userId) {
          console.log("🔔 New chat created! Refreshing...");
          get().fetchChats(userId);
        }
      })
      // Listen for NEW messages
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        console.log("🔔 New message received! Refreshing...");
        get().fetchChats(userId);

        // Send local notification if not from current user and chat is not active
        const newMessage = payload.new as { sender_id: string; chat_id: string; message: string };
        const currentUserId = userId;
        const activeChat = get().activeChatId;

        if (newMessage.sender_id !== currentUserId && newMessage.chat_id !== activeChat) {
          const chatNotificationsEnabled =
            useProfileStore.getState().profile?.chat_notifications_enabled !== false;
          if (!chatNotificationsEnabled) return;

          const chat = get().chats.find(c => c.id === newMessage.chat_id);
          if (chat) {
            await sendLocalNotification(
              `New message from ${chat.name}`,
              newMessage.message || '📷 Photo',
              {
                type: 'new_message',
                chatId: chat.id,
                otherUserId: chat.otherUserId,
                userName: chat.name,
              }
            );
          }
        }
      })
      // Listen for Read Status updates (when you read it on another device)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, () => {
        get().fetchChats(userId);
      })
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          lastRealtimeClosedAt = Date.now();
          if (subscription) {
            supabase.removeChannel(subscription);
            subscription = null;
          }
          // No auto-resubscribe; cooldown prevents loop when components remount.
        }
      });
  },

  unsubscribe: () => {
    if (subscription) {
      supabase.removeChannel(subscription);
      subscription = null;
    }
  }
}));
