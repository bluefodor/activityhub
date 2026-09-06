import { supabase } from '@/lib/supabase';

/** Case-insensitive exact name match (first result). */
export async function lookupProfileIdByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];
  const words = trimmed.split(/\s+/);
  if (words.length > 2) {
    candidates.push(words.slice(0, 2).join(' '));
  }
  if (words.length > 1) {
    candidates.push(words.slice(0, 1).join(' '));
  }

  for (const candidate of [...new Set(candidates)]) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('name', candidate)
      .limit(1)
      .maybeSingle();

    if (!error && data?.id) return data.id;
  }

  return null;
}
