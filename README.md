# The Activity Hub

The Activity Hub is an Expo + React Native app for helping people discover shared activities, chat with each other, coordinate plans, and manage private meetup invites.

The app uses Supabase for authentication, database storage, realtime-style data flows, push token storage, and server-side notification processing.

## What The App Does

Core product areas:

- Home / Ready Today: pick what activity you are up for today
- Forum: activity-specific discussion threads
- Chats: 1-on-1 conversations and private invite flows
- Plans: public activity plans people can create and join
- People: browse users and their activity profiles
- Profile: activity levels, availability, notification settings, and account controls

## Tech Stack

- Expo SDK 53
- React 19
- React Native 0.79
- Expo Router for navigation
- Zustand for shared UI state
- Supabase for auth, database, storage, and Edge Functions
- Expo Notifications for push permissions and device token registration

## App Architecture

### Frontend

The app is organized around Expo Router route groups:

- `app/(auth)`: login and signup flows
- `app/(tabs)`: main tabbed application
- `app/_layout.tsx`: root bootstrapping, fonts, splash, error boundary
- `app/(tabs)/_layout.tsx`: tab bar, unread counts, location prompt, notification prompt

Primary tabs:

- `app/(tabs)/index.tsx`: home
- `app/(tabs)/forum.tsx`: activity forum
- `app/(tabs)/plans.tsx`: activity plans
- `app/(tabs)/people.tsx`: people directory
- `app/(tabs)/profile.tsx`: profile and settings
- `app/(tabs)/chats/*`: direct messages and invite flows

### State

Shared state is intentionally small:

- `store/useActivityStore.ts`: selected activity across Forum / Plans / related surfaces
- `store/useChatStore.ts`: chat-related shared state
- `store/useTutorialStore.ts`: onboarding/tutorial flow state

Most business logic lives in hooks rather than in screens:

- `hooks/useAuth.ts`
- `hooks/useProfile.ts`
- `hooks/usePlans.ts`
- `hooks/useNotifications.ts`
- `hooks/useChats.ts`
- `hooks/useForumMessages.ts`
- `hooks/useTodaySignup.ts`

### Reusable UI

Important components:

- `components/ActivityCarousel.tsx`: shared activity selector used across screens
- `components/TodayActivitySection.tsx`: Home "Ready Today" section
- `components/ForumMessageItem.tsx`: forum message rendering
- `components/TutorialBubble.tsx`: onboarding overlays

### Utility Layer

- `lib/supabase.ts`: Supabase client initialization
- `lib/planDateTime.ts`: local date/time parsing and formatting for plans
- `lib/locationUtils.ts`: location and distance helpers
- `lib/authHelpers.ts`: auth gating helpers

## Backend Architecture

Supabase is responsible for:

- Auth and session persistence
- Relational data for users, activities, messages, plans, joins, and invites
- Push token storage
- Notification job scheduling tables
- Edge Functions for immediate and scheduled push delivery

### Key Supabase Areas

- `supabase/migrations`: schema and backend logic changes
- `supabase/functions/send-push-notification`: immediate push delivery
- `supabase/functions/process-plan-reminders`: scheduled plan reminders
- `supabase/functions/process-meetup-notifications`: scheduled private invite reminders

### Notification Model

There are two notification paths:

1. Immediate notifications via database webhooks:
- `chat_messages` insert
- `forum_messages` insert
- `activity_plans` insert

2. Scheduled reminders via cron-triggered Edge Functions:
- plan reminders
- private invite reminders

## Project Structure

Top-level structure:

```text
app/            Expo Router screens
components/     Shared UI components
contexts/       React context providers
hooks/          Business logic and data hooks
lib/            Utilities and service helpers
store/          Zustand state
supabase/       Migrations, Edge Functions, Supabase config
assets/         Icons, images, fonts, app assets
```

## Local Development

### Requirements

- Node.js
- npm
- Xcode for iOS simulator work
- Supabase project credentials
- Expo / React Native development environment

### Environment Variables

Create a local environment file such as `.env.local` with:

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

These are required by `lib/supabase.ts`.

### Install

```bash
npm install
```

### Run The App

Start Metro:

```bash
npm run dev
```

Run on iOS simulator:

```bash
npx expo run:ios
```

Run on Android:

```bash
npx expo run:android
```

Build web export:

```bash
npm run build:web
```

### Useful Scripts

```bash
npm run dev
npm run ios
npm run android
npm run build:web
npm run lint
```

## Supabase Setup

### Database

Link your project and push migrations:

```bash
supabase db push
```

If migration history is out of sync with a partially-applied remote environment, repair the relevant migration first, then push again.

### Edge Functions

Deploy:

```bash
supabase functions deploy send-push-notification
supabase functions deploy process-plan-reminders
supabase functions deploy process-meetup-notifications
```

### Required Webhooks

Immediate push notifications depend on database webhooks pointing to:

```text
https://<project-ref>.supabase.co/functions/v1/send-push-notification
```

Required webhook sources:

- `chat_messages` on `INSERT`
- `forum_messages` on `INSERT`
- `activity_plans` on `INSERT`

### Required Scheduled Jobs

These should run on a recurring schedule in Supabase:

- `process-plan-reminders`
- `process-meetup-notifications`

Recommended cron:

```text
*/15 * * * *
```

## Important Product Behaviors

### Activity Selection

- Forum and Plans share a selected activity context
- Home / Ready Today is related, but not the same UI surface
- New activity additions must preserve the newly-selected activity instead of snapping back

### Plans

- Plans must be filtered by local date and time, not by date alone
- Expired plans should disappear after their scheduled time passes
- Displayed dates should use local parsing, not `new Date("YYYY-MM-DD")`

### Notifications

- Permission opt-in should be explicit
- When a user enables notifications, all notification categories should turn on together
- Category toggles should stay stable unless the user changes them
- Forum notifications should open the correct activity context

## Common Debugging Areas

If something feels "statey" or inconsistent, these are the first files to check:

- `store/useActivityStore.ts`
- `components/ActivityCarousel.tsx`
- `components/TodayActivitySection.tsx`
- `hooks/useProfile.ts`
- `hooks/usePlans.ts`
- `hooks/useNotifications.ts`
- `lib/planDateTime.ts`

For backend notification issues, start with:

- `supabase/functions/send-push-notification/index.ts`
- `supabase/functions/process-plan-reminders/index.ts`
- `supabase/functions/process-meetup-notifications/index.ts`
- `supabase/migrations/20260307000000_plan_reminder_jobs.sql`
- `supabase/migrations/20260328000000_fix_meetup_notification_schedule.sql`

## Recent Stability Work

Recent work in this repo focused on:

- fixing activity selection races
- fixing plan expiry behavior
- fixing local date rendering bugs
- unifying notification opt-in logic
- fixing forum push routing
- aligning private invite reminder scheduling with product expectations
- syncing Supabase migrations, functions, cron jobs, and webhooks

## Notes For Contributors

- Keep business logic in hooks when possible
- Be careful with date handling; local calendar dates and local wall-clock times matter in this app
- Avoid splitting the same source of truth across multiple screens
- Treat notification changes as both app code and backend infrastructure work

## Current Version

- App version: `1.0.20`
- iOS bundle identifier: `com.campbell3c2.activeportland`
- Android package: `com.campbell3c2.activeportland`

