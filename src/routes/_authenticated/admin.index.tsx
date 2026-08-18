import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listOfferRequests, deleteOfferRequest, type OfferListRow } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminListPage,
});

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n));

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

type Filter = "all" | "pending" | "sent" | "opened" | "accepted" | "invoiced" | "paid" | "failed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "pending", label: "Offen" },
  { key: "sent", label: "Gesendet" },
  { key: "opened", label: "Link geöffnet" },
  { key: "accepted", label: "Akzeptiert" },
  { key: "invoiced", label: "Rechnung" },
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
  return r.rechnung_status === "paid";
}
function isInvoiceSent(r: OfferListRow) {
  return r.rechnung_status === "sent";
}
function isInvoiceFailed(r: OfferListRow) {
  return r.rechnung_status === "failed";
}

function matchesFilter(r: OfferListRow, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "paid":
      return isPaid(r);
    case "invoiced":
      return isInvoiceSent(r) && !isPaid(r);
    case "accepted":
      // Angenommen, aber noch keine Rechnung versendet / bezahlt
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
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => matchesFilter(r, filter));

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

  return (
    <section className="container-prose py-16">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 text-4xl">Angebotsanfragen</h1>
          <span className="rule-gold mt-4" />
        </div>
        <div className="flex items-center gap-4">
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

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`border px-4 py-2 text-xs uppercase tracking-widest ${
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            {f.label}
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
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-parchment">
                  <td className="p-3 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="p-3 font-mono text-xs">
                    <Link to="/admin/$id" params={{ id: r.id }} className="text-primary underline">
                      {r.angebot_nr}
                    </Link>
                  </td>
                  <td className="p-3">
                    <div>{r.customer_company || r.customer_name}</div>
                    {r.customer_company && <div className="text-xs text-muted-foreground">{r.customer_name}</div>}
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
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
  // Fortschrittlicher Status gewinnt: Bezahlt > Rechnung > Angenommen > Link geöffnet > Angebot gesendet …
  let label: string;
  let cls: string;
  if (isPaid(row)) {
    label = "Bezahlt";
    cls = "border-green-700 bg-green-700 text-white";
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
