import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { useTutorialStore } from '@/store/useTutorialStore';
import { useProfileStore } from '@/store/useProfileStore';
import { clearAppIconBadge } from '@/lib/appIconBadge';

const TUTORIAL_START_AFTER_EACH_SIGN_IN = false;

let authInitialized = false;

function isInvalidRefreshToken(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('refresh token') || normalized.includes('refresh_token');
}

async function clearInvalidLocalSession() {
  try {
    // The server no longer recognizes this refresh token. Clear only the
    // device copy so startup can proceed cleanly to the login screen.
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // The stale session is already unusable; auth state below still resets.
  }
}

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signUp: (email: string, password: string, name: string) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<{ error: any }>;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: () => {
    if (authInitialized) return;
    authInitialized = true;

    const finishLoading = () => set({ loading: false });

    supabase.auth
      .getSession()
      .then(async ({ data: { session }, error }) => {
        if (error) {
          if (isInvalidRefreshToken(error)) {
            await clearInvalidLocalSession();
          } else {
            console.error('Error getting session:', error);
          }
          set({ user: null });
        } else {
          set({ user: session?.user ?? null });
        }
      })
      .catch(async (error: any) => {
        if (isInvalidRefreshToken(error)) {
          await clearInvalidLocalSession();
        } else {
          console.error('Error initializing auth:', error);
        }
        set({ user: null });
      })
      .finally(finishLoading);

    supabase.auth.onAuthStateChange((event, session) => {
      try {
        if (
          TUTORIAL_START_AFTER_EACH_SIGN_IN &&
          event === 'SIGNED_IN' &&
          session?.user
        ) {
          useTutorialStore.getState().startTutorial();
        }
        if (event === 'SIGNED_OUT') {
          useTutorialStore.getState().endTutorial();
        }
        if (event === 'TOKEN_REFRESHED' && !session) {
          set({ user: null, loading: false });
          return;
        }
        set({ user: session?.user ?? null, loading: false });
      } catch (error: any) {
        if (isInvalidRefreshToken(error)) {
          void clearInvalidLocalSession();
        } else {
          console.error('Error handling auth state change:', error);
        }
        set({ user: null, loading: false });
      }
    });
  },

  signIn: async (email, password) => {
    if (!email?.trim() || !password?.trim()) {
      return { data: null, error: { message: 'Email and password are required' } };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { data, error };
  },

  signUp: async (email, password, name) => {
    if (!email?.trim() || !password?.trim() || !name?.trim()) {
      return { data: null, error: { message: 'All fields are required' } };
    }
    if (password.length < 6) {
      return { data: null, error: { message: 'Password must be at least 6 characters' } };
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    if (data.user && !error) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
      });
      if (profileError) {
        console.error('Error creating profile:', profileError);
        return { data, error: { message: 'Account created but profile setup failed' } };
      }
    }
    return { data, error };
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    // Clear local session immediately so navigation isn't blocked waiting on auth events.
    set({ user: null, loading: false });
    useProfileStore.getState().reset();
    useTutorialStore.getState().endTutorial();
    void clearAppIconBadge();
    return { error };
  },
}));

useAuthStore.getState().initialize();
