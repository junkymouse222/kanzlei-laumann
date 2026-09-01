import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  getMailboxMessage,
  getMailboxSettings,
  getMailboxSignaturePreview,
  listMailboxMessages,
  M365_PRESET,
  pollMicrosoftMailboxSetup,
  replyMailboxMessage,
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

  const [user, setUser] = useState("");
  const [fromName, setFromName] = useState(SITE.brand);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [setup, setSetup] = useState<{
    userCode: string;
    verificationUri: string;
    message: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [password, setPassword] = useState("");

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

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function applySettings(s: MailboxSettingsPublic) {
    setSettings(s);
    setUser(s.user);
    setFromName(s.fromName || SITE.brand);
    setPassword("");
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
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "connected") {
      setMsg("Microsoft-Konto verbunden — Postfach ist bereit.");
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
    return () => stopPoll();
  }, []);

  async function persistEmail(authMode: "oauth" | "password" = "oauth") {
    const res = await saveMailboxSettings({
      data: {
        authMode,
        user,
        fromName,
        imapHost: M365_PRESET.imapHost,
        imapPort: M365_PRESET.imapPort,
        imapSecure: M365_PRESET.imapSecure,
        smtpHost: M365_PRESET.smtpHost,
        smtpPort: M365_PRESET.smtpPort,
        smtpSecure: M365_PRESET.smtpSecure,
        password: password.trim() || undefined,
      },
    });
    applySettings(res.settings);
    return res.settings;
  }

  async function handleMicrosoftLogin() {
    if (!user.trim()) {
      setMsg("Bitte E-Mail-Adresse eintragen.");
      return;
    }
    setOauthBusy(true);
    setMsg(null);
    setSetup(null);
    stopPoll();
    try {
      await persistEmail("oauth");
      const started = await startMicrosoftMailboxLogin();
      if (started.status === "redirect") {
        window.location.href = started.authorizeUrl;
        return;
      }

      // Einmalige Einrichtung (wie Mailbird hinter den Kulissen)
      setSetup({
        userCode: started.userCode,
        verificationUri: started.verificationUri,
        message: started.message,
      });
      setMsg("Einmalige Microsoft-Einrichtung — danach nur noch normal einloggen.");
      const intervalMs = Math.max(3, started.interval || 5) * 1000;
      pollRef.current = setInterval(() => {
        void (async () => {
          try {
            const result = await pollMicrosoftMailboxSetup();
            if (result.status === "pending") return;
            stopPoll();
            setSetup(null);
            window.location.href = result.authorizeUrl;
          } catch (e) {
            stopPoll();
            setSetup(null);
            setOauthBusy(false);
            setMsg(e instanceof Error ? e.message : "Einrichtung fehlgeschlagen.");
          }
        })();
      }, intervalMs);
    } catch (e) {
      setOauthBusy(false);
      setMsg(e instanceof Error ? e.message : "Microsoft-Login fehlgeschlagen.");
    }
  }

  async function handleSavePassword() {
    setSaving(true);
    setMsg(null);
    try {
      const s = await persistEmail("password");
      setMsg("App-Kennwort gespeichert.");
      if (s.configured) await loadList();
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
            Wie bei Mailbird / Outlook: Microsoft anklicken, einloggen — fertig.
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
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            E-Mail eintragen und mit Microsoft anmelden. Keine Client-IDs, keine Server-Einstellungen.
          </p>

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
          </div>

          <div className="mt-6">
            <button
              type="button"
              disabled={oauthBusy || !user.trim()}
              onClick={handleMicrosoftLogin}
              className="inline-flex items-center gap-3 border border-[#8c8c8c] bg-white px-5 py-3 text-sm font-semibold text-[#5e5e5e] shadow-sm transition hover:bg-[#f3f3f3] disabled:opacity-50"
            >
              <MicrosoftLogo />
              {oauthBusy ? "Weiterleitung …" : "Mit Microsoft anmelden"}
            </button>
          </div>

          {setup && (
            <div className="mt-6 max-w-xl border border-border bg-parchment/40 p-4 text-sm">
              <p className="text-foreground">{setup.message}</p>
              <p className="mt-3">
                Code:{" "}
                <span className="font-mono text-lg tracking-widest text-primary">{setup.userCode}</span>
              </p>
              <p className="mt-2">
                <a
                  href={setup.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-primary"
                >
                  {setup.verificationUri}
                </a>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Einmalig als Microsoft-Admin bestätigen. Danach wirst du automatisch zum normalen
                Postfach-Login weitergeleitet.
              </p>
              <button
                type="button"
                className="mt-3 border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground"
                onClick={() => {
                  stopPoll();
                  setSetup(null);
                  setOauthBusy(false);
                }}
              >
                Abbrechen
              </button>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={testing || !settings?.configured}
              onClick={handleTest}
              className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-primary hover:border-primary disabled:opacity-50"
            >
              {testing ? "Teste …" : "Verbindung testen"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary"
            >
              {showAdvanced ? "Erweitert ausblenden" : "Erweitert: App-Kennwort"}
            </button>
          </div>

          {showAdvanced && (
            <div className="mt-4 max-w-xl space-y-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Nur falls Microsoft-Login nicht möglich: App-Kennwort statt OAuth.
              </p>
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                  {settings?.hasPassword ? "App-Kennwort (leer = unverändert)" : "App-Kennwort"}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                  autoComplete="new-password"
                />
              </label>
              <button
                type="button"
                disabled={saving || !user.trim() || !password.trim()}
                onClick={handleSavePassword}
                className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Speichern …" : "App-Kennwort speichern"}
              </button>
            </div>
          )}

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
              {settings.authMode === "oauth" ? " · Microsoft" : " · App-Kennwort"}
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
