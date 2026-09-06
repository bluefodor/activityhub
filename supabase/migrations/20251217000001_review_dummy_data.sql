/*
  # Review Dummy/Test Data Before Deletion
  
  Run this FIRST to see what will be deleted.
  Review the results, then run the removal script if everything looks correct.
*/

-- Step 1: List all users and their email addresses
SELECT 
  u.id,
  u.email,
  u.created_at,
  p.name,
  COUNT(DISTINCT uas.id) as activity_count,
  COUNT(DISTINCT fm.id) as forum_posts,
  COUNT(DISTINCT c.id) as chats
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
LEFT JOIN user_activity_skills uas ON uas.user_id = u.id
LEFT JOIN forum_messages fm ON fm.user_id = u.id
LEFT JOIN chats c ON c.participant_1 = u.id OR c.participant_2 = u.id
GROUP BY u.id, u.email, u.created_at, p.name
ORDER BY u.created_at DESC;

-- Step 2: Find test/demo accounts (adjust email patterns as needed)
SELECT 
  u.id,
  u.email,
  u.created_at,
  'Potential test account' as reason
FROM auth.users u
WHERE 
  u.email ILIKE '%test%'
  OR u.email ILIKE '%demo%'
  OR u.email ILIKE '%example.com%'
  OR u.email ILIKE '%admin@test%'
  -- Note: campbell3c2@gmail.com is preserved for Apple/Google review
ORDER BY u.created_at DESC;

-- Step 3: Find test forum messages
SELECT 
  fm.id,
  fm.message,
  fm.created_at,
  u.email as user_email,
  a.name as activity_name
FROM forum_messages fm
JOIN auth.users u ON u.id = fm.user_id
JOIN activities a ON a.id = fm.activity_id
WHERE 
  fm.message ILIKE '%test%'
  OR fm.message ILIKE '%demo%'
  OR fm.message ILIKE '%sample%'
  OR fm.message = 'Test message'
  OR fm.message = 'Demo post'
  OR LENGTH(fm.message) < 10
ORDER BY fm.created_at DESC;

-- Step 4: Count data per user (to identify test accounts)
SELECT 
  u.email,
  COUNT(DISTINCT uas.id) as activities,
  COUNT(DISTINCT fm.id) as forum_posts,
  COUNT(DISTINCT c.id) as chats,
  COUNT(DISTINCT cm.id) as chat_messages
FROM auth.users u
LEFT JOIN user_activity_skills uas ON uas.user_id = u.id
LEFT JOIN forum_messages fm ON fm.user_id = u.id
LEFT JOIN chats c ON c.participant_1 = u.id OR c.participant_2 = u.id
LEFT JOIN chat_messages cm ON cm.sender_id = u.id
GROUP BY u.email
ORDER BY 
  (COUNT(DISTINCT uas.id) + COUNT(DISTINCT fm.id) + COUNT(DISTINCT c.id)) DESC;

