/*
  # Add Database Webhook for Push Notifications

  This creates a function that will be called by Supabase Database Webhooks.
  You'll need to set up the webhook in Supabase Dashboard:
  
  1. Go to Database > Webhooks
  2. Create new webhook on chat_messages table
  3. Event: INSERT
  4. HTTP Request URL: https://YOUR_PROJECT.supabase.co/functions/v1/send-push-notification
  5. HTTP Method: POST
  6. HTTP Headers: 
     - Authorization: Bearer YOUR_SERVICE_ROLE_KEY
     - Content-Type: application/json
  7. HTTP Request Body (transform the payload):
     {
       "recipientUserId": "{{chat.participant_1 == new.sender_id ? chat.participant_2 : chat.participant_1}}",
       "title": "New message from {{sender.name}}",
       "body": "{{new.message || '📷 Photo'}}",
       "data": {
         "type": "new_message",
         "chatId": "{{new.chat_id}}",
         "otherUserId": "{{new.sender_id}}"
       }
     }

  Alternatively, you can use this simpler approach with a function that queues notifications
  and processes them via a separate mechanism.
*/

-- Create a function that prepares notification data
-- This will be used by the webhook or can be called directly
CREATE OR REPLACE FUNCTION prepare_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  recipient_user_id uuid;
  sender_name text;
  message_text text;
BEGIN
  -- Get the recipient user ID (the person who should receive the notification)
  SELECT 
    CASE 
      WHEN c.participant_1 = NEW.sender_id THEN c.participant_2
      ELSE c.participant_1
    END
  INTO recipient_user_id
  FROM chats c
  WHERE c.id = NEW.chat_id;

  -- If no recipient found, exit
  IF recipient_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get sender's name
  SELECT name INTO sender_name
  FROM profiles
  WHERE id = NEW.sender_id;

  -- Get message text (truncate if too long)
  message_text := COALESCE(NEW.message, '📷 Photo');
  IF length(message_text) > 100 THEN
    message_text := left(message_text, 100) || '...';
  END IF;

  -- The actual HTTP call will be made by Supabase Database Webhooks
  -- or you can use pg_net extension if available
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (this just prepares the data, webhook does the actual HTTP call)
-- Note: Using IF NOT EXISTS equivalent by checking if trigger exists first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_prepare_push_notification'
  ) THEN
    CREATE TRIGGER trigger_prepare_push_notification
      AFTER INSERT ON chat_messages
      FOR EACH ROW
      EXECUTE FUNCTION prepare_push_notification();
  END IF;
END $$;

/*
  IMPORTANT: To complete the setup, you need to:
  
  1. Deploy the Edge Function:
     supabase functions deploy send-push-notification
  
  2. Set up Database Webhook in Supabase Dashboard:
     - Go to Database > Webhooks
     - Create webhook on chat_messages table
     - Event: INSERT
     - URL: https://YOUR_PROJECT.supabase.co/functions/v1/send-push-notification
     - Method: POST
     - Headers: Authorization: Bearer YOUR_SERVICE_ROLE_KEY
     - Body: See example above
  
  OR use pg_net extension if available in your Supabase project.
*/

