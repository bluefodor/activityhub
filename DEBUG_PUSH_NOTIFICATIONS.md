# Debugging Push Notifications

## Quick Debugging Steps

### 1. Check if Push Token is Stored
Run this in Supabase SQL Editor:
```sql
SELECT * FROM push_tokens WHERE user_id = 'YOUR_USER_ID';
```
Replace `YOUR_USER_ID` with your actual user ID from the `profiles` table.

### 2. Check Edge Function Logs
- Go to Supabase Dashboard → Edge Functions → send-push-notification → Logs
- Look for errors or successful invocations

### 3. Check Webhook Logs
- Go to Supabase Dashboard → Database → Webhooks
- Click on your webhook → View logs
- Check if it's firing when messages are sent

### 4. Test Edge Function Directly
Use this curl command (replace with your values):
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientUserId": "USER_ID_TO_SEND_TO",
    "title": "Test Notification",
    "body": "This is a test"
  }'
```

### 5. Check App Logs
In your app, check the console for:
- "Push notification token: ..." (should appear after login)
- "✅ Push token stored successfully"
- Any error messages

## Common Issues

1. **No push token stored**: Check if permissions were granted and project ID is correct
2. **Webhook not firing**: Check webhook configuration and database trigger
3. **Edge Function error**: Check Edge Function logs for specific errors
4. **Token format wrong**: Expo push tokens should start with "ExponentPushToken[...]"

## Faster Testing with Development Builds

Instead of TestFlight, use development builds for faster iteration:
1. Build development version: `eas build --platform ios --profile development`
2. Install via Expo Go or direct install
3. Test and iterate much faster!

