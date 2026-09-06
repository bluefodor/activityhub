/*
  # Ensure Volleyball exists

  Volleyball was originally seeded in an early migration; this idempotent insert
  guarantees the row exists on any database (safe if already present).
*/

INSERT INTO activities (name, emoji, description)
SELECT 'Volleyball', '🏐', 'Beach and indoor volleyball games'
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE name = 'Volleyball');
