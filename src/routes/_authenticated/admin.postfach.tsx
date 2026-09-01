import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getMailboxMessage,
  getMailboxSettings,
  getMailboxSignaturePreview,
  listMailboxMessages,
  M365_PRESET,
  replyMailboxMessage,
  saveMailboxSettings,
  startMicrosoftMailboxLogin,
  testMailboxConnection,
  type MailboxAuthMode,
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
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<MailboxAuthMode>("password");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState(SITE.brand);
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthTenant, setOauthTenant] = useState("organizations");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);

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

  function applySettings(s: MailboxSettingsPublic) {
    setSettings(s);
    setAuthMode(s.authMode);
    setImapHost(s.imapHost);
    setImapPort(s.imapPort);
    setImapSecure(s.imapSecure);
    setSmtpHost(s.smtpHost || s.imapHost);
    setSmtpPort(s.smtpPort);
    setSmtpSecure(s.smtpSecure);
    setUser(s.user);
    setFromName(s.fromName || SITE.brand);
    setOauthClientId(s.oauthClientId);
    setOauthTenant(s.oauthTenant || "organizations");
    setOauthClientSecret("");
    setPassword("");
    setShowSetup(!s.configured);
  }

  function applyM365Preset() {
    setImapHost(M365_PRESET.imapHost);
    setImapPort(M365_PRESET.imapPort);
    setImapSecure(M365_PRESET.imapSecure);
    setSmtpHost(M365_PRESET.smtpHost);
    setSmtpPort(M365_PRESET.smtpPort);
    setSmtpSecure(M365_PRESET.smtpSecure);
    setAuthMode("oauth");
    setMsg(
      "Microsoft-365-Server gesetzt. Client-ID speichern und „Mit Microsoft anmelden“ klicken.",
    );
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
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "connected") {
      setMsg("Microsoft-Konto verbunden. Postfach ist bereit.");
      setShowSetup(true);
      window.history.replaceState({}, "", "/admin/postfach");
    } else if (params.get("oauth_error")) {
      setMsg(params.get("oauth_error"));
      setShowSetup(true);
      window.history.replaceState({}, "", "/admin/postfach");
    }
    loadSettings();
    getMailboxSignaturePreview()
      .then((r) => setSigPreview(r.text))
      .catch(() => undefined);
  }, []);

  async function handleSaveSettings() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await saveMailboxSettings({
        data: {
          authMode,
          imapHost,
          imapPort,
          imapSecure,
          smtpHost: smtpHost || imapHost,
          smtpPort,
          smtpSecure,
          user,
          password: password.trim() || undefined,
          fromName,
          oauthClientId: oauthClientId.trim() || undefined,
          oauthTenant: oauthTenant.trim() || "organizations",
          oauthClientSecret: oauthClientSecret.trim() || undefined,
        },
      });
      applySettings(res.settings);
      setMsg(
        authMode === "oauth"
          ? "Gespeichert. Als Nächstes auf „Mit Microsoft anmelden“ klicken."
          : "Postfach-Zugangsdaten gespeichert.",
      );
      if (res.settings.configured) await loadList();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await testMailboxConnection();
      setMsg(res.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Verbindungstest fehlgeschlagen.");
    } finally {
      setTesting(false);
    }
  }

  async function handleMicrosoftLogin() {
    setOauthBusy(true);
    setMsg(null);
    try {
      await saveMailboxSettings({
        data: {
          authMode: "oauth",
          imapHost: imapHost || M365_PRESET.imapHost,
          imapPort: imapPort || M365_PRESET.imapPort,
          imapSecure,
          smtpHost: smtpHost || M365_PRESET.smtpHost,
          smtpPort: smtpPort || M365_PRESET.smtpPort,
          smtpSecure,
          user,
          fromName,
          oauthClientId: oauthClientId.trim(),
          oauthTenant: oauthTenant.trim() || "organizations",
          oauthClientSecret: oauthClientSecret.trim() || undefined,
        },
      });
      const started = await startMicrosoftMailboxLogin();
      // Weiterleitung zu Microsoft Organisations-Login
      window.location.href = started.authorizeUrl;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Microsoft-Login fehlgeschlagen.");
      setOauthBusy(false);
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

  const redirectUri = settings?.oauthRedirectUri || `${SITE.baseUrl}/api/public/mailbox/microsoft-oauth`;

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
            GoDaddy / Outlook: mit Microsoft anmelden (Weiterleitung zum Organisations-Login) oder
            App-Kennwort nutzen.
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl text-primary">Postfach verbinden</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Empfohlen für GoDaddy mit Outlook: Microsoft-OAuth-Button — Sie werden zu Microsoft
                weitergeleitet und melden sich mit dem Organisationskonto an.
              </p>
            </div>
            <button
              type="button"
              onClick={applyM365Preset}
              className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-primary hover:border-primary"
            >
              GoDaddy / M365 Preset
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAuthMode("oauth")}
              className={`border px-4 py-2 text-xs uppercase tracking-widest ${
                authMode === "oauth"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              Microsoft anmelden
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("password")}
              className={`border px-4 py-2 text-xs uppercase tracking-widest ${
                authMode === "password"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              App-Kennwort
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="E-Mail / Benutzer" value={user} onChange={setUser} placeholder={SITE.email} />
            <Field label="Absendername" value={fromName} onChange={setFromName} placeholder={SITE.brand} />

            {authMode === "password" ? (
              <div className="md:col-span-2">
                <Field
                  label={settings?.hasPassword ? "App-Kennwort (leer = unverändert)" : "App-Kennwort"}
                  value={password}
                  onChange={setPassword}
                  type="password"
                  placeholder="Microsoft App-Kennwort, nicht das Login-Passwort"
                />
              </div>
            ) : (
              <>
                <Field
                  label="Azure App Client-ID"
                  value={oauthClientId}
                  onChange={setOauthClientId}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
                <Field
                  label="Tenant"
                  value={oauthTenant}
                  onChange={setOauthTenant}
                  placeholder="organizations"
                />
                <div className="md:col-span-2">
                  <Field
                    label={
                      settings?.hasClientSecret
                        ? "Client Secret (leer = unverändert, optional)"
                        : "Client Secret (optional, bei Web-App in Azure)"
                    }
                    value={oauthClientSecret}
                    onChange={setOauthClientSecret}
                    type="password"
                    placeholder="nur nötig, wenn Azure ein Secret verlangt"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="block">
                    <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                      Redirect-URI (in Azure eintragen)
                    </span>
                    <input
                      readOnly
                      value={redirectUri}
                      className="mt-2 w-full border border-border bg-muted/40 px-3 py-2 font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Entra-ID → App-Registrierung → Authentifizierung → Plattform „Web“ → diese URI.
                    API-Berechtigungen (delegiert): IMAP.AccessAsUser.All, SMTP.Send, offline_access.
                    Danach speichern und den Microsoft-Button nutzen.
                    {settings?.hasOAuth ? " · Bereits verbunden." : ""}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <button
                    type="button"
                    disabled={oauthBusy || !oauthClientId.trim() || !user.trim()}
                    onClick={handleMicrosoftLogin}
                    className="inline-flex items-center gap-3 border border-[#8c8c8c] bg-white px-5 py-3 text-sm font-semibold text-[#5e5e5e] shadow-sm transition hover:bg-[#f3f3f3] disabled:opacity-50"
                  >
                    <MicrosoftLogo />
                    {oauthBusy ? "Weiterleitung …" : "Mit Microsoft anmelden"}
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Öffnet die Microsoft-Anmeldeseite (Organisationskonto / GoDaddy Outlook).
                  </p>
                </div>
              </>
            )}

            <Field label="IMAP-Host" value={imapHost} onChange={setImapHost} placeholder="outlook.office365.com" />
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">IMAP-Port</span>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <Field label="SMTP-Host" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.office365.com" />
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">SMTP-Port</span>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-col justify-end gap-2 text-sm md:col-span-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={imapSecure} onChange={(e) => setImapSecure(e.target.checked)} />
                IMAP SSL/TLS (Port 993)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
                SMTP SSL on connect (aus = STARTTLS auf 587)
              </label>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveSettings}
              className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Speichern …" : "Speichern"}
            </button>
            <button
              type="button"
              disabled={testing || !settings?.configured}
              onClick={handleTest}
              className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-primary hover:border-primary disabled:opacity-50"
            >
              {testing ? "Teste …" : "Verbindung testen"}
            </button>
          </div>

          {sigPreview && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">Signatur-Vorschau</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{sigPreview}</pre>
            </div>
          )}
        </div>
      )}

      {settings?.configured && (
        <>
          <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Posteingang · {rows.filter((r) => r.unseen).length} ungelesen · {total} gesamt
              {settings.authMode === "oauth" ? " · Microsoft OAuth" : " · App-Kennwort"}
            </span>
            <span className="text-xs">{settings.user}</span>
          </div>

          {loadingList && <p className="mt-6 text-sm text-muted-foreground">Lade Nachrichten …</p>}
          {listError && <p className="mt-6 text-sm text-red-700">{listError}</p>}

          {!loadingList && !listError && rows.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">Keine Nachrichten im Posteingang.</p>
          )}

          <ul className="mt-4 divide-y divide-border border border-border">
            {rows.map((row) => {
              const open = openUid === row.uid;
              return (
                <li key={row.uid} className={row.unseen ? "bg-parchment/50" : "bg-background"}>
                  <button
                    type="button"
                    onClick={() => openMessage(row.uid)}
                    className="flex w-full flex-wrap items-baseline justify-between gap-3 px-4 py-4 text-left hover:bg-parchment/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm ${row.unseen ? "font-semibold text-primary" : "text-primary"}`}>
                          {row.from}
                        </span>
                        {row.unseen && (
                          <span className="border border-gold px-2 py-0.5 text-[0.65rem] uppercase tracking-widest text-gold">
                            Neu
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-foreground/90">{row.subject}</p>
                      {!open && row.preview && (
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{row.preview}</p>
                      )}
                    </div>
                    <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtDate(row.date)}</time>
                  </button>

                  {open && (
                    <div className="border-t border-border bg-background px-4 py-5">
                      {loadingDetail && <p className="text-sm text-muted-foreground">Lade …</p>}
                      {detail && detail.uid === row.uid && (
                        <>
                          <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[5rem_1fr]">
                            <dt>Von</dt>
                            <dd className="text-foreground">{detail.from}</dd>
                            <dt>An</dt>
                            <dd>{detail.to}</dd>
                            <dt>Betreff</dt>
                            <dd className="text-foreground">{detail.subject}</dd>
                          </dl>
                          <div className="mt-4 max-h-[28rem] overflow-auto border border-border bg-parchment/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                            {detail.text}
                          </div>
                          {detail.attachments.length > 0 && (
                            <p className="mt-3 text-xs text-muted-foreground">
                              Anhänge: {detail.attachments.map((a) => a.filename).join(", ")}
                            </p>
                          )}

                          <div className="mt-6 border-t border-border pt-5">
                            <h3 className="text-sm font-medium text-primary">Antworten</h3>
                            <label className="mt-3 block">
                              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                                Betreff
                              </span>
                              <input
                                value={replySubject}
                                onChange={(e) => setReplySubject(e.target.value)}
                                className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="mt-3 block">
                              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                                Nachricht
                              </span>
                              <textarea
                                rows={8}
                                value={replyBody}
                                onChange={(e) => setReplyBody(e.target.value)}
                                placeholder="Ihre Antwort … (Signatur wird automatisch angehängt)"
                                className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={sending || !replyBody.trim()}
                              onClick={handleReply}
                              className="mt-3 border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
                            >
                              {sending ? "Sende …" : `Antwort an ${detail.fromEmail}`}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
        autoComplete="off"
      />
    </label>
  );
}
