/*
  # Remove Skiing, Board Games, and Arts and Crafts activities

  1. Summary
    - Remove these activities from the app everywhere (all name variants):
      Skiing, Skiing/Snowboarding, Board Games, Board/Card Games, Arts and Crafts
    - Clean up dependent rows (user_activity_skills, forum_messages, message_reactions)
    - activity_plans and today_activity_signups CASCADE on activity delete
    - scheduled_events.activity_id will SET NULL on activity delete
*/

-- Names to remove (all variants seen in app or DB)
-- Skiing, Skiing/Snowboarding, Board Games, Board/Card Games, Arts and Crafts

-- Remove reactions on forum messages that belong to these activities
DELETE FROM message_reactions
WHERE message_type = 'forum'
  AND message_id IN (
    SELECT id FROM forum_messages
    WHERE activity_id IN (
      SELECT id FROM activities WHERE name IN (
        'Skiing', 'Skiing/Snowboarding', 'Board Games', 'Board/Card Games', 'Arts and Crafts'
      )
    )
  );

DELETE FROM forum_messages
WHERE activity_id IN (
  SELECT id FROM activities WHERE name IN (
    'Skiing', 'Skiing/Snowboarding', 'Board Games', 'Board/Card Games', 'Arts and Crafts'
  )
);

DELETE FROM user_activity_skills
WHERE activity_id IN (
  SELECT id FROM activities WHERE name IN (
    'Skiing', 'Skiing/Snowboarding', 'Board Games', 'Board/Card Games', 'Arts and Crafts'
  )
);

DELETE FROM activities
WHERE name IN (
  'Skiing',
  'Skiing/Snowboarding',
  'Board Games',
  'Board/Card Games',
  'Arts and Crafts'
);
