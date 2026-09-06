import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

interface ChatContact {
  id: string
  name: string
  email: string
  avatar_url?: string
  lastChatDate?: string
}

export function useChatContacts() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<ChatContact[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      fetchChatContacts()
    }
  }, [user])

  const fetchChatContacts = async () => {
    if (!user) return

    setLoading(true)
    try {
      // Get all chats for current user
      const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order('last_message_at', { ascending: false })

      if (chatsError) {
        console.error('Error fetching chats:', chatsError)
        setContacts([])
        return
      }

      if (!chatsData || chatsData.length === 0) {
        setContacts([])
        return
      }

      // Get profiles for all chat participants
      const contactProfiles = await Promise.all(
        chatsData.map(async (chat) => {
          const otherUserId = chat.participant_1 === user.id ? chat.participant_2 : chat.participant_1

          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherUserId)
            .single()

          if (profileData) {
            return {
              id: profileData.id,
              name: profileData.name,
              email: profileData.email,
              avatar_url: profileData.avatar_url,
              lastChatDate: chat.last_message_at
            }
          }
          return null
        })
      )

      // Filter out null results and sort by name
      const validContacts = contactProfiles
        .filter((contact): contact is ChatContact => contact !== null)
        .sort((a, b) => a.name.localeCompare(b.name))

      setContacts(validContacts)
    } catch (error) {
      console.error('Error fetching chat contacts:', error)
      setContacts([])
    } finally {
      setLoading(false)
    }
  }

  const searchAllUsers = async (searchTerm: string): Promise<ChatContact[]> => {
    if (!searchTerm.trim() || !user) return []

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', `%${searchTerm.trim()}%`)
        .neq('id', user.id) // Exclude current user
        .limit(10)

      if (error) {
        console.error('Error searching users:', error)
        return []
      }

      return (data || []).map(profile => ({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatar_url: profile.avatar_url
      }))
    } catch (error) {
      console.error('Error searching users:', error)
      return []
    }
  }

  return {
    contacts,
    loading,
    searchAllUsers,
    refetch: fetchChatContacts
  }
}