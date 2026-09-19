import clsx from "clsx";

/**
 * Marca DataPulse: três barras ascendentes com um traço de pulso que termina
 * em um ponto. Gradiente do azul claro ao azul principal.
 */
export function LogoMark({
  size = 28,
  className,
  mono,
}: {
  size?: number;
  className?: string;
  /** Usa currentColor (versão monocromática). */
  mono?: boolean;
}) {
  const id = "dp-logo-grad";
  const fill = mono ? "currentColor" : `url(#${id})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      {!mono && (
        <defs>
          <linearGradient id={id} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" />
            <stop offset="1" stopColor="#60A5FA" />
          </linearGradient>
        </defs>
      )}
      <rect x="4" y="15" width="6" height="10" rx="2" fill={fill} />
      <rect x="13" y="9" width="6" height="16" rx="2" fill={fill} />
      <rect x="22" y="3" width="6" height="22" rx="2" fill={fill} />
      <path
        d="M3 29 L14 22 L21 26 L29 19"
        stroke={mono ? "currentColor" : "#0F172A"}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={mono ? 0.55 : 1}
      />
      <circle cx="29" cy="19" r="2.3" fill={mono ? "currentColor" : "#0F172A"} />
    </svg>
  );
}

export function Logo({
  size = 28,
  showTagline,
  onDark,
  className,
}: {
  size?: number;
  showTagline?: boolean;
  /** Wordmark claro para fundos navy. */
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span
          className={clsx(
            "font-bold tracking-tight",
            onDark ? "text-white" : "text-navy",
          )}
          style={{ fontSize: size * 0.62 }}
        >
          Data<span className={onDark ? "text-brand-light" : "text-accent"}>Pulse</span>
        </span>
        {showTagline && (
          <span
            className={clsx("mt-1 text-xs", onDark ? "text-slate-300" : "text-ink-soft")}
          >
            Inteligência para projetos em movimento
          </span>
        )}
      </span>
    </span>
  );
}
