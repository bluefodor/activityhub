# Send Push Notification Edge Function

This Edge Function sends push notifications via Expo's Push Notification API.

## Deployment

To deploy this function to Supabase:

```bash
supabase functions deploy send-push-notification
```

## Usage

The function expects a POST request with the following JSON body:

```json
{
  "recipientUserId": "user-uuid",
  "title": "Notification Title",
  "body": "Notification body text",
  "data": {
    "type": "new_message",
    "chatId": "chat-uuid",
    "otherUserId": "user-uuid"
  }
}
```

## Environment Variables

The function uses the following environment variables (automatically set by Supabase):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

## How it works

1. Receives notification request with recipient user ID
2. Looks up all push tokens for that user (supports multiple devices)
3. Sends push notifications to Expo's API for each token
4. Returns success/failure status

