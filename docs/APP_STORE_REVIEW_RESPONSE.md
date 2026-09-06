# App Store Connect — Review reply (copy/paste)

Use this when replying to submission `53f1ec2c-a0f7-4d22-8481-5598a7ecca16`.

---

## Guideline 5.1.1(v) — Account deletion

We added an in-app **Delete My Account** flow:

**Profile → Settings (gear) → Account → Delete My Account**

The user confirms twice in the app, then the account and associated data are permanently deleted without contacting support, registering again, or adding a password beyond their existing login.

---

## Guideline 2.1(a) — Contact Support / iPad

The previous **Contact Support** button opened the device mail app via `mailto:`, which failed on the review iPad when Mail was not configured. That path was removed. Account deletion is now completed entirely in the app as described above.

We tested deletion on iPhone and iPad (including iPad Air 11-inch class devices).

---

## Guideline 2.1 — Why Date of Birth at registration?

**Date of Birth** is collected only during sign-up to verify the user is **18 years or older**. The Activity Hub is an adults-only community for meeting activity partners.

- DOB is validated on the device at registration and **is not stored** in our database (we only save name, email, and profile/activity preferences).
- This supports safety and compliance with our Terms (no minors on the platform).

---

## Before you resubmit

1. Deploy the Supabase Edge Function: `supabase functions deploy delete-account`
2. Ship a new build with these changes (version > 1.0.28).
3. In **Review Notes**, tell reviewers: *Sign in → Profile → gear icon → Account → Delete My Account.*
