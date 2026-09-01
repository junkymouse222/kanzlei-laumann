import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site";
import { completeMicrosoftMailboxOAuth } from "@/lib/mailbox.functions";

/**
 * Microsoft OAuth redirect callback (Authorization Code + PKCE).
 * Azure Redirect-URI: {SITE.baseUrl}/api/public/mailbox/microsoft-oauth
 */
export const Route = createFileRoute("/api/public/mailbox/microsoft-oauth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") || "";
        const state = url.searchParams.get("state") || "";
        const oauthError = url.searchParams.get("error");
        const oauthDesc = url.searchParams.get("error_description") || "";

        const back = `${SITE.baseUrl}/admin/postfach`;

        if (oauthError) {
          const msg = encodeURIComponent(oauthDesc || oauthError);
          return Response.redirect(`${back}?oauth_error=${msg}`, 302);
        }

        if (!code || !state) {
          return Response.redirect(
            `${back}?oauth_error=${encodeURIComponent("Microsoft hat keinen Code zurückgegeben.")}`,
            302,
          );
        }

        try {
          await completeMicrosoftMailboxOAuth({ code, state });
          return Response.redirect(`${back}?oauth=connected`, 302);
        } catch (e) {
          const msg = encodeURIComponent(
            e instanceof Error ? e.message : "Microsoft-Anmeldung fehlgeschlagen.",
          );
          return Response.redirect(`${back}?oauth_error=${msg}`, 302);
        }
      },
    },
  },
});
