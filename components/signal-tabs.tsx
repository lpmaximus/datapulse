"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { value: "human", label: "Sinais humanos" },
  { value: "systemic", label: "Sinais sistêmicos" },
];

export function SignalTabs({ current }: { current: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex gap-1 border-b border-line px-4">
      {TABS.map((tab) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("layer", tab.value);
        const active = current === tab.value;
        return (
          <Link
            key={tab.value}
            href={`${pathname}?${params}`}
            className={clsx(
              "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-ink text-ink"
                : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
