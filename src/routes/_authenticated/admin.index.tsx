import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listOfferRequests,
  deleteOfferRequest,
  listAdminNotifications,
  markAdminNotificationRead,
  type OfferListRow,
  type AdminNotificationListItem,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminListPage,
});

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n));

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

type Filter =
  | "all"
  | "pending"
  | "sent"
  | "opened"
  | "accepted"
  | "invoiced"
  | "overdue"
  | "paid"
  | "failed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "pending", label: "Offen" },
  { key: "sent", label: "Gesendet" },
  { key: "opened", label: "Link geöffnet" },
  { key: "accepted", label: "Akzeptiert" },
  { key: "invoiced", label: "Rechnung" },
  { key: "overdue", label: "Überfällig" },
  { key: "paid", label: "Bezahlt" },
  { key: "failed", label: "Fehlgeschlagen" },
];

function isAccepted(r: OfferListRow) {
  return !!r.accepted_at || r.status === "accepted";
}
function isLinkOpened(r: OfferListRow) {
  return !!r.accept_link_opened_at && !isAccepted(r);
}
function isPaid(r: OfferListRow) {
  return r.rechnung_status === "paid" || !!r.paid_at;
}
function isInvoiceSent(r: OfferListRow) {
  return r.rechnung_status === "sent";
}
function isInvoiceFailed(r: OfferListRow) {
  return r.rechnung_status === "failed";
}

/** Offene Rechnung mit abgelaufenem Fälligkeitsdatum. */
export function isInvoiceOverdue(r: OfferListRow): boolean {
  if (!isInvoiceSent(r) || isPaid(r)) return false;
  if (!r.rechnung_faellig_am) return false;
  const due = new Date(r.rechnung_faellig_am + "T23:59:59");
  return due.getTime() < Date.now();
}

function matchesFilter(r: OfferListRow, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "paid":
      return isPaid(r);
    case "overdue":
      return isInvoiceOverdue(r);
    case "invoiced":
      return isInvoiceSent(r) && !isPaid(r);
    case "accepted":
      return isAccepted(r) && !isInvoiceSent(r) && !isPaid(r) && !isInvoiceFailed(r);
    case "opened":
      return isLinkOpened(r) && !isInvoiceSent(r) && !isPaid(r);
    case "sent":
      return r.status === "sent" && !isAccepted(r) && !isLinkOpened(r) && !isInvoiceSent(r) && !isPaid(r);
    case "pending":
      return r.status === "pending";
    case "failed":
      return r.status === "failed" || isInvoiceFailed(r);
    default:
      return true;
  }
}

function AdminListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OfferListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AdminNotificationListItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  async function loadNotifications() {
    try {
      const res = await listAdminNotifications();
      setNotifications(res.rows);
      setUnread(res.unread);
    } catch {
      // Tabelle ggf. noch nicht migriert — Admin-Liste bleibt nutzbar
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listOfferRequests();
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
    void loadNotifications();
  }

  useEffect(() => {
    load();
    const t = window.setInterval(() => {
      void loadNotifications();
    }, 45_000);
    return () => window.clearInterval(t);
  }, []);

  const filtered = rows.filter((r) => matchesFilter(r, filter));
  const overdueCount = rows.filter(isInvoiceOverdue).length;

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function handleDelete(r: OfferListRow) {
    if (
      !window.confirm(
        `Vorgang ${r.angebot_nr} (${r.customer_company || r.customer_name}) wirklich unwiderruflich löschen?`,
      )
    ) {
      return;
    }
    setDeletingId(r.id);
    try {
      await deleteOfferRequest({ data: { id: r.id } });
      setRows((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleMarkRead(id?: string, all?: boolean) {
    try {
      await markAdminNotificationRead({ data: all ? { all: true } : { id } });
      await loadNotifications();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Konnte nicht als gelesen markieren.");
    }
  }

  return (
    <section className="container-prose py-16">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 text-4xl">Angebotsanfragen</h1>
          <span className="rule-gold mt-4" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="relative border border-primary px-4 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
              aria-expanded={notifOpen}
              aria-label="Benachrichtigungen"
            >
              Benachrichtigungen
              {unread > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center bg-red-700 px-1 text-[0.65rem] font-semibold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 z-20 mt-2 w-[min(100vw-2rem,22rem)] border border-border bg-background shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    Neuigkeiten
                  </span>
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(undefined, true)}
                      className="text-[0.65rem] uppercase tracking-widest text-primary hover:underline"
                    >
                      Alle gelesen
                    </button>
                  )}
                </div>
                <ul className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 && (
                    <li className="px-3 py-4 text-sm text-muted-foreground">Keine Benachrichtigungen.</li>
                  )}
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`border-b border-border px-3 py-3 text-sm ${n.read_at ? "opacity-60" : "bg-parchment/60"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {n.offer_request_id ? (
                            <Link
                              to="/admin/$id"
                              params={{ id: n.offer_request_id }}
                              className="font-medium text-primary underline"
                              onClick={() => {
                                if (!n.read_at) void handleMarkRead(n.id);
                                setNotifOpen(false);
                              }}
                            >
                              {n.title}
                            </Link>
                          ) : (
                            <span className="font-medium">{n.title}</span>
                          )}
                          {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                          <p className="mt-1 text-[0.65rem] text-muted-foreground">{fmtDate(n.created_at)}</p>
                        </div>
                        {!n.read_at && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(n.id)}
                            className="shrink-0 text-[0.65rem] uppercase tracking-widest text-muted-foreground hover:text-primary"
                            title="Als gelesen markieren"
                          >
                            ✓
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <Link
            to="/admin/traffic"
            className="border border-primary px-4 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
          >
            Traffic
          </Link>
          <Link
            to="/admin/manuell"
            className="border border-primary px-4 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
          >
            Manuelle Bestätigungen
          </Link>
          <Link
            to="/admin/einstellungen"
            className="border border-primary px-4 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground"
          >
            Einstellungen
          </Link>
          <button
            onClick={handleSignOut}
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
          >
            Abmelden
          </button>
        </div>
      </div>

      {overdueCount > 0 && (
        <button
          type="button"
          onClick={() => setFilter("overdue")}
          className="mt-6 flex w-full items-center gap-3 border border-red-700 bg-red-50 px-4 py-3 text-left text-sm text-red-900 hover:bg-red-100"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-red-700 text-base font-bold text-white" aria-hidden>
            !
          </span>
          <span>
            <strong>{overdueCount}</strong> Rechnung{overdueCount === 1 ? "" : "en"} überfällig — Mahnung senden
          </span>
        </button>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`border px-4 py-2 text-xs uppercase tracking-widest ${
              filter === f.key
                ? f.key === "overdue"
                  ? "border-red-700 bg-red-700 text-white"
                  : "border-primary bg-primary text-primary-foreground"
                : f.key === "overdue" && overdueCount > 0
                  ? "border-red-700 text-red-800 hover:bg-red-50"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            {f.label}
            {f.key === "overdue" && overdueCount > 0 ? ` (${overdueCount})` : ""}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          Aktualisieren
        </button>
      </div>

      {loading && <p className="mt-8 text-sm text-muted-foreground">Lade …</p>}
      {error && <p className="mt-8 text-sm text-red-700">{error}</p>}

      {!loading && !error && (
        <div className="mt-8 overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-parchment text-xs uppercase tracking-widest text-muted-foreground">
                <th className="p-3 text-left w-8" aria-label="Hinweis" />
                <th className="p-3 text-left">Datum</th>
                <th className="p-3 text-left">Nr.</th>
                <th className="p-3 text-left">Kunde</th>
                <th className="p-3 text-left">E-Mail</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Versand</th>
                <th className="p-3 text-right">Summe</th>
                <th className="p-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const overdue = isInvoiceOverdue(r);
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border hover:bg-parchment ${overdue ? "bg-red-50/70" : ""}`}
                  >
                    <td className="p-3 text-center">
                      {overdue && (
                        <Link
                          to="/admin/$id"
                          params={{ id: r.id }}
                          title={`Rechnung überfällig${r.rechnung_faellig_am ? ` seit ${new Date(r.rechnung_faellig_am).toLocaleDateString("de-DE")}` : ""} — Mahnung senden`}
                          className="inline-flex h-7 w-7 items-center justify-center bg-red-700 text-sm font-bold text-white"
                          aria-label="Überfällig — Mahnung senden"
                        >
                          !
                        </Link>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="p-3 font-mono text-xs">
                      <Link to="/admin/$id" params={{ id: r.id }} className="text-primary underline">
                        {r.angebot_nr}
                      </Link>
                    </td>
                    <td className="p-3">
                      <div>{r.customer_company || r.customer_name}</div>
                      {r.customer_company && (
                        <div className="text-xs text-muted-foreground">{r.customer_name}</div>
                      )}
                    </td>
                    <td className="p-3 text-xs">{r.customer_email}</td>
                    <td className="p-3">
                      <StatusBadge row={r} />
                      {r.error_message && (
                        <div className="mt-1 text-[0.7rem] text-red-700">{r.error_message}</div>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                      {r.sent_at
                        ? `gesendet ${fmtDate(r.sent_at)}`
                        : r.status === "pending" && new Date(r.scheduled_send_at).getFullYear() >= 2099
                          ? "offen — manuell senden"
                          : `geplant ${fmtDate(r.scheduled_send_at)}`}
                    </td>
                    <td className="p-3 text-right font-medium">{fmtEUR(r.total)}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="text-xs uppercase tracking-widest text-red-700 hover:underline disabled:opacity-50"
                        title="Vorgang löschen"
                      >
                        {deletingId === r.id ? "Lösche …" : "Löschen"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                    Keine Einträge.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ row }: { row: OfferListRow }) {
  let label: string;
  let cls: string;
  if (isPaid(row)) {
    label = "Bezahlt";
    cls = "border-green-700 bg-green-700 text-white";
  } else if (isInvoiceOverdue(row)) {
    label = "Überfällig";
    cls = "border-red-700 bg-red-700 text-white";
  } else if (isInvoiceSent(row)) {
    label = "Rechnung gesendet";
    cls = "border-primary text-primary";
  } else if (isInvoiceFailed(row)) {
    label = "Rechnung fehlgeschlagen";
    cls = "border-red-700 text-red-700";
  } else if (isAccepted(row)) {
    label = "Akzeptiert";
    cls = "border-green-700 text-green-800";
  } else if (isLinkOpened(row)) {
    label = "Link geöffnet";
    cls = "border-amber-700 bg-amber-50 text-amber-900";
  } else if (row.status === "sent") {
    label = "Gesendet";
    cls = "border-border text-foreground/70";
  } else if (row.status === "failed") {
    label = "Fehler";
    cls = "border-red-700 text-red-700";
  } else {
    label = "Offen";
    cls = "border-gold text-primary";
  }
  return (
    <span className={`inline-block border px-2 py-0.5 text-[0.65rem] uppercase tracking-widest ${cls}`}>
      {label}
    </span>
  );
}
