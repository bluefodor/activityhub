/*
  # Add Sample Activities

  1. New Data
    - Populate activities table with sample activities and their emojis
    - Each activity includes name, emoji, and description

  2. Security
    - Uses existing RLS policies on activities table
*/

INSERT INTO activities (name, emoji, description) VALUES
  ('Tennis', '🎾', 'Find tennis partners for singles or doubles matches'),
  ('Pickleball', '🏓', 'Join the fastest growing racquet sport community'),
  ('Rock Climbing', '🧗', 'Indoor and outdoor climbing adventures'),
  ('Board Games', '🎲', 'Strategy games, party games, and classic board games'),
  ('Hiking', '🥾', 'Explore trails and nature with fellow hikers'),
  ('Sailing', '⛵', 'Set sail with experienced and beginner sailors'),
  ('Running', '🏃', 'Running groups for all paces and distances'),
  ('Walking', '🚶', 'Casual walks and walking groups'),
  ('Live Events', '🎭', 'Concerts, theater, and live entertainment'),
  ('Biking', '🚴', 'Road cycling, mountain biking, and casual rides'),
  ('Skiing', '⛷️', 'Alpine and cross-country skiing adventures'),
  ('Surfing', '🏄', 'Catch waves with the surfing community'),
  ('Volleyball', '🏐', 'Beach and indoor volleyball games'),
  ('Disc Golf', '🥏', 'Precision disc throwing sport'),
  ('Video Games', '🎮', 'Gaming sessions and tournaments'),
  ('Music', '🎵', 'Jam sessions, concerts, and music appreciation'),
  ('Bar Hopping', '🍻', 'Social drinks and nightlife exploration'),
  ('Yoga', '🧘', 'All levels of yoga practice and meditation'),
  ('Chess', '♟️', 'Strategic chess matches and tournaments'),
  ('Study', '📚', 'Study groups and academic collaboration'),
  ('Workout', '💪', 'Fitness training and gym partnerships')
ON CONFLICT (name) DO NOTHING;