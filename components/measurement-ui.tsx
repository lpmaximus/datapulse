"use client";

import clsx from "clsx";
import { useFormStatus } from "react-dom";
import {
  MEASUREMENT_STATUS_LABEL,
  PAYMENT_STATE_LABEL,
  type MeasurementStatus,
  type PaymentState,
} from "@/lib/measurements";

const STATUS_CLASS: Record<MeasurementStatus, string> = {
  DRAFT: "border-line bg-canvas text-ink-soft",
  SENT: "border-purple-200 bg-purple-50 text-purple-700",
  APPROVED: "border-green-200 bg-green-50 text-green-700",
  SUPERSEDED: "border-line bg-canvas text-ink-faint line-through",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
};

export function MeasurementStatusChip({ status }: { status: MeasurementStatus }) {
  return (
    <span className={clsx("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CLASS[status])}>
      {MEASUREMENT_STATUS_LABEL[status]}
    </span>
  );
}

const PAY_CLASS: Record<PaymentState, string> = {
  NOT_DUE: "text-ink-faint",
  OPEN: "text-orange-700",
  PARTIAL: "text-yellow-700",
  PAID: "text-green-700",
};

export function PaymentStateText({ state }: { state: PaymentState }) {
  return <span className={clsx("text-xs font-medium", PAY_CLASS[state])}>{PAYMENT_STATE_LABEL[state]}</span>;
}

/** Botão de envio com confirmação do navegador (ações que mudam a situação do BM). */
export function ConfirmSubmit({
  children,
  confirm,
  variant = "outline",
}: {
  children: React.ReactNode;
  confirm?: string;
  variant?: "primary" | "outline" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:bg-accent-strong",
        variant === "outline" && "border border-line text-ink hover:bg-canvas",
        variant === "danger" && "border border-red-200 text-red-700 hover:bg-red-50",
      )}
    >
      {pending ? "..." : children}
    </button>
  );
}
