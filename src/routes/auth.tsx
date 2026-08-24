import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Anmeldung — ${SITE.brand}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: (search.next as string) || "/admin" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { site_key: SITE.siteKey, site_brand: SITE.brand },
        },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      if (data.session) {
        navigate({ to: next || "/admin" });
      } else {
        setInfo(`Registrierung bei ${SITE.brand} erfolgreich. Sie können sich jetzt anmelden.`);
      }
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: next || "/admin" });
  }

  return (
    <section className="container-prose grid place-items-center py-24 md:py-32">
      <form onSubmit={handleSubmit} className="w-full max-w-md border border-border bg-parchment p-10">
        <p className="eyebrow">Interner Bereich</p>
        <h1 className="mt-4 text-3xl">{mode === "signin" ? "Anmelden" : "Registrieren"}</h1>
        <span className="rule-gold mt-4" />

        <label className="mt-8 block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">E-Mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full border border-border bg-white px-3 py-2"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Passwort</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full border border-border bg-white px-3 py-2"
          />
        </label>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        {info && <p className="mt-4 text-sm text-green-800">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full bg-primary px-6 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? "…" : mode === "signin" ? "Anmelden" : "Registrieren"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 w-full text-xs uppercase tracking-widest text-muted-foreground underline"
        >
          {mode === "signin" ? "Noch kein Konto? Registrieren" : "Bereits registriert? Anmelden"}
        </button>
      </form>
    </section>
  );
}
