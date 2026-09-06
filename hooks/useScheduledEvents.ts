import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { useActivityStore } from '@/store/useActivityStore';

interface ScheduledEvent {
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
  profiles?: {
    name: string
    avatar_url?: string
  }
  activities?: {
    name: string
    emoji: string
  }
}

export function useScheduledEvents() {
  const { user } = useAuth()
  const { activityId } = useActivityStore()
  const [events, setEvents] = useState<ScheduledEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
  }, [activityId])

  const fetchEvents = async () => {
    try {
      let query = supabase
        .from('scheduled_events')
        .select(`
          *,
          profiles!scheduled_events_organizer_id_fkey (
            name,
            avatar_url
          ),
          activities (
            name,
            emoji
          )
        `)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })

      // If we have an activity selected, filter by it
      if (activityId) {
        query = query.eq('activity_id', activityId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching scheduled events:', error)
        setEvents([])
      } else {
        setEvents(data || [])
      }
    } catch (error) {
      console.error('Error fetching scheduled events:', error)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  const createEvent = async (eventData: {
    title: string
    location: string
    event_date: string
    event_time: string
    description?: string
  }) => {
    if (!user) return false

    try {
      const { error } = await supabase
        .from('scheduled_events')
        .insert({
          organizer_id: user.id,
          activity_id: activityId || null,
          title: eventData.title,
          location: eventData.location,
          event_date: eventData.event_date,
          event_time: eventData.event_time,
          description: eventData.description || '',
        })

      if (error) {
        console.error('Error creating event:', error)
        return false
      }

      fetchEvents() // Refresh events
      return true
    } catch (error) {
      console.error('Error creating event:', error)
      return false
    }
  }

  const deleteEvent = async (eventId: string) => {
    if (!user) return false

    try {
      const { error } = await supabase
        .from('scheduled_events')
        .delete()
        .eq('id', eventId)
        .eq('organizer_id', user.id) // Ensure user can only delete their own events

      if (error) {
        console.error('Error deleting event:', error)
        return false
      }

      fetchEvents() // Refresh events
      return true
    } catch (error) {
      console.error('Error deleting event:', error)
      return false
    }
  }

  return {
    events,
    loading,
    createEvent,
    deleteEvent,
    refetch: fetchEvents
  }
}