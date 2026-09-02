-- Kontaktanfragen von /kontakt → Admin

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key    text NOT NULL DEFAULT 'laumann',
  name        text NOT NULL,
  email       text NOT NULL,
  phone       text,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'read', 'done', 'archived')),
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_inquiries_site_created_idx
  ON public.contact_inquiries (site_key, created_at DESC);

CREATE INDEX IF NOT EXISTS contact_inquiries_site_status_idx
  ON public.contact_inquiries (site_key, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_inquiries TO authenticated;
GRANT ALL ON public.contact_inquiries TO service_role;

ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage contact_inquiries" ON public.contact_inquiries;
CREATE POLICY "Admins manage contact_inquiries"
  ON public.contact_inquiries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Öffentliche Inserts nur über Service-Role (Server-Fn), keine anon-Policy.
