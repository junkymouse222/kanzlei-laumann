-- Automatischer Angebotsversand: Standard aus (manuell)

INSERT INTO public.app_settings (site_key, key, value)
VALUES ('laumann', 'auto_send_offers', 'false')
ON CONFLICT (site_key, key) DO NOTHING;
