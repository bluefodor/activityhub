import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Add error handling for missing environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  throw new Error('Supabase configuration is incomplete')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // saves the user to the phone's disk
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  global: {
    headers: {
      'X-Client-Info': 'activeportland-app',
      'Accept': 'application/json',
    },
  },
})

// Helper function to get current user ID
export const getCurrentUserId = () => {
  return supabase.auth.getUser()
    .then(({ data: { user } }) => user?.id)
    .catch((error) => {
      console.error('Error getting current user:', error)
      return null
    })
}
