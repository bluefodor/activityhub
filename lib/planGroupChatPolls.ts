import { supabase } from '@/lib/supabase';
import { CHAT_MESSAGES_INITIAL_LIMIT } from '@/lib/chatListScroll';
import type { PostgrestError } from '@supabase/supabase-js';

export type PlanGroupChatPollOption = {
  id: string;
  option_text: string;
  sort_order: number;
  vote_count: number;
};

export type PlanGroupChatPoll = {
  id: string;
  question: string;
  plan_group_chat_poll_options?: PlanGroupChatPollOption[];
};

export function normalizePlanGroupChatPoll(
  raw: PlanGroupChatPoll | PlanGroupChatPoll[] | null | undefined
): PlanGroupChatPoll | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

/** True when poll tables/columns are not migrated yet — fetch can fall back to basic messages. */
export function isPlanGroupChatPollSchemaMissing(error: PostgrestError | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();
  return (
    error.code === 'PGRST200' ||
    error.code === '42703' ||
    msg.includes('plan_group_chat_poll') ||
    msg.includes('message_kind') ||
    msg.includes('does not exist') ||
    details.includes('plan_group_chat_poll') ||
    details.includes('message_kind')
  );
}

const MESSAGES_SELECT_WITH_POLLS = `
  *,
  plan_group_chat_polls (
    id,
    question,
    plan_group_chat_poll_options (
      id,
      option_text,
      sort_order,
      vote_count
    )
  )
`;

export async function fetchPlanGroupChatMessages(chatId: string): Promise<{
  data: Record<string, unknown>[] | null;
  error: PostgrestError | null;
  pollsEnabled: boolean;
}> {
  const withPolls = await supabase
    .from('plan_group_chat_messages')
    .select(MESSAGES_SELECT_WITH_POLLS)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(CHAT_MESSAGES_INITIAL_LIMIT);

  if (!withPolls.error) {
    const rows = [...(withPolls.data ?? [])].reverse();
    return { data: rows, error: null, pollsEnabled: true };
  }
  if (!isPlanGroupChatPollSchemaMissing(withPolls.error)) {
    return { data: null, error: withPolls.error, pollsEnabled: false };
  }

  const basic = await supabase
    .from('plan_group_chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(CHAT_MESSAGES_INITIAL_LIMIT);

  const basicRows = [...(basic.data ?? [])].reverse();
  return { data: basicRows, error: basic.error, pollsEnabled: false };
}

export async function createPlanGroupChatPoll(args: {
  chatId: string;
  question: string;
  optionTexts: string[];
}): Promise<{ messageId: string | null; error: Error | null }> {
  const cleaned = args.optionTexts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleaned.length < 2 || cleaned.length > 6) {
    return { messageId: null, error: new Error('Need 2–6 answers') };
  }

  const { data, error } = await supabase.rpc('create_plan_group_chat_poll', {
    p_chat_id: args.chatId,
    p_question: args.question.trim(),
    p_option_texts: cleaned,
  });

  if (error) return { messageId: null, error: new Error(error.message) };
  return { messageId: (data as string) ?? null, error: null };
}

export async function votePlanGroupChatPoll(
  pollId: string,
  optionId: string
): Promise<{ error: Error | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { error: new Error('Not signed in') };

  const { error } = await supabase.from('plan_group_chat_poll_votes').insert({
    poll_id: pollId,
    option_id: optionId,
    user_id: uid,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function clearPlanGroupChatPollVote(pollId: string): Promise<{ error: Error | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { error: new Error('Not signed in') };

  const { error } = await supabase
    .from('plan_group_chat_poll_votes')
    .delete()
    .eq('poll_id', pollId)
    .eq('user_id', uid);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}
