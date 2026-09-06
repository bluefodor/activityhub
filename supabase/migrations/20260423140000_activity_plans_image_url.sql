-- Optional cover image for activity plans (public URL in storage).

ALTER TABLE public.activity_plans
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.activity_plans.image_url IS
  'Optional public URL for a plan photo (e.g. Supabase Storage).';
