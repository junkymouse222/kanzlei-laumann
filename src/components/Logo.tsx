// Zentrale Marken-Komponente der Kanzlei Laumann (Monogramm + Wortmarke).
// Vektorbasiert, damit sie überall gestochen scharf skaliert (Web, Print, PDF).

type MarkProps = {
  className?: string;
  navy?: string;
  gold?: string;
  frame?: string;
};

export function LogoMark({
  className = "",
  navy = "#1e2c3f",
  gold = "#a3813d",
  frame = "#cbd0d6",
}: MarkProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Erik Laumann"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="94" height="94" fill="none" stroke={navy} strokeWidth="2.5" />
      <rect x="9.5" y="9.5" width="81" height="81" fill="none" stroke={frame} strokeWidth="1" />
      <text
        x="50"
        y="49"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="38"
        fontWeight={500}
        letterSpacing="1.5"
        fill={navy}
      >
        EL
      </text>
      <rect x="41" y="70" width="18" height="3.5" fill={gold} />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /** Für dunkle Hintergründe (Footer): helle Farbgebung. */
  inverse?: boolean;
  /** Untertitel „Rechtsanwaltskanzlei“ ausblenden (z. B. sehr enge Kontexte). */
  hideSubline?: boolean;
};

export function Logo({ className = "", inverse = false, hideSubline = false }: LogoProps) {
  const name = inverse ? "#f3efe6" : "#1e2c3f";
  const sub = inverse ? "rgba(243,239,230,0.72)" : "#7c8894";
  const frame = inverse ? "rgba(243,239,230,0.4)" : "#cbd0d6";
  const gold = "#a3813d";

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark className="h-11 w-11 shrink-0" navy={name} gold={gold} frame={frame} />
      <span className="flex flex-col justify-center leading-none">
        <span
          className="text-[1.02rem] font-semibold uppercase tracking-[0.2em] md:text-[1.12rem]"
          style={{ color: name }}
        >
          Erik Laumann
        </span>
        {!hideSubline && (
          <span
            className="mt-1.5 text-[0.56rem] uppercase tracking-[0.32em]"
            style={{ color: sub }}
          >
            Rechtsanwaltskanzlei
          </span>
        )}
      </span>
    </span>
  );
}
