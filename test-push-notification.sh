#!/bin/bash

# Test Push Notification Edge Function
# Usage: ./test-push-notification.sh USER_ID "Title" "Body"

# Get these from Supabase Dashboard → Settings → API
SUPABASE_URL="https://krhmxspcxymovgorumqw.supabase.co"
# Get your service role key from: Supabase Dashboard → Settings → API → service_role key
# Replace the line below with your actual service role key
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyaG14c3BjeHltb3Znb3J1bXF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzMwODMzOCwiZXhwIjoyMDY4ODg0MzM4fQ.xG2jGu9q3-YBpPedaGUBF2GAs8Bda-qk8jFpzv5bt2Y"

USER_ID=$1
TITLE=$2
BODY=$3

if [ -z "$USER_ID" ] || [ -z "$TITLE" ] || [ -z "$BODY" ]; then
  echo "Usage: ./test-push-notification.sh USER_ID \"Title\" \"Body\""
  echo "Example: ./test-push-notification.sh abc123 \"Test\" \"Hello world\""
  exit 1
fi

echo "🧪 Testing push notification for user: $USER_ID"
echo "Title: $TITLE"
echo "Body: $BODY"
echo ""

curl -X POST "$SUPABASE_URL/functions/v1/send-push-notification" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"recipientUserId\": \"$USER_ID\",
    \"title\": \"$TITLE\",
    \"body\": \"$BODY\",
    \"data\": {
      \"type\": \"test\"
    }
  }" | jq .

echo ""
echo "✅ Test complete. Check the response above."

