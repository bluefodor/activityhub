import { updateUserLocation } from '@/lib/locationUtils';
import { supabase } from '@/lib/supabase';
import * as Location from 'expo-location';
import { useState } from 'react';
import { useAuth } from './useAuth';

export function useLocationTracking() {
  const { user } = useAuth()
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [locationPermission, setLocationPermission] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false)

  const requestLocationPermission = async () => {
    if (hasRequestedPermission) return locationPermission
    
    setLoading(true)
    
    try {

      // Check current permission status first
      const { status: currentStatus } = await Location.getForegroundPermissionsAsync()
      
      if (currentStatus === 'granted') {
        setLocationPermission(true)
        setHasRequestedPermission(true)
        await updateLocation()
        return true
      }

      // Request permission if not already granted
      const { status } = await Location.requestForegroundPermissionsAsync()
      setHasRequestedPermission(true)
      
      if (status !== 'granted') {
        console.log('Location permission denied')
        setLocationPermission(false)
        return false
      }

      setLocationPermission(true)
      await updateLocation()
      return true

    } catch (error) {
      console.error('Error getting location:', error)
      setLocationPermission(false)
      return false
    } finally {
      setLoading(false)
    }
  }

  const updateLocation = async () => {
    if (!user) return

    try {
      const { status } = await Location.getForegroundPermissionsAsync()
      
      if (status !== 'granted') {
        return
      }

      // Timeout so we don't hang when location is unavailable (e.g. simulator, disabled)
      const timeoutMs = 10000
      const currentLocation = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Location request timed out')), timeoutMs)
        ),
      ])

      const coordinates = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      }

      setLocation(coordinates)
      await updateUserLocation(supabase, user.id, coordinates)
    } catch {
      // Location unavailable (simulator, disabled, or timeout) — fail silently so we don't surface a red error
    }
  }

  return {
    location,
    locationPermission,
    loading,
    updateLocation,
    requestLocationPermission
  }
}