-- Admin-Benachrichtigungen bei Kundenaktionen (Link geöffnet, angenommen, bezahlt, …)

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key text NOT NULL,
  offer_request_id uuid REFERENCES public.offer_requests(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_notifications_site_unread_idx
  ON public.admin_notifications (site_key, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_notifications_site_created_idx
  ON public.admin_notifications (site_key, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin_notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update admin_notifications"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete admin_notifications"
  ON public.admin_notifications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Schreibzugriff nur über service_role (Server-Hooks)
GRANT SELECT, UPDATE, DELETE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
