-- Manuelle Bestätigungen: E-Mail + Verknüpfung zum Rechnungsversand
ALTER TABLE public.manual_confirmations
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS offer_request_id uuid REFERENCES public.offer_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rechnung_nr text,
  ADD COLUMN IF NOT EXISTS rechnung_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS rechnung_error text;

CREATE INDEX IF NOT EXISTS manual_confirmations_offer_request_idx
  ON public.manual_confirmations (offer_request_id)
  WHERE offer_request_id IS NOT NULL;

COMMENT ON COLUMN public.manual_confirmations.customer_email IS
  'Kunden-E-Mail (aus /rechnung-Link oder beim Rechnungsversand nachgetragen)';
COMMENT ON COLUMN public.manual_confirmations.offer_request_id IS
  'Beim Rechnungsversand angelegter offer_requests-Datensatz';
