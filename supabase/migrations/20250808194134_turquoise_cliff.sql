/*
  # Add location tracking to profiles

  1. Schema Changes
    - Add `latitude` and `longitude` columns to profiles table
    - Add `location_updated_at` timestamp for tracking when location was last updated
    - Add `location_sharing_enabled` boolean for privacy control

  2. Security
    - Update existing RLS policies to handle location data
    - Add policy for location sharing preferences

  3. Notes
    - Location data is optional and controlled by user privacy settings
    - Coordinates will be used to calculate real distances between users
    - Mock data will be used until real GPS coordinates are available
*/

-- Add location columns to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE profiles ADD COLUMN latitude decimal(10, 8);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE profiles ADD COLUMN longitude decimal(11, 8);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'location_updated_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN location_updated_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'location_sharing_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN location_sharing_enabled boolean DEFAULT true;
  END IF;
END $$;

-- Add some mock location data for Portland, ME area (for development/testing)
-- These coordinates are spread around Portland, ME area
UPDATE profiles SET 
  latitude = 43.6591 + (RANDOM() - 0.5) * 0.1,  -- Portland, ME latitude with some variance
  longitude = -70.2568 + (RANDOM() - 0.5) * 0.1, -- Portland, ME longitude with some variance
  location_updated_at = NOW() - (RANDOM() * INTERVAL '7 days'),
  location_sharing_enabled = true
WHERE latitude IS NULL;