-- Einstellungen: zuständiger Verwalter + gespeicherte Bankkonten

CREATE TABLE IF NOT EXISTS public.app_settings (
  site_key   text NOT NULL DEFAULT 'laumann',
  key        text NOT NULL,
  value      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_key, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage app_settings" ON public.app_settings;
CREATE POLICY "Admins manage app_settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key   text NOT NULL DEFAULT 'laumann',
  label      text NOT NULL,
  inhaber    text NOT NULL,
  bank_name  text NOT NULL,
  iban       text NOT NULL,
  bic        text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_accounts_site_idx
  ON public.bank_accounts (site_key, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage bank_accounts" ON public.bank_accounts;
CREATE POLICY "Admins manage bank_accounts"
  ON public.bank_accounts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Snapshot des zuständigen Verwalters je Angebot/Rechnung
ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS verwalter_name text,
  ADD COLUMN IF NOT EXISTS verwalter_role text;

-- Defaults für Laumann
INSERT INTO public.app_settings (site_key, key, value)
VALUES
  ('laumann', 'active_verwalter_name', 'Erik Laumann'),
  ('laumann', 'active_verwalter_role', 'Rechtsanwalt · Insolvenzverwalter')
ON CONFLICT (site_key, key) DO NOTHING;
