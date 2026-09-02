import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  clearMailboxConnection,
  getMailboxMessage,
  getMailboxSettings,
  getMailboxSignaturePreview,
  listMailboxMessages,
  M365_PRESET,
  replyMailboxMessage,
  saveMailboxSettings,
  sendMailboxEmail,
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

type PendingAttachment = { filename: string; content: string; contentType?: string };

async function readFilesAsAttachments(files: FileList | null): Promise<PendingAttachment[]> {
  if (!files?.length) return [];
  const out: PendingAttachment[] = [];
  for (const file of Array.from(files)) {
    if (file.size > 12 * 1024 * 1024) {
      throw new Error(`${file.name} ist größer als 12 MB.`);
    }
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        resolve(dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl);
      };
      reader.onerror = () => reject(new Error(`${file.name} konnte nicht gelesen werden.`));
      reader.readAsDataURL(file);
    });
    out.push({
      filename: file.name,
      content,
      contentType: file.type || undefined,
    });
  }
  return out;
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
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);

  const [rows, setRows] = useState<MailboxListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [openUid, setOpenUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<MailboxMessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyFiles, setReplyFiles] = useState<FileList | null>(null);
  const [sending, setSending] = useState(false);
  const [sigPreview, setSigPreview] = useState<string>("");

  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<FileList | null>(null);

  function bodyWithSignature(sig: string) {
    const s = (sig || "").trim();
    return s ? `\n\n${s}` : "";
  }

  function messageAboveSignature(body: string, sig: string) {
    const b = body.replace(/\r\n/g, "\n").trimEnd();
    const s = (sig || "").replace(/\r\n/g, "\n").trim();
    if (s && b.endsWith(s)) return b.slice(0, -s.length).trim();
    const idx = b.lastIndexOf("\nViele Grüße\n");
    if (idx >= 0) return b.slice(0, idx).trim();
    if (b.startsWith("Viele Grüße\n")) return "";
    return b.trim();
  }

  function applySettings(s: MailboxSettingsPublic) {
    setSettings(s);
    setUser(s.user);
    setFromName(s.fromName || SITE.brand);
    setPassword("");
    setImapHost(s.imapHost || "");
    setImapPort(s.imapPort || 993);
    setImapSecure(s.imapSecure);
    setSmtpHost(s.smtpHost || "");
    setSmtpPort(s.smtpPort || 587);
    setSmtpSecure(s.smtpSecure);
    setShowSetup(!s.configured);
  }

  function applyM365Preset() {
    setImapHost(M365_PRESET.imapHost);
    setImapPort(M365_PRESET.imapPort);
    setImapSecure(M365_PRESET.imapSecure);
    setSmtpHost(M365_PRESET.smtpHost);
    setSmtpPort(M365_PRESET.smtpPort);
    setSmtpSecure(M365_PRESET.smtpSecure);
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
      .then((r) => {
        setSigPreview(r.text);
        setComposeBody((prev) => (prev.trim() ? prev : bodyWithSignature(r.text)));
      })
      .catch(() => undefined);
  }, []);

  async function handleSave() {
    if (!user.trim() || !imapHost.trim() || !smtpHost.trim()) {
      setMsg("E-Mail, IMAP-Host und SMTP-Host ausfüllen.");
      return;
    }
    if (!password.trim() && !settings?.hasPassword) {
      setMsg("Passwort eintragen.");
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
          password: password.trim() || undefined,
          imapHost: imapHost.trim(),
          imapPort,
          imapSecure,
          smtpHost: smtpHost.trim(),
          smtpPort,
          smtpSecure,
        },
      });
      applySettings(res.settings);
      setPassword("");
      const test = await testMailboxConnection();
      setMsg(test.message);
      if (res.settings.configured) await loadList();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.");
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
    setReplyBody(bodyWithSignature(sigPreview));
    setReplyFiles(null);
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
    if (!openUid || !messageAboveSignature(replyBody, sigPreview)) {
      setMsg("Bitte Antworttext oberhalb der Signatur eingeben.");
      return;
    }
    setSending(true);
    setMsg(null);
    try {
      const attachments = await readFilesAsAttachments(replyFiles);
      const res = await replyMailboxMessage({
        data: {
          uid: openUid,
          body: replyBody,
          subject: replySubject,
          attachments: attachments.length ? attachments : undefined,
        },
      });
      setMsg(
        `Antwort gesendet an ${res.to}${attachments.length ? ` · ${attachments.length} Anhang` : ""} (Resend).`,
      );
      setReplyBody(bodyWithSignature(sigPreview));
      setReplyFiles(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Senden fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  async function handleCompose() {
    if (!composeTo.trim() || !composeSubject.trim()) {
      setMsg("Empfänger und Betreff ausfüllen.");
      return;
    }
    if (!messageAboveSignature(composeBody, sigPreview)) {
      setMsg("Bitte Nachrichtentext oberhalb der Signatur eingeben.");
      return;
    }
    setSending(true);
    setMsg(null);
    try {
      const attachments = await readFilesAsAttachments(composeFiles);
      const res = await sendMailboxEmail({
        data: {
          to: composeTo.trim(),
          subject: composeSubject.trim(),
          body: composeBody,
          attachments: attachments.length ? attachments : undefined,
        },
      });
      setMsg(
        `E-Mail gesendet an ${res.to}${attachments.length ? ` · ${attachments.length} Anhang` : ""} (Resend).`,
      );
      setComposeTo("");
      setComposeSubject("");
      setComposeBody(bodyWithSignature(sigPreview));
      setComposeFiles(null);
      setShowCompose(false);
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
            Empfang per IMAP · Versand über Resend (inkl. Anhänge).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {settings?.configured && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowCompose((v) => {
                    const next = !v;
                    if (next) setComposeBody((prev) => (prev.trim() ? prev : bodyWithSignature(sigPreview)));
                    return next;
                  });
                }}
                className="border border-primary px-4 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
              >
                {showCompose ? "Schreiben schließen" : "Neue E-Mail"}
              </button>
              <button
                type="button"
                onClick={loadList}
                disabled={loadingList}
                className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {loadingList ? "Lade …" : "Aktualisieren"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
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
          <h2 className="font-serif text-2xl text-primary">Postfach hinzufügen</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Zugangsdaten wie in jedem Mailprogramm. Bei Microsoft 365 oft ein App-Kennwort statt
            dem normalen Login-Passwort.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyM365Preset}
              className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
            >
              Microsoft 365 vorausfüllen
            </button>
          </div>

          <div className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                E-Mail / Benutzername
              </span>
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder={SITE.email}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                Anzeigename (Absender)
              </span>
              <input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder={SITE.brand}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                {settings?.hasPassword ? "Neues Passwort (leer = unverändert)" : "Passwort"}
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort oder App-Kennwort"
                className="mt-2 w-full border border-border bg-background px-3 py-2 font-mono text-sm"
                autoComplete="new-password"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                IMAP-Host
              </span>
              <input
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.example.com"
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                IMAP-Port
              </span>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={imapSecure}
                onChange={(e) => setImapSecure(e.target.checked)}
              />
              IMAP SSL/TLS
            </label>

            <label className="block sm:col-span-2">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                SMTP-Host
              </span>
              <input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                SMTP-Port
              </span>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
              />
              SMTP SSL (aus = STARTTLS auf 587)
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !user.trim() || !imapHost.trim() || !smtpHost.trim()}
              onClick={() => void handleSave()}
              className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Verbindet …" : "Speichern & verbinden"}
            </button>
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
                    const res = await clearMailboxConnection();
                    applySettings(res.settings);
                    setMsg("Postfach-Zugang gelöscht.");
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
                  }
                })();
              }}
              className="border border-border px-5 py-2.5 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary"
            >
              Zugang löschen
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

      {settings?.configured && showCompose && (
        <div className="mt-8 border border-border p-6">
          <h2 className="font-serif text-2xl text-primary">Neue E-Mail</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Versand über Resend · Absender {settings.user} (Reply-To) · Signatur wie bei
            Angebotsmails vorausgefüllt
          </p>
          <div className="mt-6 grid max-w-2xl gap-4">
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">An</span>
              <input
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="empfaenger@beispiel.de"
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                Betreff
              </span>
              <input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                Nachricht
              </span>
              <textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                rows={10}
                placeholder="Nachricht oberhalb der Signatur schreiben …"
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                Anhänge (max. 12 MB / Datei)
              </span>
              <input
                type="file"
                multiple
                onChange={(e) => setComposeFiles(e.target.files)}
                className="mt-2 block w-full text-sm text-muted-foreground"
              />
            </label>
            <button
              type="button"
              disabled={
                sending ||
                !composeTo.trim() ||
                !composeSubject.trim() ||
                !messageAboveSignature(composeBody, sigPreview)
              }
              onClick={() => void handleCompose()}
              className="w-fit border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              {sending ? "Sendet …" : "Senden (Resend)"}
            </button>
          </div>
        </div>
      )}

      {settings?.configured && (
        <>
          <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Posteingang · {rows.filter((r) => r.unseen).length} ungelesen · {total} gesamt · IMAP /
              Resend
            </span>
            <span className="text-xs">
              {settings.user} · {settings.imapHost}
            </span>
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
                              rows={8}
                              placeholder="Antwort oberhalb der Signatur schreiben …"
                              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                              Anhänge (max. 12 MB / Datei)
                            </span>
                            <input
                              type="file"
                              multiple
                              onChange={(e) => setReplyFiles(e.target.files)}
                              className="mt-2 block w-full text-sm text-muted-foreground"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={sending || !messageAboveSignature(replyBody, sigPreview)}
                            onClick={() => void handleReply()}
                            className="border border-primary bg-primary px-5 py-2.5 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
                          >
                            {sending ? "Sendet …" : "Antwort senden (Resend)"}
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
