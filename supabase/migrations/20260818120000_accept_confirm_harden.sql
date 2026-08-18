-- Scanner-Härtung: Bestätigungsseite muss vorher geladen worden sein;
-- User-Agent der Annahme für Audit speichern.

ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS accept_confirm_shown_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_user_agent text;

CREATE INDEX IF NOT EXISTS offer_requests_accept_confirm_shown_idx
  ON public.offer_requests (accept_confirm_shown_at)
  WHERE accept_confirm_shown_at IS NOT NULL AND accepted_at IS NULL;
