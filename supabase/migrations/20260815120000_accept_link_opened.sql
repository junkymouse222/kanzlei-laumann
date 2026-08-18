-- Trackt, ob der Annahme-Link (Bestätigungsseite) geöffnet wurde,
-- ohne dass das Angebot verbindlich angenommen wurde.

ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS accept_link_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS accept_link_open_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS offer_requests_accept_link_opened_idx
  ON public.offer_requests (accept_link_opened_at)
  WHERE accept_link_opened_at IS NOT NULL AND accepted_at IS NULL;
