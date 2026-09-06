import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

/** Must match `scheme` in app.json. */
export const APP_SCHEME = 'activeportland';
export const PASSWORD_RESET_PATH = 'reset-password';

/** Public HTTPS page (GitHub Pages) that forwards tokens into the app deep link. */
export const PASSWORD_RESET_WEB_URL =
  'https://bluefodor88.github.io/reset-password.html';

export function getAppPasswordResetDeepLink(): string {
  return `${APP_SCHEME}://${PASSWORD_RESET_PATH}`;
}

/**
 * Supabase must redirect to HTTPS first — custom schemes in email links often land on
 * about:blank in desktop/mobile browsers. The web page opens activeportland://reset-password.
 */
export function getPasswordResetRedirectUrl(): string {
  return PASSWORD_RESET_WEB_URL;
}

/** True when the URL carries Supabase auth tokens (query or hash). */
export function urlHasAuthParams(url: string): boolean {
  const params = parseAuthParamsFromUrl(url);
  if (params.error || params.error_description) return true;
  if (params.code) return true;
  if (params.token_hash) return true;
  return !!(params.access_token && params.refresh_token);
}

/** Parse Supabase auth params from deep-link hash and/or query string. */
export function parseAuthParamsFromUrl(url: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parsed = Linking.parse(url);
  const queryParams = parsed.queryParams ?? {};

  for (const [key, value] of Object.entries(queryParams)) {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === 'string') {
      result[key] = value[0];
    }
  }

  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const hashParams = new URLSearchParams(url.substring(hashIndex + 1));
    hashParams.forEach((value, key) => {
      result[key] = value;
    });
  }

  return result;
}

/** Establish a session from a Supabase password-recovery (or magic-link) URL. */
export async function createSessionFromAuthUrl(
  url: string
): Promise<{ ok: boolean; error?: string }> {
  const params = parseAuthParamsFromUrl(url);

  if (params.error_description || params.error) {
    return { ok: false, error: params.error_description || params.error };
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      return { ok: false, error: error.message || 'Could not verify reset link.' };
    }
    return { ok: true };
  }

  if (params.token_hash && params.type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: 'recovery',
    });
    if (error) {
      return { ok: false, error: error.message || 'Could not verify reset link.' };
    }
    return { ok: true };
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return { ok: false, error: error.message || 'Could not verify reset link.' };
    }
    return { ok: true };
  }

  return { ok: false, error: 'Invalid or expired reset link.' };
}
