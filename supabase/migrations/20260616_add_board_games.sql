/*
  # Re-add Board/Card Games activity

  Restores Board/Card Games after 20260305000000 removed it.
  Safe to run multiple times (no duplicates).
*/

UPDATE activities
SET
  name = 'Board/Card Games',
  description = 'Strategy games, party games, and board or card games with friends'
WHERE name = 'Board Games';

INSERT INTO activities (name, emoji, description)
SELECT
  'Board/Card Games',
  '🎲',
  'Strategy games, party games, and board or card games with friends'
WHERE NOT EXISTS (
  SELECT 1 FROM activities WHERE name IN ('Board Games', 'Board/Card Games')
);
