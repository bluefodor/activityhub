import { supabase } from '@/lib/supabase';

export async function deleteUserAccount(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });

  if (error) {
    return { ok: false, error: error.message || 'Could not delete account' };
  }

  const body = data as { error?: string; success?: boolean } | null;
  if (body?.error) {
    return { ok: false, error: body.error };
  }

  return { ok: true };
}
