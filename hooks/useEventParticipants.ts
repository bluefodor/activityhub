import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { getOrCreateChat } from './useChats'

interface EventParticipant {
  id: string
  event_id: string
  user_id: string
  status: 'pending' | 'accepted' | 'declined'
  invited_at: string
  responded_at?: string
  profiles?: {
    name: string
    email: string
    avatar_url?: string
  }
}

interface EventInvite {
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

export function useEventParticipants(eventId?: string) {
  const { user } = useAuth()
  const [participants, setParticipants] = useState<EventParticipant[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (eventId) {
      fetchParticipants()
    }
  }, [eventId])

  const fetchParticipants = async () => {
    if (!eventId) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('event_participants')
        .select(`
          *,
          profiles!event_participants_user_id_fkey (
            name,
            email,
            avatar_url
          )
        `)
        .eq('event_id', eventId)
        .order('invited_at', { ascending: true })

      if (error) {
        console.error('Error fetching participants:', error)
        setParticipants([])
      } else {
        setParticipants(data || [])
      }
    } catch (error) {
      console.error('Error fetching participants:', error)
      setParticipants([])
    } finally {
      setLoading(false)
    }
  }

  const inviteParticipants = async (eventId: string, participantIds: string[]) => {
    if (!user || participantIds.length === 0) return false

    try {
      // Create participant records
      const participantData = participantIds.map(userId => ({
        event_id: eventId,
        user_id: userId,
        status: 'pending' as const
      }))

      const { error: participantsError } = await supabase
        .from('event_participants')
        .insert(participantData)

      if (participantsError) {
        console.error('Error creating participants:', participantsError)
        return false
      }

      // Get event details for chat messages
      const { data: eventData } = await supabase
        .from('scheduled_events')
        .select('title, location, event_date, event_time')
        .eq('id', eventId)
        .single()

      if (!eventData) return false

      // Send invite messages to each participant
      for (const participantId of participantIds) {
        try {
          // Get or create chat with this participant
          const chatId = await getOrCreateChat(user.id, participantId)
          
          if (chatId) {
            // Send invite message
            const inviteMessage = `🎉 You've been invited to "${eventData.title}"!\n\n📍 Location: ${eventData.location}\n📅 Date: ${new Date(eventData.event_date).toLocaleDateString()}\n⏰ Time: ${new Date(`2000-01-01T${eventData.event_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\nCheck your invites to accept or decline!`
            
            await supabase
              .from('chat_messages')
              .insert({
                chat_id: chatId,
                sender_id: user.id,
                message: inviteMessage
              })

            // Update chat's last_message_at
            await supabase
              .from('chats')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', chatId)
          }
        } catch (error) {
          console.error(`Error sending invite to participant ${participantId}:`, error)
        }
      }

      return true
    } catch (error) {
      console.error('Error inviting participants:', error)
      return false
    }
  }

  const respondToInvite = async (participantId: string, status: 'accepted' | 'declined') => {
    if (!user) return false

    try {
      const { error } = await supabase
        .from('event_participants')
        .update({ 
          status, 
          responded_at: new Date().toISOString() 
        })
        .eq('id', participantId)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error responding to invite:', error)
        return false
      }

      fetchParticipants() // Refresh participants
      return true
    } catch (error) {
      console.error('Error responding to invite:', error)
      return false
    }
  }

  return {
    participants,
    loading,
    inviteParticipants,
    respondToInvite,
    refetch: fetchParticipants
  }
}

// Hook for getting user's event invites
export function useEventInvites() {
  const { user } = useAuth()
  const [invites, setInvites] = useState<EventInvite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchInvites()
    }
  }, [user])

  const fetchInvites = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('event_participants')
        .select(`
          id,
          event_id,
          status,
          invited_at,
          scheduled_events!event_participants_event_id_fkey (
            title,
            location,
            event_date,
            event_time,
            organizer_id,
            profiles!scheduled_events_organizer_id_fkey (
              name
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('invited_at', { ascending: false })

      if (error) {
        console.error('Error fetching invites:', error)
        setInvites([])
      } else {
        const formattedInvites = (data || []).map(item => ({
          id: item.id,
          event_id: item.event_id,
          title: item.scheduled_events?.title || 'Unknown Event',
          location: item.scheduled_events?.location || 'Unknown Location',
          event_date: item.scheduled_events?.event_date || '',
          event_time: item.scheduled_events?.event_time || '',
          organizer_name: item.scheduled_events?.profiles?.name || 'Unknown Organizer',
          status: item.status,
          invited_at: item.invited_at
        }))
        setInvites(formattedInvites)
      }
    } catch (error) {
      console.error('Error fetching invites:', error)
      setInvites([])
    } finally {
      setLoading(false)
    }
  }

  return { invites, loading, refetch: fetchInvites }
}