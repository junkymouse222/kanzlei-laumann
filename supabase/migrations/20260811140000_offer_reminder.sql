-- Erinnerungsversand für offene Angebote

ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_message_id text;
