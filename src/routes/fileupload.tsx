import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/fileupload")({
  head: () => ({
    meta: [
      { title: `PDF Upload — ${SITE.brand}` },
      { name: "description", content: "Interner PDF-Upload für Angebote." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FileUploadPage,
});

function sanitizeFilename(name: string): string {
  const base = name.replace(/\.pdf$/i, "");
  const clean = base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "dokument";
  return `${clean}.pdf`;
}

function FileUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUploadedUrl(null);

    if (!file) {
      setError("Bitte wählen Sie eine PDF-Datei aus.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Nur PDF-Dateien sind erlaubt.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Die Datei ist zu groß (max. 25 MB).");
      return;
    }

    setUploading(true);
    try {
      let filename = sanitizeFilename(file.name);
      // Try upload; if exists, prepend timestamp.
      let { error: upErr } = await supabase.storage
        .from("angebote")
        .upload(filename, file, { contentType: "application/pdf", upsert: false });

      if (upErr && /exists|duplicate/i.test(upErr.message)) {
        filename = `${Date.now()}-${filename}`;
        const retry = await supabase.storage
          .from("angebote")
          .upload(filename, file, { contentType: "application/pdf", upsert: false });
        upErr = retry.error;
      }

      if (upErr) {
        setError(`Upload fehlgeschlagen: ${upErr.message}`);
        return;
      }

      setUploadedUrl(`/juli/angebote/${filename}`);
      setFile(null);
      (document.getElementById("pdf-input") as HTMLInputElement | null)?.value &&
        ((document.getElementById("pdf-input") as HTMLInputElement).value = "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="container-prose py-20 md:py-28">
      <p className="eyebrow">Intern</p>
      <h1 className="mt-6 text-4xl md:text-5xl">PDF-Upload</h1>
      <span className="rule-gold mt-6" />
      <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
        Laden Sie hier eine PDF-Datei hoch. Nach dem Upload ist das Dokument
        unter <code>/juli/angebote/&lt;dateiname&gt;.pdf</code> abrufbar –
        direkt einsehbar im Browser und herunterladbar.
      </p>

      <form onSubmit={onSubmit} className="mt-10 max-w-xl space-y-6 bg-parchment p-8">
        <div>
          <label
            htmlFor="pdf-input"
            className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            PDF-Datei
          </label>
          <input
            id="pdf-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-sm file:mr-4 file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:uppercase file:tracking-[0.2em] file:text-primary-foreground hover:file:bg-primary/90"
          />
          {file && (
            <p className="mt-2 text-xs text-muted-foreground">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
        </div>

        {error && (
          <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={uploading || !file}
          className="w-full bg-primary px-8 py-4 text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {uploading ? "Wird hochgeladen…" : "PDF hochladen"}
        </button>
      </form>

      {uploadedUrl && (
        <div className="mt-8 max-w-xl border border-gold bg-background p-6 text-sm">
          <p className="font-semibold">Upload erfolgreich.</p>
          <p className="mt-3 text-muted-foreground">Ihr Dokument ist abrufbar unter:</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <a
              href={uploadedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-gold pb-1 text-primary hover:text-gold"
            >
              Ansehen
            </a>
            <a
              href={`${uploadedUrl}?download=1`}
              className="border-b border-gold pb-1 text-primary hover:text-gold"
            >
              Herunterladen
            </a>
          </div>
          <p className="mt-3 break-all text-xs text-muted-foreground">
            {typeof window !== "undefined" ? window.location.origin : ""}
            {uploadedUrl}
          </p>
        </div>
      )}
    </section>
  );
}
