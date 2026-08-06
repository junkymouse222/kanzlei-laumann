-- Optional separate Lieferanschrift (NULL/leer = gleich Rechnungsempfänger)
ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS delivery_name text,
  ADD COLUMN IF NOT EXISTS delivery_address text;

COMMENT ON COLUMN public.offer_requests.delivery_name IS
  'Empfängername der Lieferanschrift; NULL/leer = gleich Rechnungsempfänger';
COMMENT ON COLUMN public.offer_requests.delivery_address IS
  'Lieferanschrift (Straße, PLZ, Ort); NULL/leer = gleich Rechnungsempfänger';
