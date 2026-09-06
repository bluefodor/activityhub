import { supabase } from '@/lib/supabase';
import { getPasswordResetRedirectUrl } from '@/lib/authDeepLink';

const MIN_PASSWORD_LENGTH = 6;

export function validatePasswordPair(password: string, confirm: string): string | null {
  if (!password.trim()) return 'Enter a new password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return 'Passwords do not match.';
  return null;
}

export async function changePasswordInApp(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, error: error.message || 'Could not update password' };
  }
  return { ok: true };
}

export async function sendPasswordResetEmail(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: getPasswordResetRedirectUrl(),
  });
  if (error) {
    return { ok: false, error: error.message || 'Could not send reset email' };
  }
  return { ok: true };
}

export function validateNewEmail(newEmail: string, currentEmail: string): string | null {
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed) return 'Enter a new email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.';
  if (trimmed === currentEmail.trim().toLowerCase()) return 'That is already your email.';
  return null;
}

/** Updates login + profile email immediately (no confirmation email). */
export async function changeEmailInApp(
  newEmail: string
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('update-account-email', {
    method: 'POST',
    body: { email: newEmail.trim().toLowerCase() },
  });

  if (error) {
    return { ok: false, error: error.message || 'Could not update email' };
  }

  const body = data as { error?: string; success?: boolean; email?: string } | null;
  if (body?.error) {
    return { ok: false, error: body.error };
  }

  await supabase.auth.refreshSession();

  return { ok: true, email: body?.email ?? newEmail.trim().toLowerCase() };
}
