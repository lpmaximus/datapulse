"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import clsx from "clsx";
import { inputClass } from "@/components/ui";

/**
 * Campo de senha com botão para mostrar/ocultar o texto digitado — só de
 * uso do próprio navegador, nada é enviado nem logado em texto claro.
 */
export function PasswordInput({
  name,
  autoComplete,
  required = true,
  autoFocus = false,
  className,
}: {
  name: string;
  autoComplete?: string;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className={clsx(inputClass, "pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-faint hover:text-ink"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
