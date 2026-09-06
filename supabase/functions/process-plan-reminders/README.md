# process-plan-reminders

Edge Function that sends push reminders for plans the user has joined (1 day and 1 hour before the event).

## Deploy

```bash
supabase functions deploy process-plan-reminders
```

## Schedule (required)

Run this function on a schedule (e.g. every 15 minutes) so due jobs are processed:

- **Supabase Dashboard**: Project → Edge Functions → process-plan-reminders → Cron (add e.g. `*/15 * * * *` for every 15 min), or
- **External cron**: `curl -X POST "https://<project-ref>.supabase.co/functions/v1/process-plan-reminders" -H "Authorization: Bearer <anon-or-service-role-key>"`

Jobs are created automatically when a user joins a plan (`plan_joins` INSERT) and canceled when they leave (`plan_joins` DELETE). Users can disable reminders in Profile → Settings → Notifications → Plan Reminders.
