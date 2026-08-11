-- =============================================================================
-- Kanzlei Laumann - DB-Schema für Supabase
-- Auf einer frischen Supabase-Instanz einspielen:
--   docker exec -i supabase-db psql -U postgres -d postgres < schema.sql
-- =============================================================================

-- ---------- Enum: app_role ---------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Helper: updated_at ----------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------- user_roles -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------- has_role() -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- ---------- Auto-Admin bei bestimmter E-Mail ---------------------------------
-- WICHTIG: Vor dem Einspielen die E-Mail-Adresse auf den ersten Admin
-- (den Kanzlei-Login) anpassen. Diese Adresse erhält beim Registrieren auf
-- /auth automatisch die Rolle 'admin'.
CREATE OR REPLACE FUNCTION public.grant_admin_for_designated_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF lower(NEW.email) = 'kontakt@laumann-kanzlei.de' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_designated_email();

-- ---------- offer_requests ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offer_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  angebot_nr          text NOT NULL,
  rechnung_nr         text,
  ref_source          text,
  -- Site-/Mandanten-Schlüssel (bei geteilter DB Pflicht; z. B. 'laumann' / 'adler')
  site_key            text,

  customer_name       text NOT NULL,
  customer_company    text,
  customer_email      text NOT NULL,
  customer_phone      text,
  customer_address    text NOT NULL,
  customer_ust_id     text,
  -- Optional: separate Lieferanschrift (NULL/leer = gleich Rechnungsempfänger)
  delivery_name       text,
  delivery_address    text,
  -- Spedition Hausmann (beim Rechnungsversand per API angelegt)
  tracking_number     text,
  tracking_url        text,
  message             text,

  status              text NOT NULL DEFAULT 'pending',
  scheduled_send_at   timestamptz NOT NULL,
  sent_at             timestamptz,
  offer_html          text,
  resend_message_id   text,
  error_message       text,

  accept_token        uuid NOT NULL DEFAULT gen_random_uuid(),
  accepted_at         timestamptz,
  accepted_ip         text,

  rechnung_status     text NOT NULL DEFAULT 'none',
  rechnung_sent_at    timestamptz,
  rechnung_faellig_am date,
  rechnung_message_id text,
  rechnung_error      text,

  pay_token           uuid NOT NULL DEFAULT gen_random_uuid(),
  paid_at             timestamptz,
  paid_ip             text,

  bank_inhaber        text,
  bank_name           text,
  bank_iban           text,
  bank_bic            text,

  -- Zuständiger Insolvenzverwalter (Snapshot beim Versand)
  verwalter_name      text,
  verwalter_role      text,

  -- Erinnerungsmail an Kunden (noch nicht angenommen)
  reminder_sent_at    timestamptz,
  reminder_message_id text,

  subtotal            numeric NOT NULL DEFAULT 0,
  rabatt_rate         numeric NOT NULL DEFAULT 5,
  rabatt              numeric NOT NULL DEFAULT 0,
  mwst_rate           numeric NOT NULL DEFAULT 19,
  mwst                numeric NOT NULL DEFAULT 0,
  total               numeric NOT NULL DEFAULT 0,
  lieferkosten        numeric NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_requests_status_idx           ON public.offer_requests (status);
CREATE INDEX IF NOT EXISTS offer_requests_scheduled_idx        ON public.offer_requests (scheduled_send_at);
CREATE INDEX IF NOT EXISTS offer_requests_site_key_idx         ON public.offer_requests (site_key);
CREATE INDEX IF NOT EXISTS offer_requests_accept_token_idx     ON public.offer_requests (accept_token);
CREATE INDEX IF NOT EXISTS offer_requests_pay_token_idx        ON public.offer_requests (pay_token);

GRANT INSERT                             ON public.offer_requests TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE             ON public.offer_requests TO authenticated;
GRANT ALL                                ON public.offer_requests TO service_role;

ALTER TABLE public.offer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create offer requests"    ON public.offer_requests;
DROP POLICY IF EXISTS "Admins can view offer requests"      ON public.offer_requests;
DROP POLICY IF EXISTS "Admins can update offer requests"    ON public.offer_requests;
DROP POLICY IF EXISTS "Admins can delete offer requests"    ON public.offer_requests;

CREATE POLICY "Anyone can create offer requests"
  ON public.offer_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view offer requests"
  ON public.offer_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update offer requests"
  ON public.offer_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete offer requests"
  ON public.offer_requests FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS offer_requests_set_updated_at ON public.offer_requests;
CREATE TRIGGER offer_requests_set_updated_at
  BEFORE UPDATE ON public.offer_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- offer_request_items ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.offer_request_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid NOT NULL REFERENCES public.offer_requests(id) ON DELETE CASCADE,
  pos            integer NOT NULL,
  artikel        text NOT NULL,
  name           text NOT NULL,
  beschreibung   text,
  einheit        text NOT NULL,
  menge          integer NOT NULL,
  einzelpreis    numeric NOT NULL,
  position_total numeric NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_request_items_request_idx ON public.offer_request_items (request_id);

GRANT INSERT                 ON public.offer_request_items TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.offer_request_items TO authenticated;
GRANT ALL                    ON public.offer_request_items TO service_role;

ALTER TABLE public.offer_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create offer items" ON public.offer_request_items;
DROP POLICY IF EXISTS "Admins can view offer items"   ON public.offer_request_items;
DROP POLICY IF EXISTS "Admins can update offer items" ON public.offer_request_items;
DROP POLICY IF EXISTS "Admins can delete offer items" ON public.offer_request_items;

CREATE POLICY "Anyone can create offer items"
  ON public.offer_request_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view offer items"
  ON public.offer_request_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update offer items"
  ON public.offer_request_items FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete offer items"
  ON public.offer_request_items FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------- manual_confirmations --------------------------------------------
CREATE TABLE IF NOT EXISTS public.manual_confirmations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beleg_art      text NOT NULL CHECK (beleg_art IN ('Angebot', 'Rechnung')),
  beleg_nr       text NOT NULL,
  kunde_name     text,
  kunde_anschrift text,
  customer_email text,
  total          numeric,
  ip             text,
  user_agent     text,
  offer_request_id uuid REFERENCES public.offer_requests(id) ON DELETE SET NULL,
  rechnung_nr    text,
  rechnung_sent_at timestamptz,
  rechnung_error text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_confirmations_created_idx ON public.manual_confirmations (created_at DESC);
CREATE INDEX IF NOT EXISTS manual_confirmations_offer_request_idx
  ON public.manual_confirmations (offer_request_id)
  WHERE offer_request_id IS NOT NULL;

GRANT INSERT                 ON public.manual_confirmations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.manual_confirmations TO authenticated;
GRANT ALL                    ON public.manual_confirmations TO service_role;

ALTER TABLE public.manual_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create manual confirmations" ON public.manual_confirmations;
DROP POLICY IF EXISTS "Admins can view manual confirmations"   ON public.manual_confirmations;
DROP POLICY IF EXISTS "Admins can update manual confirmations" ON public.manual_confirmations;
DROP POLICY IF EXISTS "Admins can delete manual confirmations" ON public.manual_confirmations;

CREATE POLICY "Anyone can create manual confirmations"
  ON public.manual_confirmations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view manual confirmations"
  ON public.manual_confirmations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update manual confirmations"
  ON public.manual_confirmations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete manual confirmations"
  ON public.manual_confirmations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- ---------- Storage-Bucket 'angebote' ---------------------------------------
-- Wird nur ausgeführt, wenn das storage-Schema bereits existiert
-- (der Supabase-Storage-Container legt es beim ersten Start an).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'storage' AND table_name = 'buckets') THEN

    INSERT INTO storage.buckets (id, name, public)
    VALUES ('angebote', 'angebote', false)
    ON CONFLICT (id) DO NOTHING;

    EXECUTE 'DROP POLICY IF EXISTS "Admins manage angebote" ON storage.objects';
    EXECUTE $p$
      CREATE POLICY "Admins manage angebote"
        ON storage.objects FOR ALL
        TO authenticated
        USING (bucket_id = 'angebote' AND public.has_role(auth.uid(), 'admin'))
        WITH CHECK (bucket_id = 'angebote' AND public.has_role(auth.uid(), 'admin'))
    $p$;

  ELSE
    RAISE NOTICE 'storage-Schema noch nicht bereit – Bucket "angebote" wird später via storage-bucket.sql angelegt.';
  END IF;
END $$;


-- ---------- page_views (Traffic-Counter) ------------------------------------
CREATE TABLE IF NOT EXISTS public.page_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  path         text NOT NULL,
  ip           text,
  country      text,
  country_code text,
  referrer     text,
  user_agent   text
);
CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON public.page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_country_idx    ON public.page_views (country);
CREATE INDEX IF NOT EXISTS page_views_path_idx       ON public.page_views (path);

GRANT SELECT ON public.page_views TO authenticated;
GRANT ALL    ON public.page_views TO service_role;

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can read page_views"
    ON public.page_views FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- app_settings + bank_accounts ------------------------------------
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
  ON public.app_settings FOR ALL TO authenticated
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
CREATE INDEX IF NOT EXISTS bank_accounts_site_idx ON public.bank_accounts (site_key, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage bank_accounts" ON public.bank_accounts;
CREATE POLICY "Admins manage bank_accounts"
  ON public.bank_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (site_key, key, value)
VALUES
  ('laumann', 'active_verwalter_name', 'Erik Laumann'),
  ('laumann', 'active_verwalter_role', 'Rechtsanwalt · Insolvenzverwalter')
ON CONFLICT (site_key, key) DO NOTHING;
