-- Allow anonymous users to read forum messages
-- This enables browsing without login per Apple's requirements

-- Policy for anonymous users to read forum messages
CREATE POLICY "Anonymous users can read forum messages"
  ON forum_messages
  FOR SELECT
  TO anon
  USING (true);

-- Also allow anonymous users to read activities
CREATE POLICY "Anonymous users can read activities"
  ON activities
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to read user_activity_skills (to see people)
CREATE POLICY "Anonymous users can read user activity skills"
  ON user_activity_skills
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to read profiles (to see user names/avatars)
CREATE POLICY "Anonymous users can read public profile info"
  ON profiles
  FOR SELECT
  TO anon
  USING (true);

