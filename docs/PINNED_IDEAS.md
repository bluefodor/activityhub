# Pinned ideas

Ideas to revisit later. Not in active development.

---

## App-wide announcements channel (pinned Jul 11, 2026)

**Status:** Idea approved — not started

**Concept:** Official broadcast from “The Activity Hub” (admin/app account only). All users can read; optional one-level replies as comments on each announcement — not a free-form forum.

**Placement:** Chats tab only — pinned section at top (e.g. “Announcements” or “Portland Lounge”).

**Different from Forum:**

| | Forum | Announcements |
|---|--------|----------------|
| Who can post new topics | Anyone | Only app/admin |
| Audience | Per activity | All users |
| Purpose | Activity coordination & chat | Product news, community updates, citywide events |
| Replies | Peer conversation | Comments on a bulletin |

**Suggested v1:**

1. Pinned row at top of Chats tab → “Announcements”
2. Admin posts from backend / Supabase dashboard tool
3. Users read + optional single-level replies (no nested threads, no user-created top-level posts)
4. Push notifications for new announcements only — not every reply
5. In-app copy: “Activity chat lives in Forums. Updates from us live here.”

**Open questions when building:**

- Admin posting UI (Supabase table + SQL, Retool, or in-app admin flag)
- Whether replies need moderation
- Muted-by-default vs opt-in for announcement pushes

---

## Switch chat screens to inverted FlatList (pinned Jul 30, 2026)

**Status:** Idea approved — not started

**Concept:** Replace the current non-inverted FlatList + `scrollToEnd` pattern in both `chats/[id].tsx` and `chats/group/[id].tsx` with an inverted FlatList (newest message first). This eliminates the visible "jump to bottom" when opening a chat — the list opens directly at the latest message with no scroll animation needed.

**Why it's deferred:** Meaningful regression risk. Touches data reversal, date separators, reply-to rendering, read receipt scroll logic, and keyboard behavior in two already-stabilized complex screens.

**What to do when building:**
1. Reverse data array before passing to FlatList (`[...messages].reverse()`)
2. Set `inverted={true}` on both FlatLists
3. Rewrite date separator logic to account for reversed order
4. Remove all `scrollChatListToLatest` / retry logic — no longer needed
5. Rewrite "stick to bottom" auto-scroll for new messages (inverted = stick to top)
6. Verify group chat reply-to, read receipts, and image messages still render correctly
7. Remove or simplify `lib/chatListScroll.ts`

---

## Auto-delete old chat messages (pinned Jul 30, 2026)

**Status:** Idea — not started

**Concept:** Add a `pg_cron` job to hard-delete chat messages older than a set threshold (e.g. 1 year) to keep the database lean. Messages already support soft-delete via `deleted_at`; the cleanup job could target soft-deleted messages first, then optionally all old messages.

**Suggested SQL when ready:**

```sql
SELECT cron.schedule(
  'delete-old-messages',
  '0 3 * * 0', -- weekly Sunday at 3am
  $$DELETE FROM chat_messages WHERE created_at < now() - interval '1 year'$$
);
```

**Open questions when building:**

- Retention window (6 months? 1 year? soft-deleted only vs all?)
- Whether to also clean `plan_group_chat_messages`
- User expectation — should the app surface a note that messages older than X are not retained?
