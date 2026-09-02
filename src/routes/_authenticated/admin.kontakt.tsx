import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  deleteContactInquiry,
  listContactInquiries,
  updateContactInquiryStatus,
  type ContactInquiryRow,
} from "@/lib/contact.functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/admin/kontakt")({
  head: () => ({
    meta: [
      { title: "Admin — Kontaktanfragen" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: KontaktAdminPage,
});

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

type Filter = "all" | "new" | "read" | "done" | "archived";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "new", label: "Neu" },
  { key: "read", label: "Gelesen" },
  { key: "done", label: "Erledigt" },
  { key: "archived", label: "Archiv" },
];

const STATUS_LABEL: Record<ContactInquiryRow["status"], string> = {
  new: "Neu",
  read: "Gelesen",
  done: "Erledigt",
  archived: "Archiv",
};

function KontaktAdminPage() {
  const [rows, setRows] = useState<ContactInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listContactInquiries();
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

  const filtered = rows.filter((r) => (filter === "all" ? true : r.status === filter));

  async function setStatus(id: string, status: ContactInquiryRow["status"]) {
    setBusyId(id);
    try {
      await updateContactInquiryStatus({ data: { id, status } });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status, updated_at: new Date().toISOString() } : r)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Status konnte nicht gespeichert werden.");
    } finally {
      setBusyId(null);
    }
  }

  async function openRow(row: ContactInquiryRow) {
    setOpenId((prev) => (prev === row.id ? null : row.id));
    if (row.status === "new") {
      await setStatus(row.id, "read");
    }
  }

  async function handleDelete(row: ContactInquiryRow) {
    if (!window.confirm(`Kontaktanfrage von ${row.name} wirklich löschen?`)) return;
    setBusyId(row.id);
    try {
      await deleteContactInquiry({ data: { id: row.id } });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (openId === row.id) setOpenId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="container-prose py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link to="/admin" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
            ← Anfragen
          </Link>
          <h1 className="mt-2 text-4xl">Kontaktanfragen</h1>
          <span className="rule-gold mt-4" />
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">
            Nachrichten vom Formular unter /kontakt. Neue Einträge werden zusätzlich an die Kanzlei-E-Mail geschickt.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
        >
          Aktualisieren
        </button>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`border px-4 py-2 text-xs uppercase tracking-widest ${
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            {f.label}
            {f.key === "new" ? ` (${rows.filter((r) => r.status === "new").length})` : ""}
          </button>
        ))}
      </div>

      {loading && <p className="mt-8 text-sm text-muted-foreground">Lade …</p>}
      {error && <p className="mt-8 text-sm text-red-700">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">Keine Kontaktanfragen in diesem Filter.</p>
      )}

      <ul className="mt-8 divide-y divide-border border border-border">
        {filtered.map((row) => {
          const open = openId === row.id;
          return (
            <li key={row.id} className={row.status === "new" ? "bg-parchment/60" : "bg-background"}>
              <button
                type="button"
                onClick={() => openRow(row)}
                className="flex w-full flex-wrap items-baseline justify-between gap-3 px-4 py-4 text-left hover:bg-parchment/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-primary">{row.name}</span>
                    <span
                      className={`border px-2 py-0.5 text-[0.65rem] uppercase tracking-widest ${
                        row.status === "new"
                          ? "border-gold text-gold"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {row.email}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </p>
                  {!open && (
                    <p className="mt-2 line-clamp-2 text-sm text-foreground/80">{row.message}</p>
                  )}
                </div>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {fmtDate(row.created_at)}
                </time>
              </button>

              {open && (
                <div className="border-t border-border bg-background px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {row.message}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={`mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent(`Ihre Anfrage an ${SITE.brand}`)}`}
                      className="border border-primary bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90"
                    >
                      Per E-Mail antworten
                    </a>
                    {row.status !== "done" && (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setStatus(row.id, "done")}
                        className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-primary hover:border-primary disabled:opacity-50"
                      >
                        Als erledigt
                      </button>
                    )}
                    {row.status !== "archived" && (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setStatus(row.id, "archived")}
                        className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        Archivieren
                      </button>
                    )}
                    {row.status !== "new" && (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setStatus(row.id, "new")}
                        className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        Wieder als neu
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => handleDelete(row)}
                      className="border border-red-800/40 px-4 py-2 text-xs uppercase tracking-widest text-red-800 hover:border-red-800 disabled:opacity-50"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

