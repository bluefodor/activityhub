import { create } from 'zustand';

export type NotificationNavTarget = 'plans' | 'chats' | 'dm' | 'groupChat' | 'forum';

type NotificationNavState = {
  nonce: number;
  target: NotificationNavTarget | null;
  planId: string | null;
  openJoinRequests: boolean;
  chatUserId: string | null;
  groupChatId: string | null;
  trigger: (payload: {
    target: NotificationNavTarget;
    planId?: string | null;
    openJoinRequests?: boolean;
    chatUserId?: string | null;
    groupChatId?: string | null;
  }) => void;
};

/** Bumped when a push/inbox tap navigates somewhere — destination screens force-refetch. */
export const useNotificationNavStore = create<NotificationNavState>((set) => ({
  nonce: 0,
  target: null,
  planId: null,
  openJoinRequests: false,
  chatUserId: null,
  groupChatId: null,
  trigger: (payload) =>
    set((s) => ({
      nonce: s.nonce + 1,
      target: payload.target,
      planId: payload.planId ?? null,
      openJoinRequests: !!payload.openJoinRequests,
      chatUserId: payload.chatUserId ?? null,
      groupChatId: payload.groupChatId ?? null,
    })),
}));
