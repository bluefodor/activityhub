import { create } from 'zustand';

interface TutorialState {
  isActive: boolean;
  currentStep: number;
  /** Step 1 spotlight inner height (`Inactive` label h × 2); forum step 3 matches this. */
  step1SpotlightInnerHeight: number | null;
  setStep1SpotlightInnerHeight: (height: number | null) => void;
  startTutorial: () => void;
  endTutorial: () => void;
  nextStep: () => void;
  goToStep: (step: number) => void;
}

const MAX_STEP = 4;

export const useTutorialStore = create<TutorialState>((set, get) => ({
  isActive: false,
  currentStep: 1,
  step1SpotlightInnerHeight: null,

  setStep1SpotlightInnerHeight: (height) => set({ step1SpotlightInnerHeight: height }),

  startTutorial: () => {
    set({
      isActive: true,
      currentStep: 1,
      step1SpotlightInnerHeight: null,
    });
  },

  endTutorial: () => {
    set({
      isActive: false,
      currentStep: 1,
      step1SpotlightInnerHeight: null,
    });
  },

  nextStep: () => {
    const { currentStep } = get();
    const next = Math.min(currentStep + 1, MAX_STEP);
    set({ currentStep: next });
  },

  goToStep: (step: number) => {
    const clamped = Math.max(1, Math.min(step, MAX_STEP));
    set({ currentStep: clamped });
  },
}));

