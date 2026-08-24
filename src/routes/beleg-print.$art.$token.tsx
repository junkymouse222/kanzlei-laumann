import { createFileRoute, notFound } from "@tanstack/react-router";
import { BelegView, belegPrintStyles, type BelegViewPosition } from "@/components/BelegView";
import { loadBelegByToken } from "@/lib/beleg-print.functions";
import { DEFAULT_MWST_RATE, normalizePercentRate } from "@/lib/offer-totals";

export const Route = createFileRoute("/beleg-print/$art/$token")({
  head: () => ({
    meta: [
      { title: "Beleg" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async ({ params }) => {
    const art = params.art === "angebot" ? "angebot" : params.art === "rechnung" ? "rechnung" : null;
    if (!art) throw notFound();
    return await loadBelegByToken({ data: { art, token: params.token } });
  },
  component: BelegPrintPage,
});

function siteBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function BelegPrintPage() {
  const { offer, items } = Route.useLoaderData();
  const params = Route.useParams();
  const art = params.art === "rechnung" ? "Rechnung" : "Angebot";

  const positionen: BelegViewPosition[] = (items as BelegViewPosition[] | Array<{
    pos: number;
    artikel: string;
    name: string;
    beschreibung: string | null;
    einheit: string;
    einzelpreis: number | string;
    menge: number;
  }>)
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map((it) => ({
      pos: it.pos,
      artikel: it.artikel,
      name: it.name,
      beschreibung: (it as { beschreibung: string | null }).beschreibung ?? "",
      einheit: it.einheit,
      einzelpreis: Number(it.einzelpreis),
      menge: it.menge,
    }));

  const belegNr =
    art === "Rechnung"
      ? offer.rechnung_nr ?? offer.angebot_nr
      : offer.angebot_nr;

  const datumIso =
    art === "Rechnung"
      ? new Date().toISOString().slice(0, 10)
      : offer.created_at.slice(0, 10);

  const gueltigIso =
    art === "Rechnung"
      ? (offer.rechnung_faellig_am ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
      : new Date(new Date(offer.created_at).getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // Kurzlink bevorzugen, damit im PDF/Beleg nur jpeg.ly (nicht die Kanzlei-Domain) erscheint.
  const shortUrl = art === "Angebot" ? offer.accept_short_url : offer.pay_short_url;
  const bestaetigungsUrl =
    shortUrl ||
    (art === "Angebot"
      ? `${siteBase()}/api/public/hooks/accept-offer?token=${encodeURIComponent(offer.accept_token ?? "")}`
      : `${siteBase()}/api/public/hooks/mark-paid?token=${encodeURIComponent(offer.pay_token ?? "")}`);

  const bereitsBestaetigt = art === "Angebot" ? !!offer.accepted_at : !!offer.paid_at;

  const kundeName = offer.customer_company
    ? `${offer.customer_company}\n${offer.customer_name}`
    : offer.customer_name;

  return (
    <>
      <style>{belegPrintStyles}</style>
      <section className="container-prose py-8 print:py-0">
        <BelegView
          belegArt={art}
          belegNr={belegNr}
          datum={datumIso}
          gueltigOderFaellig={gueltigIso}
          kundeName={kundeName}
          kundeAnschrift={offer.customer_address}
          kundeUstId={offer.customer_ust_id ?? undefined}
          lieferName={offer.delivery_name?.trim() || undefined}
          lieferAnschrift={offer.delivery_address?.trim() || undefined}
          positionen={positionen}
          rabattProzent={normalizePercentRate(offer.rabatt_rate, 0)}
          mwstSatz={normalizePercentRate(offer.mwst_rate, DEFAULT_MWST_RATE)}
          lieferkosten={Number(offer.lieferkosten ?? 0)}
          bankInhaber={offer.bank_inhaber ?? ""}
          bankName={offer.bank_name ?? ""}
          bankIban={offer.bank_iban ?? ""}
          bankBic={offer.bank_bic ?? ""}
          bestaetigungsUrl={bestaetigungsUrl}
          bereitsBestaetigt={bereitsBestaetigt}
          ausstellerName={offer.verwalter_name ?? undefined}
          ausstellerRole={offer.verwalter_role ?? undefined}
        />
      </section>
    </>
  );
}
