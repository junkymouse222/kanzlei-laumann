-- Spedition Hausmann: Sendungsnummer + Tracking-URL je Angebot/Rechnung
ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text;

COMMENT ON COLUMN public.offer_requests.tracking_number IS
  'Sendungsnummer Spedition Hausmann (z. B. SH-XXXXXXXX)';
COMMENT ON COLUMN public.offer_requests.tracking_url IS
  'Öffentliche Tracking-URL (https://spedition-hausmann.de/track/…)';

CREATE INDEX IF NOT EXISTS offer_requests_tracking_number_idx
  ON public.offer_requests (tracking_number)
  WHERE tracking_number IS NOT NULL;
