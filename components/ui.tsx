import clsx from "clsx";
import { BAND_LABEL, driBand } from "@/lib/dri";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-line bg-surface p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-medium uppercase tracking-wider text-ink-soft">
        {children}
      </h2>
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </div>
  );
}

const BAND_CLASS: Record<string, string> = {
  low: "border-green-200 bg-green-50 text-green-700",
  watch: "border-yellow-200 bg-yellow-50 text-yellow-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

export function DRIBadge({
  score,
  showLabel = true,
}: {
  score: number;
  showLabel?: boolean;
}) {
  const band = driBand(score);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm font-semibold tabular-nums",
        BAND_CLASS[band],
      )}
    >
      {score.toFixed(1)}
      {showLabel ? (
        <span className="text-xs font-normal opacity-80">
          {BAND_LABEL[band]}
        </span>
      ) : null}
    </span>
  );
}

export function Bar({ value }: { value: number }) {
  const band = driBand(value);
  const color = {
    low: "bg-green-500",
    watch: "bg-yellow-500",
    high: "bg-orange-500",
    critical: "bg-red-500",
  }[band];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className={clsx("h-full rounded-full", color)}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
}) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-accent text-white hover:bg-accent-strong",
        variant === "outline" &&
          "border border-line text-ink hover:bg-canvas",
        variant === "ghost" && "text-ink-soft hover:bg-canvas",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {hint ? <span className="block text-xs text-ink-faint">{hint}</span> : null}
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-faint">
      {children}
    </p>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "accent"
          ? "border-accent-soft bg-accent-soft/50 text-accent-strong"
          : "border-line text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}

const CRITICALITY_STYLE: Record<string, string> = {
  LOW: "bg-pr-low",
  MEDIUM: "bg-pr-medium",
  HIGH: "bg-pr-high",
  CRITICAL: "bg-pr-critical",
};

const CRITICALITY_LABEL: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export function CriticalityChip({ value }: { value: string }) {
  return (
    <span
      className={clsx(
        "inline-flex min-w-[76px] items-center justify-center px-2 py-1 text-xs font-medium text-white",
        CRITICALITY_STYLE[value] ?? CRITICALITY_STYLE.MEDIUM,
      )}
    >
      {CRITICALITY_LABEL[value] ?? value}
    </span>
  );
}
