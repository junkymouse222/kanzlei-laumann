## Cursor Cloud specific instructions

Product: single TanStack Start (React 19 SSR) + Vite 8 app for the "Kanzlei Laumann" law-firm/product-catalog site. Package manager is Bun (`bun.lock`). There is no separate backend service; server routes/functions run inside the same dev server. Data lives in a hosted Supabase project referenced by `.env`.

Commands (see `package.json`): dev `bun run dev` (serves on port 8080), build `bun run build`, preview `bun run preview`, lint `bun run lint`, format `bun run format`. `bun run lint` currently reports many pre-existing `prettier/prettier` errors in committed code — that is the repo's baseline, not a setup failure; run `bun run format` to auto-fix if a task requires clean lint.

Server-only secrets are read from env (not in `.env`) and are required for write/admin/email flows:
- `SUPABASE_SERVICE_ROLE_KEY`: required by `src/integrations/supabase/client.server.ts` for ALL server-side DB writes, including the public offer-request submission on `/angebot-anfordern`. Without it, submitting an offer throws "Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY". The public marketing pages and the offer builder UI (product selection + live totals) work without it.
- `RESEND_API_KEY` (+ optional `OFFER_FROM_EMAIL`, `PUBLIC_SITE_URL`, `BANK_*`): required only to actually send offer/invoice emails.
- Admin area (`/admin`) needs a Supabase Auth user with an `admin` row in `user_roles` in addition to the service role key.

Provide these via Cursor Secrets (injected as env vars) when a task needs the write/admin/email flows.
