import { supabase } from '@/lib/supabase'
import { Alert } from 'react-native'
import { router } from 'expo-router'
import { requireAuth } from '@/lib/authHelpers'
import type { PostgrestError } from '@supabase/supabase-js'

export type ForumPollStyle = 'choice' | 'open_text'

/** True when open-text poll columns/tables are not migrated yet. */
export function isForumOpenTextPollSchemaMissing(error: PostgrestError | null): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  const details = (error.details || '').toLowerCase()
  return (
    error.code === 'PGRST200' ||
    error.code === '42703' ||
    msg.includes('poll_style') ||
    msg.includes('response_count') ||
    msg.includes('forum_poll_text_responses') ||
    msg.includes('create_forum_open_text_poll') ||
    msg.includes('does not exist') ||
    details.includes('poll_style') ||
    details.includes('forum_poll_text_responses')
  )
}

export async function createForumPoll(args: {
  activityId: string
  question: string
  allowMultiple: boolean
  optionTexts: string[]
}): Promise<{ messageId: string | null; error: Error | null }> {
  const cleaned = args.optionTexts.map((t) => t.trim()).filter((t) => t.length > 0)
  if (cleaned.length < 2 || cleaned.length > 10) {
    return { messageId: null, error: new Error('Need 2–10 non-empty options') }
  }

  const { data, error } = await supabase.rpc('create_forum_poll', {
    p_activity_id: args.activityId,
    p_question: args.question.trim(),
    p_allow_multiple: args.allowMultiple,
    p_option_texts: cleaned,
  })

  if (error) {
    return { messageId: null, error: new Error(error.message) }
  }
  return { messageId: (data as string) ?? null, error: null }
}

export async function insertForumPollVote(pollId: string, optionId: string): Promise<{ error: Error | null }> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return { error: new Error('Not signed in') }

  const { error } = await supabase.from('forum_poll_votes').insert({
    poll_id: pollId,
    option_id: optionId,
    user_id: uid,
  })
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function deleteForumPollVote(pollId: string, optionId: string): Promise<{ error: Error | null }> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return { error: new Error('Not signed in') }

  const { error } = await supabase
    .from('forum_poll_votes')
    .delete()
    .eq('poll_id', pollId)
    .eq('option_id', optionId)
    .eq('user_id', uid)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export type ForumPollVoterRow = { user_id: string; option_id: string; profiles: { name: string } | null }

export async function fetchForumPollVoters(
  pollId: string
): Promise<{ rows: ForumPollVoterRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('forum_poll_votes')
    .select('user_id, option_id, profiles ( name )')
    .eq('poll_id', pollId)

  if (error) return { rows: [], error: new Error(error.message) }
  return { rows: (data || []) as ForumPollVoterRow[], error: null }
}

export async function createForumOpenTextPoll(args: {
  activityId: string
  question: string
}): Promise<{ messageId: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_forum_open_text_poll', {
    p_activity_id: args.activityId,
    p_question: args.question.trim(),
  })

  if (error) {
    if (isForumOpenTextPollSchemaMissing(error)) {
      return {
        messageId: null,
        error: new Error('Open-text polls need a database update. Run supabase db push, then try again.'),
      }
    }
    return { messageId: null, error: new Error(error.message) }
  }
  return { messageId: (data as string) ?? null, error: null }
}

export type ForumPollTextResponseRow = {
  user_id: string
  response_text: string
  created_at?: string
  profiles: { name: string } | null
}

export async function fetchForumPollTextResponses(
  pollId: string
): Promise<{ rows: ForumPollTextResponseRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('forum_poll_text_responses')
    .select('user_id, response_text, created_at, profiles ( name )')
    .eq('poll_id', pollId)
    .order('created_at', { ascending: true })

  if (error) return { rows: [], error: new Error(error.message) }
  return { rows: (data || []) as ForumPollTextResponseRow[], error: null }
}

export async function upsertForumPollTextResponse(
  pollId: string,
  responseText: string
): Promise<{ error: Error | null }> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return { error: new Error('Not signed in') }

  const text = responseText.trim()
  if (!text) return { error: new Error('Enter an answer') }
  if (text.length > 500) return { error: new Error('Answer is too long (500 max)') }

  const { error } = await supabase.from('forum_poll_text_responses').upsert(
    {
      poll_id: pollId,
      user_id: uid,
      response_text: text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'poll_id,user_id' }
  )

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function deleteForumPollTextResponse(pollId: string): Promise<{ error: Error | null }> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return { error: new Error('Not signed in') }

  const { error } = await supabase
    .from('forum_poll_text_responses')
    .delete()
    .eq('poll_id', pollId)
    .eq('user_id', uid)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export function showPollMemberActions(
  userId: string,
  userName: string,
  currentUserId?: string,
  isSignedIn = true
) {
  if (!userId || userId === currentUserId) return

  Alert.alert(userName, undefined, [
    {
      text: 'View profile',
      onPress: () => {
        router.push({
          pathname: '/(tabs)/people/[id]',
          params: { id: userId, name: userName, from: 'forum' },
        })
      },
    },
    {
      text: 'Message',
      onPress: () => {
        if (!isSignedIn) {
          requireAuth('message users')
          return
        }
        router.push({
          pathname: '/(tabs)/chats/[id]',
          params: { id: userId, name: userName },
        })
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ])
}
