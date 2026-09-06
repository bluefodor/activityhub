# delete-account

Permanently deletes the signed-in user's account (profile data + `auth.users`).

Deploy after adding:

```bash
supabase functions deploy delete-account --no-verify-jwt
```

The client sends the user's session JWT in `Authorization`; the function validates it and uses the service role only for deletion.
