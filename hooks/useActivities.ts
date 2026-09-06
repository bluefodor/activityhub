import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Activity } from '@/types/database'

// Activities removed from the app (hidden from all lists and Select an Activity). Export for carousel/profile.
export const EXCLUDED_ACTIVITY_NAMES = [
  'Skiing',
  'Skiing/Snowboarding',
  'Arts and Crafts',
]

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActivities()
  }, [])

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .order('name')

      if (error) {
        console.error('Error fetching activities:', error)
      } else {
        const filtered = (data || []).filter(
          (a) => !EXCLUDED_ACTIVITY_NAMES.includes(a.name)
        )
        // Home-page order: running > pickleball > hiking > rock climbing > live events > biking > tennis > soccer/basketball > sailing, then the rest
        const displayOrder = [
          'Running',
          'Pickleball',
          'Hiking/Walking',
          'Rock Climbing',
          'Live Events',
          'Biking',
          'Tennis',
          'Soccer',
          'Basketball',
          'Volleyball',
          'Sailing',
          'Cycling',
          'Yoga',
          'Swimming',
          'Weightlifting',
          'Workouts',
          'Bar Hopping',
          'Surfing',
          'Disc Golf',
          'Board/Card Games',
          'Video Games',
          'Music',
          'Chess',
          'Study',
          'Book Club',
          'Workout',
        ];
        
        const sortedActivities = filtered.sort((a, b) => {
          const indexA = displayOrder.indexOf(a.name)
          const indexB = displayOrder.indexOf(b.name)
          
          if (indexA !== -1 && indexB !== -1) return indexA - indexB
          if (indexA !== -1) return -1
          if (indexB !== -1) return 1
          return a.name.localeCompare(b.name)
        })
        setActivities(sortedActivities)
      }
    } catch (error) {
      console.error('Error fetching activities:', error)
    } finally {
      setLoading(false)
    }
  }

  return { activities, loading, refetch: fetchActivities }
}