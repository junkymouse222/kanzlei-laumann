import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SITE } from "@/lib/site";

async function assertAdmin(supabase: { from: (t: string) => any }, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nicht berechtigt.");
}

const KEYS = {
  imapHost: "mailbox_imap_host",
  imapPort: "mailbox_imap_port",
  imapSecure: "mailbox_imap_secure",
  smtpHost: "mailbox_smtp_host",
  smtpPort: "mailbox_smtp_port",
  smtpSecure: "mailbox_smtp_secure",
  user: "mailbox_user",
  password: "mailbox_password",
  fromName: "mailbox_from_name",
} as const;

export type MailboxSettingsPublic = {
  configured: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  user: string;
  /** true wenn Passwort hinterlegt (Wert selbst nie an Client). */
  hasPassword: boolean;
  fromName: string;
};

type MailboxSecrets = {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  user: string;
  password: string;
  fromName: string;
};

export type MailboxListItem = {
  uid: number;
  seq: number;
  subject: string;
  from: string;
  fromEmail: string;
  date: string | null;
  unseen: boolean;
  flagged: boolean;
  preview: string;
};

export type MailboxMessageDetail = {
  uid: number;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string | null;
  messageId: string | null;
  references: string | null;
  text: string;
  html: string | null;
  attachments: Array<{ filename: string; contentType: string; size: number }>;
};

function parsePort(value: string | undefined, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 65535) return fallback;
  return n;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

async function readSettingsMap(): Promise<Map<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .from("app_settings")
    .select("key, value")
    .eq("site_key", SITE.siteKey)
    .in("key", Object.values(KEYS));
  if (error) throw new Error(error.message);
  return new Map<string, string>((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
}

function mapToPublic(map: Map<string, string>): MailboxSettingsPublic {
  const user = (map.get(KEYS.user) || "").trim();
  const imapHost = (map.get(KEYS.imapHost) || "").trim();
  const password = map.get(KEYS.password) || "";
  return {
    configured: !!(user && imapHost && password),
    imapHost,
    imapPort: parsePort(map.get(KEYS.imapPort), 993),
    imapSecure: parseBool(map.get(KEYS.imapSecure), true),
    smtpHost: (map.get(KEYS.smtpHost) || "").trim() || imapHost,
    smtpPort: parsePort(map.get(KEYS.smtpPort), 465),
    smtpSecure: parseBool(map.get(KEYS.smtpSecure), true),
    user,
    hasPassword: password.length > 0,
    fromName: (map.get(KEYS.fromName) || "").trim() || SITE.brand,
  };
}

async function loadSecrets(): Promise<MailboxSecrets> {
  const map = await readSettingsMap();
  const pub = mapToPublic(map);
  const password = map.get(KEYS.password) || "";
  if (!pub.imapHost || !pub.user || !password) {
    throw new Error("Postfach nicht konfiguriert. Bitte unter Admin → Postfach die Zugangsdaten speichern.");
  }
  return {
    imapHost: pub.imapHost,
    imapPort: pub.imapPort,
    imapSecure: pub.imapSecure,
    smtpHost: pub.smtpHost || pub.imapHost,
    smtpPort: pub.smtpPort,
    smtpSecure: pub.smtpSecure,
    user: pub.user,
    password,
    fromName: pub.fromName,
  };
}

function formatAddress(value: unknown): { display: string; email: string } {
  if (!value) return { display: "—", email: "" };
  if (typeof value === "string") {
    const m = value.match(/<([^>]+)>/);
    return { display: value, email: (m?.[1] || value).trim() };
  }
  if (Array.isArray(value) && value.length) {
    const first = value[0] as { name?: string; address?: string };
    const email = String(first.address || "").trim();
    const name = String(first.name || "").trim();
    const display = name ? `${name} <${email}>` : email || "—";
    return { display, email };
  }
  if (typeof value === "object" && value && "address" in (value as object)) {
    const o = value as { name?: string; address?: string };
    const email = String(o.address || "").trim();
    const name = String(o.name || "").trim();
    return { display: name ? `${name} <${email}>` : email || "—", email };
  }
  return { display: String(value), email: "" };
}

async function withImap<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const secrets = await loadSecrets();
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: secrets.imapHost,
    port: secrets.imapPort,
    secure: secrets.imapSecure,
    auth: { user: secrets.user, pass: secrets.password },
    logger: false,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/** HTML-Signatur mit aktivem Verwalter + Kanzlei-Stammdaten. */
export async function buildMailboxSignatureHtml(): Promise<string> {
  const { loadActiveVerwalter } = await import("@/lib/settings.functions");
  const verwalter = await loadActiveVerwalter();
  const offices = SITE.offices
    .map((o) => `${escapeHtml(o.label)}: ${escapeHtml(o.street)}, ${escapeHtml(o.postalCode)} ${escapeHtml(o.city)}`)
    .join("<br/>");
  return `
<p style="margin:24px 0 0 0;">Mit freundlichen Grüßen</p>
<p style="margin:8px 0 0 0;"><strong>${escapeHtml(verwalter.name)}</strong><br/>
${escapeHtml(verwalter.role)}<br/>
${escapeHtml(SITE.brand)}</p>
<p style="margin:12px 0 0 0;font-size:12px;line-height:1.5;color:#666;">
${offices}<br/>
Tel. ${escapeHtml(SITE.phoneDisplay)} · ${escapeHtml(SITE.email)}<br/>
USt-IdNr. ${escapeHtml(SITE.ustId)}
</p>`.trim();
}

export async function buildMailboxSignatureText(): Promise<string> {
  const { loadActiveVerwalter } = await import("@/lib/settings.functions");
  const verwalter = await loadActiveVerwalter();
  const offices = SITE.offices
    .map((o) => `${o.label}: ${o.street}, ${o.postalCode} ${o.city}`)
    .join("\n");
  return [
    "Mit freundlichen Grüßen",
    "",
    verwalter.name,
    verwalter.role,
    SITE.brand,
    "",
    offices,
    `Tel. ${SITE.phoneDisplay} · ${SITE.email}`,
    `USt-IdNr. ${SITE.ustId}`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainToHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n|\n|\r/g, "<br/>");
}

export const getMailboxSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MailboxSettingsPublic> => {
    await assertAdmin(context.supabase as never, context.userId);
    return mapToPublic(await readSettingsMap());
  });

export const saveMailboxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        imapHost: z.string().trim().min(1).max(200),
        imapPort: z.number().int().min(1).max(65535),
        imapSecure: z.boolean(),
        smtpHost: z.string().trim().min(1).max(200),
        smtpPort: z.number().int().min(1).max(65535),
        smtpSecure: z.boolean(),
        user: z.string().trim().email().max(255),
        password: z.string().max(500).optional(),
        fromName: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const now = new Date().toISOString();

    const rows: Array<{ site_key: string; key: string; value: string; updated_at: string }> = [
      { site_key: SITE.siteKey, key: KEYS.imapHost, value: data.imapHost, updated_at: now },
      { site_key: SITE.siteKey, key: KEYS.imapPort, value: String(data.imapPort), updated_at: now },
      { site_key: SITE.siteKey, key: KEYS.imapSecure, value: data.imapSecure ? "true" : "false", updated_at: now },
      { site_key: SITE.siteKey, key: KEYS.smtpHost, value: data.smtpHost, updated_at: now },
      { site_key: SITE.siteKey, key: KEYS.smtpPort, value: String(data.smtpPort), updated_at: now },
      { site_key: SITE.siteKey, key: KEYS.smtpSecure, value: data.smtpSecure ? "true" : "false", updated_at: now },
      { site_key: SITE.siteKey, key: KEYS.user, value: data.user, updated_at: now },
      {
        site_key: SITE.siteKey,
        key: KEYS.fromName,
        value: (data.fromName || SITE.brand).trim(),
        updated_at: now,
      },
    ];

    if (data.password && data.password.trim()) {
      rows.push({
        site_key: SITE.siteKey,
        key: KEYS.password,
        value: data.password,
        updated_at: now,
      });
    } else {
      const map = await readSettingsMap();
      if (!map.get(KEYS.password)) {
        throw new Error("Bitte ein Passwort für das Postfach angeben.");
      }
    }

    const { error } = await admin.from("app_settings").upsert(rows, { onConflict: "site_key,key" });
    if (error) throw new Error(error.message);
    return { ok: true as const, settings: mapToPublic(await readSettingsMap()) };
  });

export const testMailboxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const secrets = await loadSecrets();
    await withImap(async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        // touch mailbox
        void client.mailbox;
      } finally {
        lock.release();
      }
    });

    // SMTP check
    const nodemailer = await import("nodemailer");
    const createTransport =
      (nodemailer as any).createTransport || (nodemailer as any).default.createTransport;
    const transport = createTransport({
      host: secrets.smtpHost,
      port: secrets.smtpPort,
      secure: secrets.smtpSecure,
      auth: { user: secrets.user, pass: secrets.password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });
    try {
      await transport.verify();
    } finally {
      transport.close();
    }

    return { ok: true as const, message: "IMAP und SMTP Verbindung erfolgreich." };
  });

export const listMailboxMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
        folder: z.string().trim().min(1).max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }): Promise<{ rows: MailboxListItem[]; total: number }> => {
    await assertAdmin(context.supabase as never, context.userId);
    const limit = data.limit ?? 40;
    const folder = data.folder || "INBOX";

    return withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const exists = Number(client.mailbox?.exists || 0);
        if (exists === 0) return { rows: [], total: 0 };

        const from = Math.max(1, exists - limit + 1);
        const rows: MailboxListItem[] = [];

        for await (const msg of client.fetch(`${from}:*`, {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          source: { start: 0, maxLength: 1200 },
        })) {
          const env = msg.envelope || {};
          const fromAddr = formatAddress(env.from);
          let preview = "";
          try {
            if (msg.source) {
              const { simpleParser } = await import("mailparser");
              const parsed = await simpleParser(Buffer.from(msg.source));
              preview = String(parsed.text || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 160);
            }
          } catch {
            preview = "";
          }
          const flags = msg.flags instanceof Set ? msg.flags : new Set(msg.flags || []);
          rows.push({
            uid: msg.uid,
            seq: msg.seq,
            subject: String(env.subject || "(ohne Betreff)"),
            from: fromAddr.display,
            fromEmail: fromAddr.email,
            date: env.date ? new Date(env.date).toISOString() : null,
            unseen: !flags.has("\\Seen"),
            flagged: flags.has("\\Flagged"),
            preview,
          });
        }

        rows.sort((a, b) => b.uid - a.uid);
        return { rows, total: exists };
      } finally {
        lock.release();
      }
    });
  });

async function fetchMessageByUid(uid: number): Promise<MailboxMessageDetail> {
  return withImap(async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      let source: Buffer | null = null;
      let envelope: any = null;
      for await (const msg of client.fetch(String(uid), { uid: true, source: true, envelope: true }, { uid: true })) {
        source = Buffer.from(msg.source || []);
        envelope = msg.envelope;
      }
      if (!source) throw new Error("Nachricht nicht gefunden.");

      try {
        await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
      } catch {
        /* optional */
      }

      const { simpleParser } = await import("mailparser");
      const parsed = await simpleParser(source);
      const fromAddr = formatAddress(parsed.from || envelope?.from);
      const toAddr = formatAddress(parsed.to || envelope?.to);

      const refs = parsed.references
        ? Array.isArray(parsed.references)
          ? parsed.references.join(" ")
          : String(parsed.references)
        : null;

      return {
        uid,
        subject: String(parsed.subject || envelope?.subject || "(ohne Betreff)"),
        from: fromAddr.display,
        fromEmail: fromAddr.email,
        to: toAddr.display,
        date: parsed.date
          ? parsed.date.toISOString()
          : envelope?.date
            ? new Date(envelope.date).toISOString()
            : null,
        messageId: parsed.messageId || null,
        references: refs,
        text: String(parsed.text || "").trim() || "(Kein Textinhalt)",
        html: typeof parsed.html === "string" ? parsed.html : null,
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename || "anhang",
          contentType: a.contentType || "application/octet-stream",
          size: a.size || 0,
        })),
      };
    } finally {
      lock.release();
    }
  });
}

export const getMailboxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ uid: z.number().int().positive() }).parse(input))
  .handler(async ({ context, data }): Promise<MailboxMessageDetail> => {
    await assertAdmin(context.supabase as never, context.userId);
    return fetchMessageByUid(data.uid);
  });

export const replyMailboxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        uid: z.number().int().positive(),
        body: z.string().trim().min(1).max(50000),
        subject: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const secrets = await loadSecrets();

    const original = await fetchMessageByUid(data.uid);
    if (!original.fromEmail) throw new Error("Absender der Originalnachricht fehlt.");

    const subject =
      data.subject?.trim() ||
      (original.subject.toLowerCase().startsWith("re:")
        ? original.subject
        : `Re: ${original.subject}`);

    const sigHtml = await buildMailboxSignatureHtml();
    const sigText = await buildMailboxSignatureText();
    const bodyText = `${data.body.trim()}\n\n${sigText}`;
    const bodyHtml = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;color:#222;">
      <p style="margin:0 0 16px 0;">${plainToHtml(data.body.trim())}</p>
      ${sigHtml}
      <hr style="border:none;border-top:1px solid #ddd;margin:28px 0 12px 0;" />
      <p style="margin:0;font-size:12px;color:#888;">——— Originalnachricht ———</p>
      <pre style="white-space:pre-wrap;font-family:Georgia,serif;font-size:12px;color:#555;">${escapeHtml(original.text.slice(0, 8000))}</pre>
    </div>`;

    const nodemailer = await import("nodemailer");
    const createTransport =
      (nodemailer as any).createTransport || (nodemailer as any).default.createTransport;
    const transport = createTransport({
      host: secrets.smtpHost,
      port: secrets.smtpPort,
      secure: secrets.smtpSecure,
      auth: { user: secrets.user, pass: secrets.password },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
    });

    const fromHeader = `${secrets.fromName} <${secrets.user}>`;
    const references = [original.references, original.messageId].filter(Boolean).join(" ").trim();

    try {
      const info = await transport.sendMail({
        from: fromHeader,
        to: original.fromEmail,
        subject,
        text: bodyText,
        html: bodyHtml,
        headers: {
          ...(original.messageId ? { "In-Reply-To": original.messageId } : {}),
          ...(references ? { References: references } : {}),
        },
      });
      return {
        ok: true as const,
        messageId: String(info.messageId || ""),
        to: original.fromEmail,
        subject,
      };
    } catch (e) {
      throw new Error(
        `Antwort konnte nicht gesendet werden: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      transport.close();
    }
  });

export const getMailboxSignaturePreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    return {
      text: await buildMailboxSignatureText(),
      html: await buildMailboxSignatureHtml(),
    };
  });
