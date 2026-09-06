/*
  # Clean up unused database tables

  1. Tables to Remove
    - `group_chats` - Group chat functionality was removed
    - `group_chat_members` - Related to group chats
    - `group_chat_messages` - Related to group chats

  2. Security
    - Drop all related RLS policies
    - Remove foreign key constraints safely

  3. Notes
    - Preserves all core functionality: profiles, activities, user skills, 1-on-1 chats, forum messages, scheduled events, and meetup invites
    - Uses IF EXISTS to prevent errors if tables don't exist
*/

-- Drop group chat related tables (in reverse dependency order)
DROP TABLE IF EXISTS group_chat_messages CASCADE;
DROP TABLE IF EXISTS group_chat_members CASCADE;
DROP TABLE IF EXISTS group_chats CASCADE;