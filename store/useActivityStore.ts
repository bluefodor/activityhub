import { create } from 'zustand';

interface ActivityState {
  activityId: string;
  activity: string;
  skillLevel: string;
  emoji: string;
  forumLastSeenVersion: number;
  plansLastSeenVersion: number;
  /**
   * Set when user adds an activity until `userSkills` includes it in every carousel.
   * Must be global — Forum / Plans / People each mount their own ActivityCarousel; a
   * per-instance ref only protected one of them and the others reset selection to "first".
   */
  pendingAlignActivityId: string | null;
  setPendingAlignActivityId: (id: string | null) => void;
  /** Monotonic deadline — all ActivityCarousel instances skip auto-sync until this time (ms). */
  explicitCarouselSelectionUntil: number;
  markExplicitCarouselSelection: () => void;
  pendingOpenCreatePlan: boolean;
  setPendingOpenCreatePlan: (value: boolean) => void;
  showReadyTodayPrompt: boolean;
  setShowReadyTodayPrompt: (value: boolean) => void;

  setActivity: (params: {
    activityId: string;
    activity: string;
    skillLevel: string;
    emoji: string;
  }) => void;
  setActivityWithPendingAlign: (params: {
    activityId: string;
    activity: string;
    skillLevel: string;
    emoji: string;
  }) => void;
  touchForumLastSeen: () => void;
  touchPlansLastSeen: () => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activityId: '',
  activity: '',
  skillLevel: '',
  emoji: '',
  forumLastSeenVersion: 0,
  plansLastSeenVersion: 0,
  pendingAlignActivityId: null,
  setPendingAlignActivityId: (id) => {
    if (get().pendingAlignActivityId === id) return;
    set({ pendingAlignActivityId: id });
  },
  explicitCarouselSelectionUntil: 0,
  markExplicitCarouselSelection: () =>
    set({ explicitCarouselSelectionUntil: Date.now() + 1200 }),
  pendingOpenCreatePlan: false,
  setPendingOpenCreatePlan: (value) => set({ pendingOpenCreatePlan: value }),
  showReadyTodayPrompt: false,
  setShowReadyTodayPrompt: (value) => set({ showReadyTodayPrompt: value }),

  setActivity: (params) => {
    const current = get();

    if (
      current.activityId === params.activityId &&
      current.activity === params.activity &&
      current.skillLevel === params.skillLevel &&
      current.emoji === params.emoji
    ) {
      return;
    }

    // New explicit selection — clear align wait (callers that need it, e.g. add-activity, set pending after this).
    set({ ...params, pendingAlignActivityId: null });
  },
  setActivityWithPendingAlign: (params) => {
    const current = get();

    if (
      current.activityId === params.activityId &&
      current.activity === params.activity &&
      current.skillLevel === params.skillLevel &&
      current.emoji === params.emoji &&
      current.pendingAlignActivityId === params.activityId
    ) {
      return;
    }

    set({ ...params, pendingAlignActivityId: params.activityId });
  },
  touchForumLastSeen: () => {
    set((state) => ({ forumLastSeenVersion: state.forumLastSeenVersion + 1 }));
  },
  touchPlansLastSeen: () => {
    set((state) => ({ plansLastSeenVersion: state.plansLastSeenVersion + 1 }));
  },
}));
