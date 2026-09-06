import * as Location from 'expo-location';

/**
 * Location utilities for calculating distances between users
 */

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculate the distance between two points using the Haversine formula
 * Returns distance in miles
 */
export function calculateDistance(
  point1: LocationCoordinates,
  point2: LocationCoordinates
): number {
  const R = 3959; // Earth's radius in miles
  
  const lat1Rad = (point1.latitude * Math.PI) / 180;
  const lat2Rad = (point2.latitude * Math.PI) / 180;
  const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Compact distance for people list rows: <1mi, 1mi–20mi, +20mi
 */
export function formatPeopleListDistance(distanceMiles: number): string {
  if (distanceMiles > 20) return '+20mi';
  if (distanceMiles < 1) return '<1mi';
  const rounded = Math.round(distanceMiles);
  if (rounded < 1) return '<1mi';
  if (rounded > 20) return '+20mi';
  return `${rounded}mi`;
}

/**
 * Format distance for display (profiles, detail views)
 */
export function formatDistance(distance: number): string {
  if (distance < 0.1) {
    return 'Very close';
  }
  if (distance < 1) {
    return `${(distance * 5280).toFixed(0)} ft`;
  }
  const miles = Math.round(distance);
  return miles < 1 ? '1 mi' : `${miles} mi`;
}

/**
 * Get user's REAL current location
 */
export async function getCurrentLocation(): Promise<LocationCoordinates | null> {
  try {
    // check permissions first
    const { status } = await Location.getForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('Permission not granted for location');
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
}

/**
 * Update user's location in the database
 */
export async function updateUserLocation(
  supabase: any,
  userId: string,
  coordinates: LocationCoordinates
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        location_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating location:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating location:', error);
    return false;
  }
}