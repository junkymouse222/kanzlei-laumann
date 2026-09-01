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

/** Microsoft Security – dort mit GoDaddy-/Org-Konto einloggen und App-Kennwort erzeugen. */
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
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [user, setUser] = useState("");
  const [fromName, setFromName] = useState(SITE.brand);
  const [appPassword, setAppPassword] = useState("");
  const [step, setStep] = useState<"idle" | "awaiting_password">("idle");

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
    setUser(s.user);
    setFromName(s.fromName || SITE.brand);
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
  }, []);

  /** Öffnet Microsoft-Login (GoDaddy/Org) zum Erzeugen eines App-Kennworts. */
  function handleOpenMicrosoftLogin() {
    if (!user.trim()) {
      setMsg("Bitte zuerst die Postfach-E-Mail eintragen.");
      return;
    }
    setStep("awaiting_password");
    setMsg(
      "Microsoft-Login geöffnet. Mit dem GoDaddy-Organisationskonto anmelden → Sicherheitsinfo → App-Kennwörter → neues Kennwort erzeugen und hier einfügen.",
    );
    window.open(MS_SECURITY_URL, "_blank", "noopener,noreferrer");
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
      setStep("idle");
      setMsg("Verbunden. Postfach wird geladen …");
      const test = await testMailboxConnection();
      setMsg(test.message);
      if (res.settings.configured) await loadList();
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "Verbindung fehlgeschlagen. App-Kennwort und SMTP AUTH in GoDaddy/M365 prüfen.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleOAuthRedirect() {
    if (!user.trim()) {
      setMsg("Bitte E-Mail eintragen.");
      return;
    }
    setMsg(null);
    try {
      await saveMailboxSettings({
        data: {
          authMode: "oauth",
          user: user.trim(),
          fromName,
          imapHost: M365_PRESET.imapHost,
          imapPort: M365_PRESET.imapPort,
          imapSecure: M365_PRESET.imapSecure,
          smtpHost: M365_PRESET.smtpHost,
          smtpPort: M365_PRESET.smtpPort,
          smtpSecure: M365_PRESET.smtpSecure,
        },
      });
      const started = await startMicrosoftMailboxLogin();
      if (started.status === "redirect") {
        window.location.href = started.authorizeUrl;
        return;
      }
      setMsg(
        "Bei GoDaddy ist der direkte OAuth-Login oft blockiert (Fehler 530035). Bitte App-Kennwort nutzen — Button oben öffnet den Microsoft-Login.",
      );
      setStep("awaiting_password");
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "OAuth nicht verfügbar. Bitte App-Kennwort über Microsoft-Login nutzen.",
      );
      setStep("awaiting_password");
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
            GoDaddy Microsoft 365: über Microsoft einloggen, App-Kennwort erzeugen, fertig.
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
            GoDaddy blockiert den direkten Office-OAuth oft (Fehler 530035). Der Weg, der funktioniert:
            Microsoft-Login öffnen → mit Organisationskonto anmelden → App-Kennwort erzeugen → hier
            einfügen.
          </p>

          <div className="mt-6 grid max-w-xl gap-4">
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                E-Mail-Adresse (GoDaddy / Outlook)
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

          <ol className="mt-6 max-w-xl list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Auf den Microsoft-Button klicken und mit dem{" "}
              <strong className="text-foreground">GoDaddy-Organisationskonto</strong> von{" "}
              {SITE.domain} anmelden.
            </li>
            <li>
              Unter Sicherheitsinfo → <strong className="text-foreground">App-Kennwörter</strong> ein
              neues Kennwort erzeugen (Name z. B. „Kanzlei Postfach“).
            </li>
            <li>Das Kennwort hier einfügen und speichern.</li>
          </ol>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!user.trim()}
              onClick={handleOpenMicrosoftLogin}
              className="inline-flex items-center gap-3 border border-[#8c8c8c] bg-white px-5 py-3 text-sm font-semibold text-[#5e5e5e] shadow-sm transition hover:bg-[#f3f3f3] disabled:opacity-50"
            >
              <MicrosoftLogo />
              Mit Microsoft anmelden (App-Kennwort)
            </button>
          </div>

          {(step === "awaiting_password" || settings?.hasPassword) && (
            <div className="mt-6 max-w-xl space-y-3 border-t border-border pt-5">
              <label className="block">
                <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                  {settings?.hasPassword
                    ? "Neues App-Kennwort (leer = unverändert)"
                    : "App-Kennwort von Microsoft"}
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
                onClick={handleSaveAppPassword}
                className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Verbindet …" : "Speichern & verbinden"}
              </button>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              disabled={testing || !settings?.configured}
              onClick={() => {
                void (async () => {
                  setTesting(true);
                  try {
                    const res = await testMailboxConnection();
                    setMsg(res.message);
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
                    setStep("idle");
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
            {settings?.microsoftReady ? (
              <button
                type="button"
                onClick={() => void handleOAuthRedirect()}
                className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary"
              >
                OAuth-Redirect (falls freigeschaltet)
              </button>
            ) : null}
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
