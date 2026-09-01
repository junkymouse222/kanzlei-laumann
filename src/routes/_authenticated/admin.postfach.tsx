import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getMailboxMessage,
  getMailboxSettings,
  getMailboxSignaturePreview,
  listMailboxMessages,
  M365_PRESET,
  replyMailboxMessage,
  resetMicrosoftMailboxConnection,
  saveMailboxSettings,
  startMicrosoftMailboxLogin,
  testMailboxConnection,
  type MailboxListItem,
  type MailboxMessageDetail,
  type MailboxSettingsPublic,
} from "@/lib/mailbox.functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/admin/postfach")({
  head: () => ({
    meta: [
      { title: "Admin — Postfach" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PostfachPage,
});

const ENTRA_APP_REG =
  "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";
const ENTRA_SECURITY_DEFAULTS =
  "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/TenantOverview.ReactView";
const PER_USER_MFA_URL =
  "https://account.activedirectory.windowsazure.com/UserManagement/MultifactorVerification.aspx";
const MS_SECURITY_URL = "https://mysignins.microsoft.com/security-info";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
    : "—";

function MicrosoftLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function PostfachPage() {
  const [settings, setSettings] = useState<MailboxSettingsPublic | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msLogin, setMsLogin] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAppPwHelp, setShowAppPwHelp] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const [user, setUser] = useState("");
  const [fromName, setFromName] = useState(SITE.brand);
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [appPassword, setAppPassword] = useState("");

  const [rows, setRows] = useState<MailboxListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [openUid, setOpenUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<MailboxMessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sending, setSending] = useState(false);
  const [sigPreview, setSigPreview] = useState<string>("");

  const redirectUri =
    settings?.oauthRedirectUri || `https://${SITE.domain}/api/public/mailbox/microsoft-oauth`;

  function applySettings(s: MailboxSettingsPublic) {
    setSettings(s);
    setUser(s.user);
    setFromName(s.fromName || SITE.brand);
    setOauthClientId(s.oauthClientId || "");
    setOauthClientSecret("");
    setAppPassword("");
    setShowSetup(!s.configured);
  }

  async function loadSettings() {
    setLoadingSettings(true);
    try {
      const s = await getMailboxSettings();
      applySettings(s);
      if (s.configured) await loadList();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Einstellungen laden fehlgeschlagen.");
    } finally {
      setLoadingSettings(false);
    }
  }

  async function loadList() {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await listMailboxMessages({ data: { limit: 50 } });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Postfach konnte nicht geladen werden.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadSettings();
    getMailboxSignaturePreview()
      .then((r) => setSigPreview(r.text))
      .catch(() => undefined);

    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "connected") {
      setMsg("Microsoft verbunden — Postfach ist bereit.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const oauthErr = params.get("oauth_error");
    if (oauthErr) {
      setMsg(decodeURIComponent(oauthErr));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function persistOAuthBasics() {
    if (!user.trim()) throw new Error("Bitte zuerst die Postfach-E-Mail eintragen.");
    if (!oauthClientId.trim()) {
      throw new Error("Bitte die Application (client) ID aus Entra eintragen.");
    }
    const res = await saveMailboxSettings({
      data: {
        authMode: "oauth",
        user: user.trim(),
        fromName,
        oauthClientId: oauthClientId.trim(),
        oauthClientSecret: oauthClientSecret.trim() || undefined,
        imapHost: M365_PRESET.imapHost,
        imapPort: M365_PRESET.imapPort,
        imapSecure: M365_PRESET.imapSecure,
        smtpHost: M365_PRESET.smtpHost,
        smtpPort: M365_PRESET.smtpPort,
        smtpSecure: M365_PRESET.smtpSecure,
      },
    });
    applySettings(res.settings);
    return res.settings;
  }

  async function handleSaveClientId() {
    setSaving(true);
    setMsg(null);
    try {
      await persistOAuthBasics();
      setMsg("Client-ID gespeichert. Als Nächstes „Mit Microsoft anmelden“.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMicrosoftLogin() {
    setMsLogin(true);
    setMsg(null);
    try {
      await persistOAuthBasics();
      const res = await startMicrosoftMailboxLogin();
      if (res.status === "redirect" && res.authorizeUrl) {
        window.location.href = res.authorizeUrl;
        return;
      }
      setMsg("Unerwartete Antwort von Microsoft-Login.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Microsoft-Anmeldung fehlgeschlagen.");
    } finally {
      setMsLogin(false);
    }
  }

  async function handleSaveAppPassword() {
    if (!user.trim() || !appPassword.trim()) {
      setMsg("E-Mail und App-Kennwort ausfüllen.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await saveMailboxSettings({
        data: {
          authMode: "password",
          user: user.trim(),
          fromName,
          password: appPassword.trim(),
          imapHost: M365_PRESET.imapHost,
          imapPort: M365_PRESET.imapPort,
          imapSecure: M365_PRESET.imapSecure,
          smtpHost: M365_PRESET.smtpHost,
          smtpPort: M365_PRESET.smtpPort,
          smtpSecure: M365_PRESET.smtpSecure,
        },
      });
      applySettings(res.settings);
      setAppPassword("");
      const test = await testMailboxConnection();
      setMsg(test.message);
      if (res.settings.configured) await loadList();
    } catch (e) {
      setMsg(
        e instanceof Error
          ? `${e.message} — Falls Authentifizierung fehlschlägt: in GoDaddy/Exchange „SMTP AUTH“ für das Postfach aktivieren.`
          : "Verbindung fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function openMessage(uid: number) {
    if (openUid === uid) {
      setOpenUid(null);
      setDetail(null);
      return;
    }
    setOpenUid(uid);
    setLoadingDetail(true);
    setDetail(null);
    setReplyBody("");
    try {
      const d = await getMailboxMessage({ data: { uid } });
      setDetail(d);
      setReplySubject(d.subject.toLowerCase().startsWith("re:") ? d.subject : `Re: ${d.subject}`);
      setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, unseen: false } : r)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Nachricht konnte nicht geladen werden.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleReply() {
    if (!openUid || !replyBody.trim()) return;
    setSending(true);
    setMsg(null);
    try {
      const res = await replyMailboxMessage({
        data: { uid: openUid, body: replyBody, subject: replySubject },
      });
      setMsg(`Antwort gesendet an ${res.to}.`);
      setReplyBody("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Senden fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  async function copyRedirectUri() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setMsg("Redirect-URI kopiert.");
    } catch {
      setMsg(redirectUri);
    }
  }

  const authLabel =
    settings?.authMode === "oauth" && settings.hasOAuth
      ? "Microsoft OAuth"
      : settings?.hasPassword
        ? "App-Kennwort"
        : "—";

  return (
    <section className="container-prose py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/admin" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
            ← Anfragen
          </Link>
          <h1 className="mt-2 text-4xl">Postfach</h1>
          <span className="rule-gold mt-4" />
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">
            Microsoft 365 — App in Entra registrieren, dann einmal anmelden.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {settings?.configured && (
            <button
              type="button"
              onClick={loadList}
              disabled={loadingList}
              className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {loadingList ? "Lade …" : "Aktualisieren"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="border border-primary px-4 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
          >
            {showSetup ? "Zugang ausblenden" : "Zugang / Setup"}
          </button>
        </div>
      </div>

      {msg && (
        <p className="mt-6 border border-border bg-parchment px-4 py-3 text-sm text-foreground/90">{msg}</p>
      )}

      {(showSetup || loadingSettings || (settings && !settings.configured)) && (
        <div className="mt-8 border border-border p-6">
          <h2 className="font-serif text-2xl text-primary">Postfach verbinden</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            In Entra eine App-Registrierung anlegen, die Redirect-URI eintragen, Client-ID hier
            speichern — dann wie Mailbird mit Microsoft anmelden.
          </p>

          <div className="mt-6 max-w-2xl space-y-3 border border-border bg-parchment/40 p-5 text-sm leading-relaxed text-foreground/90">
            <p className="font-medium text-primary">Entra: App registrieren</p>
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>
                Öffne{" "}
                <a
                  href={ENTRA_APP_REG}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-primary"
                >
                  Entra → App-Registrierungen
                </a>{" "}
                → <strong className="text-foreground">Neue Registrierung</strong>.
              </li>
              <li>
                Name z. B. „{SITE.brand} Postfach“. Konten:{" "}
                <strong className="text-foreground">Nur diese Organisation</strong>.
              </li>
              <li>
                Plattform <strong className="text-foreground">Web</strong>, Redirect-URI genau:
                <code className="mt-2 block break-all border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
                  {redirectUri}
                </code>
                <button
                  type="button"
                  onClick={() => void copyRedirectUri()}
                  className="mt-2 text-xs uppercase tracking-widest text-primary hover:underline"
                >
                  URI kopieren
                </button>
              </li>
              <li>
                Nach dem Anlegen:{" "}
                <strong className="text-foreground">Application (client) ID</strong> kopieren
                (Übersicht).
              </li>
              <li>
                API-Berechtigungen → Hinzufügen →{" "}
                <strong className="text-foreground">Office 365 Exchange Online</strong> →
                Delegiert: <code className="text-xs">IMAP.AccessAsUser.All</code>,{" "}
                <code className="text-xs">SMTP.Send</code> → Admin-Zustimmung erteilen.
              </li>
              <li>
                Authentifizierung →{" "}
                <strong className="text-foreground">Öffentliche Clientflows zulassen: Ja</strong>{" "}
                (für PKCE). Optional: unter Zertifikate & Geheimnisse ein Client Secret erzeugen.
              </li>
            </ol>
          </div>

          <div className="mt-6 grid max-w-xl gap-4">
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                E-Mail-Adresse
              </span>
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder={SITE.email}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                Anzeigename
              </span>
              <input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder={SITE.brand}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                Application (client) ID
              </span>
              <input
                value={oauthClientId}
                onChange={(e) => setOauthClientId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="mt-2 w-full border border-border bg-background px-3 py-2 font-mono text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                Client Secret (optional)
              </span>
              <input
                type="password"
                value={oauthClientSecret}
                onChange={(e) => setOauthClientSecret(e.target.value)}
                placeholder={settings?.microsoftReady ? "leer = unverändert" : "nur wenn erstellt"}
                className="mt-2 w-full border border-border bg-background px-3 py-2 font-mono text-sm"
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving || !user.trim() || !oauthClientId.trim()}
              onClick={() => void handleSaveClientId()}
              className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-primary hover:border-primary disabled:opacity-50"
            >
              {saving ? "Speichert …" : "Client-ID speichern"}
            </button>
            <button
              type="button"
              disabled={msLogin || !user.trim() || !oauthClientId.trim()}
              onClick={() => void handleMicrosoftLogin()}
              className="inline-flex items-center gap-3 border border-[#8c8c8c] bg-white px-5 py-3 text-sm font-semibold text-[#5e5e5e] shadow-sm transition hover:bg-[#f3f3f3] disabled:opacity-50"
            >
              <MicrosoftLogo />
              {msLogin ? "Weiterleitung …" : "Mit Microsoft anmelden"}
            </button>
          </div>

          <div className="mt-8 border-t border-border pt-5">
            <button
              type="button"
              onClick={() => setShowFallback((v) => !v)}
              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              {showFallback ? "▼" : "▶"} Alternative: App-Kennwort
            </button>
            {showFallback && (
              <div className="mt-4 max-w-xl space-y-4">
                <p className="text-sm text-muted-foreground">
                  Nur nötig, wenn OAuth nicht klappt. Bei Security Defaults oft erst freischalten.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAppPwHelp((v) => !v)}
                  className="text-xs uppercase tracking-widest text-primary hover:underline"
                >
                  {showAppPwHelp ? "Hilfe ausblenden" : "Kein App-Kennwort sichtbar?"}
                </button>
                {showAppPwHelp && (
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                    <li>
                      <a
                        href={ENTRA_SECURITY_DEFAULTS}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-primary"
                      >
                        Security Defaults
                      </a>{" "}
                      deaktivieren.
                    </li>
                    <li>
                      <a
                        href={PER_USER_MFA_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-primary"
                      >
                        MFA pro Benutzer
                      </a>{" "}
                      für das Postfach aktivieren.
                    </li>
                    <li>
                      Unter{" "}
                      <a
                        href={MS_SECURITY_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-primary"
                      >
                        Sicherheitsinfo
                      </a>{" "}
                      App-Kennwort erzeugen.
                    </li>
                  </ol>
                )}
                <label className="block">
                  <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                    App-Kennwort
                  </span>
                  <input
                    type="password"
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    className="mt-2 w-full border border-border bg-background px-3 py-2 font-mono text-sm"
                    autoComplete="new-password"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving || !user.trim() || !appPassword.trim()}
                  onClick={() => void handleSaveAppPassword()}
                  className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "Verbindet …" : "Speichern & verbinden"}
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={testing || !settings?.configured}
              onClick={() => {
                void (async () => {
                  setTesting(true);
                  try {
                    setMsg((await testMailboxConnection()).message);
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Test fehlgeschlagen.");
                  } finally {
                    setTesting(false);
                  }
                })();
              }}
              className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-primary hover:border-primary disabled:opacity-50"
            >
              {testing ? "Teste …" : "Verbindung testen"}
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    const res = await resetMicrosoftMailboxConnection();
                    applySettings(res.settings);
                    setOauthClientId("");
                    setMsg("Verbindung zurückgesetzt.");
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Reset fehlgeschlagen.");
                  }
                })();
              }}
              className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary"
            >
              Neu verbinden
            </button>
          </div>

          {sigPreview && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                Signatur-Vorschau
              </p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{sigPreview}</pre>
            </div>
          )}
        </div>
      )}

      {settings?.configured && (
        <>
          <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Posteingang · {rows.filter((r) => r.unseen).length} ungelesen · {total} gesamt ·{" "}
              {authLabel}
            </span>
            <span className="text-xs">{settings.user}</span>
          </div>

          {loadingList && <p className="mt-6 text-sm text-muted-foreground">Lade Nachrichten …</p>}
          {listError && <p className="mt-6 text-sm text-red-700">{listError}</p>}

          {!loadingList && !listError && rows.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">Keine Nachrichten im Posteingang.</p>
          )}

          <ul className="mt-4 divide-y divide-border border border-border">
            {rows.map((r) => (
              <li key={r.uid}>
                <button
                  type="button"
                  onClick={() => void openMessage(r.uid)}
                  className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-parchment/60 ${
                    r.unseen ? "bg-parchment/30" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className={`text-sm ${r.unseen ? "font-semibold text-foreground" : ""}`}>
                      {r.subject || "(kein Betreff)"}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtDate(r.date)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {r.from || r.fromEmail}
                    {r.preview ? ` — ${r.preview}` : ""}
                  </span>
                </button>

                {openUid === r.uid && (
                  <div className="border-t border-border bg-background px-4 py-4">
                    {loadingDetail && (
                      <p className="text-sm text-muted-foreground">Lade Nachricht …</p>
                    )}
                    {detail && (
                      <>
                        <div className="text-xs text-muted-foreground">
                          Von {detail.from || detail.fromEmail} · An {detail.to} ·{" "}
                          {fmtDate(detail.date)}
                        </div>
                        {detail.html ? (
                          <div
                            className="prose prose-sm mt-4 max-w-none"
                            dangerouslySetInnerHTML={{ __html: detail.html }}
                          />
                        ) : (
                          <pre className="mt-4 whitespace-pre-wrap text-sm">{detail.text}</pre>
                        )}
                        <div className="mt-6 space-y-3 border-t border-border pt-4">
                          <label className="block">
                            <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                              Betreff
                            </span>
                            <input
                              value={replySubject}
                              onChange={(e) => setReplySubject(e.target.value)}
                              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                              Antwort
                            </span>
                            <textarea
                              value={replyBody}
                              onChange={(e) => setReplyBody(e.target.value)}
                              rows={6}
                              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={sending || !replyBody.trim()}
                            onClick={() => void handleReply()}
                            className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
                          >
                            {sending ? "Sendet …" : "Antwort senden"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
