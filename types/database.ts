export interface Profile {
  id: string
  name: string
  email: string
  avatar_url?: string
  forum_notifications_enabled?: boolean
  chat_notifications_enabled?: boolean
  new_event_notifications_enabled?: boolean
  private_invite_notifications_enabled?: boolean
  plan_reminder_notifications_enabled?: boolean
  created_at?: string
  updated_at?: string
}

export interface Activity {
  id: string
  name: string
  emoji: string
  description: string
  created_at?: string
}

export interface UserActivitySkill {
  id: string
  user_id: string
  activity_id: string
  skill_level: 'Beginner' | 'Intermediate' | 'Advanced'
  ready_today?: boolean
  ready_today_date?: string | null
  created_at?: string
  updated_at?: string
  activities?: Activity
}

export type ForumMessageKind = 'text' | 'poll'

export type ForumPollStyle = 'choice' | 'open_text'

export interface ForumPollOption {
  id: string
  poll_id?: string
  option_text: string
  sort_order: number
  vote_count: number
}

export interface ForumPoll {
  id: string
  activity_id: string
  message_id: string
  question: string
  allow_multiple_selection: boolean
  poll_style?: ForumPollStyle
  response_count?: number
  created_by: string
  created_at?: string
  forum_poll_options?: ForumPollOption[]
}

export interface ForumMessage {
  id: string
  activity_id: string
  user_id: string
  message: string
  message_kind?: ForumMessageKind
  image_urls?: string[] | null
  created_at?: string
  edited_at?: string | null
  deleted_at?: string | null
  profiles?: Profile
  activities?: Activity
  /** One-to-one from forum_polls.message_id → forum_messages.id */
  forum_polls?: ForumPoll | ForumPoll[] | null
}

export interface Chat {
  id: string
  participant_1: string
  participant_2: string
  last_message_at?: string
  created_at?: string
}

export interface ChatMessage {
  id: string
  chat_id: string
  sender_id: string
  message: string
  created_at?: string
  edited_at?: string | null
  deleted_at?: string | null
  image_urls?: string[] | null
  profiles?: Profile
}

export interface ScheduledEvent {
  id: string
  organizer_id: string
  activity_id: string | null
  title: string
  location: string
  event_date: string
  event_time: string
  description: string
  max_participants: number
  created_at: string
  updated_at: string
  profiles?: Profile
  activities?: Activity
}

export interface EventParticipant {
  id: string
  event_id: string
  user_id: string
  status: 'pending' | 'accepted' | 'declined'
  invited_at: string
  responded_at?: string
  profiles?: Profile
}

export interface EventInvite {
  id: string
  event_id: string
  title: string
  location: string
  event_date: string
  event_time: string
  organizer_name: string
  status: 'pending' | 'accepted' | 'declined'
  invited_at: string
}
