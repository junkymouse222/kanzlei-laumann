-- Standard-Neukundenrabatt (%) für neue Angebotsanfragen (Auto- & Formularversand)

INSERT INTO public.app_settings (site_key, key, value)
VALUES ('laumann', 'default_neukunden_rabatt', '5')
ON CONFLICT (site_key, key) DO NOTHING;
