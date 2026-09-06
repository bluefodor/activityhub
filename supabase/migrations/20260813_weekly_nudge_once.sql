-- Ensure Thursday weekly nudge can only send once per Eastern calendar day,
-- even if cron-job.org retries or multiple schedulers fire the same endpoint.
-- Also drop the in-DB weekly cron so only one external scheduler should trigger it.

CREATE TABLE IF NOT EXISTS public.notification_campaign_runs (
  campaign text NOT NULL,
  period_key text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  sent_count integer,
  PRIMARY KEY (campaign, period_key)
);

COMMENT ON TABLE public.notification_campaign_runs IS
  'Idempotency ledger for broadcast pushes (e.g. weekly_nudge). One row per campaign+period.';

ALTER TABLE public.notification_campaign_runs ENABLE ROW LEVEL SECURITY;

-- Service role / edge functions only; no client policies.

SELECT cron.unschedule('weekly-engagement-nudge')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-engagement-nudge'
);
