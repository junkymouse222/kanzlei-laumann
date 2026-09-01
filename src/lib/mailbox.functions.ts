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
  authMode: "mailbox_auth_mode",
  oauthClientId: "mailbox_oauth_client_id",
  oauthTenant: "mailbox_oauth_tenant",
  oauthRefresh: "mailbox_oauth_refresh_token",
  oauthAccess: "mailbox_oauth_access_token",
  oauthExpires: "mailbox_oauth_expires_at",
} as const;

/** Microsoft Graph / Exchange Online OAuth scopes for IMAP + SMTP AUTH. */
export const MS_MAIL_SCOPES =
  "offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send";

export const M365_PRESET = {
  imapHost: "outlook.office365.com",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.office365.com",
  smtpPort: 587,
  /** false = STARTTLS auf Port 587 (nicht SSL-on-connect). */
  smtpSecure: false,
} as const;

export type MailboxAuthMode = "password" | "oauth";

export type MailboxSettingsPublic = {
  configured: boolean;
  authMode: MailboxAuthMode;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  user: string;
  hasPassword: boolean;
  fromName: string;
  oauthClientId: string;
  oauthTenant: string;
  hasOAuth: boolean;
};

type MailboxSecrets = {
  authMode: MailboxAuthMode;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  user: string;
  password: string;
  fromName: string;
  oauthClientId: string;
  oauthTenant: string;
  accessToken?: string;
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

async function upsertSetting(key: string, value: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { error } = await admin.from("app_settings").upsert(
    {
      site_key: SITE.siteKey,
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "site_key,key" },
  );
  if (error) throw new Error(error.message);
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
  const authMode = (map.get(KEYS.authMode) || "password") === "oauth" ? "oauth" : "password";
  const hasOAuth = !!(map.get(KEYS.oauthRefresh) || "").trim();
  const configured =
    !!user &&
    !!imapHost &&
    (authMode === "oauth" ? hasOAuth : password.length > 0);
  return {
    configured,
    authMode,
    imapHost,
    imapPort: parsePort(map.get(KEYS.imapPort), 993),
    imapSecure: parseBool(map.get(KEYS.imapSecure), true),
    smtpHost: (map.get(KEYS.smtpHost) || "").trim() || imapHost,
    smtpPort: parsePort(map.get(KEYS.smtpPort), 587),
    smtpSecure: parseBool(map.get(KEYS.smtpSecure), false),
    user,
    hasPassword: password.length > 0,
    fromName: (map.get(KEYS.fromName) || "").trim() || SITE.brand,
    oauthClientId: (map.get(KEYS.oauthClientId) || "").trim(),
    oauthTenant: (map.get(KEYS.oauthTenant) || "organizations").trim() || "organizations",
    hasOAuth,
  };
}

async function refreshMicrosoftToken(args: {
  clientId: string;
  tenant: string;
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(args.tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: args.clientId,
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    scope: MS_MAIL_SCOPES,
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        "Microsoft-Token konnte nicht erneuert werden. Bitte erneut mit Microsoft anmelden.",
    );
  }
  const expiresAt = Date.now() + Math.max(60, Number(json.expires_in || 3600) - 120) * 1000;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || args.refreshToken,
    expiresAt,
  };
}

async function ensureAccessToken(map: Map<string, string>): Promise<string> {
  const clientId = (map.get(KEYS.oauthClientId) || "").trim();
  const tenant = (map.get(KEYS.oauthTenant) || "organizations").trim() || "organizations";
  const refresh = (map.get(KEYS.oauthRefresh) || "").trim();
  if (!clientId || !refresh) {
    throw new Error("Microsoft-Anmeldung fehlt. Bitte unter Postfach → „Mit Microsoft anmelden“ verbinden.");
  }
  const cached = (map.get(KEYS.oauthAccess) || "").trim();
  const expiresAt = Number(map.get(KEYS.oauthExpires) || 0);
  if (cached && expiresAt > Date.now()) return cached;

  const tokens = await refreshMicrosoftToken({ clientId, tenant, refreshToken: refresh });
  await upsertSetting(KEYS.oauthAccess, tokens.accessToken);
  await upsertSetting(KEYS.oauthRefresh, tokens.refreshToken);
  await upsertSetting(KEYS.oauthExpires, String(tokens.expiresAt));
  return tokens.accessToken;
}

async function loadSecrets(): Promise<MailboxSecrets> {
  const map = await readSettingsMap();
  const pub = mapToPublic(map);
  if (!pub.imapHost || !pub.user) {
    throw new Error("Postfach nicht konfiguriert. Bitte Zugangsdaten speichern.");
  }

  if (pub.authMode === "oauth") {
    const accessToken = await ensureAccessToken(map);
    return {
      authMode: "oauth",
      imapHost: pub.imapHost,
      imapPort: pub.imapPort,
      imapSecure: pub.imapSecure,
      smtpHost: pub.smtpHost || pub.imapHost,
      smtpPort: pub.smtpPort,
      smtpSecure: pub.smtpSecure,
      user: pub.user,
      password: "",
      fromName: pub.fromName,
      oauthClientId: pub.oauthClientId,
      oauthTenant: pub.oauthTenant,
      accessToken,
    };
  }

  const password = map.get(KEYS.password) || "";
  if (!password) {
    throw new Error(
      "Kein Passwort hinterlegt. Für GoDaddy/Outlook: App-Passwort erstellen oder Microsoft-OAuth nutzen.",
    );
  }
  return {
    authMode: "password",
    imapHost: pub.imapHost,
    imapPort: pub.imapPort,
    imapSecure: pub.imapSecure,
    smtpHost: pub.smtpHost || pub.imapHost,
    smtpPort: pub.smtpPort,
    smtpSecure: pub.smtpSecure,
    user: pub.user,
    password,
    fromName: pub.fromName,
    oauthClientId: pub.oauthClientId,
    oauthTenant: pub.oauthTenant,
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

function imapAuth(secrets: MailboxSecrets): { user: string; pass?: string; accessToken?: string } {
  if (secrets.authMode === "oauth" && secrets.accessToken) {
    return { user: secrets.user, accessToken: secrets.accessToken };
  }
  return { user: secrets.user, pass: secrets.password };
}

async function createSmtpTransport(secrets: MailboxSecrets) {
  const nodemailer = await import("nodemailer");
  const createTransport =
    (nodemailer as any).createTransport || (nodemailer as any).default.createTransport;

  const useStartTls = secrets.smtpPort === 587 || !secrets.smtpSecure;
  const auth =
    secrets.authMode === "oauth" && secrets.accessToken
      ? { type: "OAuth2", user: secrets.user, accessToken: secrets.accessToken }
      : { user: secrets.user, pass: secrets.password };

  return createTransport({
    host: secrets.smtpHost,
    port: secrets.smtpPort,
    secure: useStartTls ? false : secrets.smtpSecure,
    requireTLS: useStartTls,
    auth,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
  });
}

async function withImap<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const secrets = await loadSecrets();
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: secrets.imapHost,
    port: secrets.imapPort,
    secure: secrets.imapSecure,
    auth: imapAuth(secrets),
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
        authMode: z.enum(["password", "oauth"]).optional(),
        imapHost: z.string().trim().min(1).max(200),
        imapPort: z.number().int().min(1).max(65535),
        imapSecure: z.boolean(),
        smtpHost: z.string().trim().min(1).max(200),
        smtpPort: z.number().int().min(1).max(65535),
        smtpSecure: z.boolean(),
        user: z.string().trim().email().max(255),
        password: z.string().max(500).optional(),
        fromName: z.string().trim().max(200).optional(),
        oauthClientId: z.string().trim().max(200).optional(),
        oauthTenant: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const now = new Date().toISOString();
    const authMode = data.authMode || "password";

    const rows: Array<{ site_key: string; key: string; value: string; updated_at: string }> = [
      { site_key: SITE.siteKey, key: KEYS.authMode, value: authMode, updated_at: now },
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
      {
        site_key: SITE.siteKey,
        key: KEYS.oauthClientId,
        value: (data.oauthClientId || "").trim(),
        updated_at: now,
      },
      {
        site_key: SITE.siteKey,
        key: KEYS.oauthTenant,
        value: (data.oauthTenant || "organizations").trim() || "organizations",
        updated_at: now,
      },
    ];

    if (authMode === "password") {
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
          throw new Error(
            "Bitte App-Passwort eintragen (GoDaddy/Outlook → Sicherheit → App-Kennwort) oder OAuth nutzen.",
          );
        }
      }
    }

    const { error } = await admin.from("app_settings").upsert(rows, { onConflict: "site_key,key" });
    if (error) throw new Error(error.message);
    return { ok: true as const, settings: mapToPublic(await readSettingsMap()) };
  });

/** Startet Microsoft Device-Code-Login (GoDaddy/Outlook OAuth). */
export const startMicrosoftMailboxLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const map = await readSettingsMap();
    const clientId = (map.get(KEYS.oauthClientId) || "").trim();
    const tenant = (map.get(KEYS.oauthTenant) || "organizations").trim() || "organizations";
    const user = (map.get(KEYS.user) || "").trim();
    if (!clientId) {
      throw new Error(
        "Azure App Client-ID fehlt. Bitte zuerst speichern (Anleitung im Admin unter Postfach).",
      );
    }
    if (!user) throw new Error("Bitte zuerst die Postfach-E-Mail speichern.");

    const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/devicecode`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        scope: MS_MAIL_SCOPES,
      }),
    });
    const json = (await res.json()) as {
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      expires_in?: number;
      interval?: number;
      message?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.device_code || !json.user_code) {
      throw new Error(json.error_description || json.error || "Device-Login konnte nicht gestartet werden.");
    }
    return {
      deviceCode: json.device_code,
      userCode: json.user_code,
      verificationUri: json.verification_uri || "https://microsoft.com/devicelogin",
      expiresIn: Number(json.expires_in || 900),
      interval: Number(json.interval || 5),
      message: json.message || `Code ${json.user_code} unter ${json.verification_uri} eingeben.`,
      emailHint: user,
    };
  });

/** Ein Poll-Schritt für Microsoft Device-Code (UI pollt alle paar Sekunden). */
export const pollMicrosoftMailboxLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ deviceCode: z.string().min(10) }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const map = await readSettingsMap();
    const clientId = (map.get(KEYS.oauthClientId) || "").trim();
    const tenant = (map.get(KEYS.oauthTenant) || "organizations").trim() || "organizations";
    if (!clientId) throw new Error("Client-ID fehlt.");

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: data.deviceCode,
      }),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (json.access_token && json.refresh_token) {
      const expiresAt = Date.now() + Math.max(60, Number(json.expires_in || 3600) - 120) * 1000;
      await upsertSetting(KEYS.authMode, "oauth");
      await upsertSetting(KEYS.oauthAccess, json.access_token);
      await upsertSetting(KEYS.oauthRefresh, json.refresh_token);
      await upsertSetting(KEYS.oauthExpires, String(expiresAt));
      await upsertSetting(KEYS.imapHost, M365_PRESET.imapHost);
      await upsertSetting(KEYS.imapPort, String(M365_PRESET.imapPort));
      await upsertSetting(KEYS.imapSecure, "true");
      await upsertSetting(KEYS.smtpHost, M365_PRESET.smtpHost);
      await upsertSetting(KEYS.smtpPort, String(M365_PRESET.smtpPort));
      await upsertSetting(KEYS.smtpSecure, "false");
      return {
        status: "complete" as const,
        settings: mapToPublic(await readSettingsMap()),
      };
    }

    if (json.error === "authorization_pending" || json.error === "slow_down") {
      return {
        status: "pending" as const,
        slowDown: json.error === "slow_down",
      };
    }
    if (json.error === "expired_token") {
      throw new Error("Anmeldecode abgelaufen. Bitte erneut starten.");
    }
    if (json.error === "access_denied") {
      throw new Error("Anmeldung abgebrochen.");
    }
    throw new Error(json.error_description || json.error || "Microsoft-Login fehlgeschlagen.");
  });

export const testMailboxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const secrets = await loadSecrets();
    await withImap(async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        void client.mailbox;
      } finally {
        lock.release();
      }
    });

    const transport = await createSmtpTransport(secrets);
    try {
      await transport.verify();
    } finally {
      transport.close();
    }

    return {
      ok: true as const,
      message:
        secrets.authMode === "oauth"
          ? "Microsoft OAuth: IMAP und SMTP OK."
          : "IMAP und SMTP Verbindung erfolgreich.",
    };
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

    const transport = await createSmtpTransport(secrets);
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
