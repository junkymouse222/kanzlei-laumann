import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getMailboxMessage,
  getMailboxSettings,
  getMailboxSignaturePreview,
  listMailboxMessages,
  replyMailboxMessage,
  saveMailboxSettings,
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

function PostfachPage() {
  const [settings, setSettings] = useState<MailboxSettingsPublic | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState(SITE.brand);

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
    setImapHost(s.imapHost);
    setImapPort(s.imapPort);
    setImapSecure(s.imapSecure);
    setSmtpHost(s.smtpHost || s.imapHost);
    setSmtpPort(s.smtpPort);
    setSmtpSecure(s.smtpSecure);
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
          imapHost,
          imapPort,
          imapSecure,
          smtpHost: smtpHost || imapHost,
          smtpPort,
          smtpSecure,
          user,
          password: password.trim() || undefined,
          fromName,
        },
      });
      applySettings(res.settings);
      setMsg("Postfach-Zugangsdaten gespeichert.");
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
            IMAP-Postfach lesen und direkt antworten. Signatur nutzt den aktiven Verwalter aus den Einstellungen.
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
          <p className="mt-2 text-sm text-muted-foreground">
            IMAP zum Lesen, SMTP zum Antworten (meist derselbe Host). Passwort wird nur serverseitig in den
            Admin-Einstellungen gespeichert.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="E-Mail / Benutzer" value={user} onChange={setUser} placeholder={SITE.email} />
            <Field
              label={settings?.hasPassword ? "Passwort (leer = unverändert)" : "Passwort"}
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="••••••••"
            />
            <Field label="IMAP-Host" value={imapHost} onChange={setImapHost} placeholder="imap.example.com" />
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">IMAP-Port</span>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <Field
              label="SMTP-Host"
              value={smtpHost}
              onChange={setSmtpHost}
              placeholder="smtp.example.com"
            />
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">SMTP-Port</span>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 465)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <Field label="Absendername" value={fromName} onChange={setFromName} placeholder={SITE.brand} />
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={imapSecure} onChange={(e) => setImapSecure(e.target.checked)} />
                IMAP SSL/TLS
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
                SMTP SSL/TLS
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
