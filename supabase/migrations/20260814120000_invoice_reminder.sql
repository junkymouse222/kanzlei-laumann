-- Zahlungserinnerung für offene Rechnungen

ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS invoice_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_reminder_message_id text;
