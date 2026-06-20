"use client";

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import Field from "@/components/ui/Field";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
      {off ? (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.1A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.7 2.2-1.9 3.4M6.3 6.3C3.9 7.7 3 9.9 3 12c0 1 4 5 9 5 1 0 2-.2 2.9-.5" />
        </>
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      )}
    </svg>
  );
}

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  error?: string | null;
}

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { label, error, ...props },
  ref
) {
  const [show, setShow] = useState(false);
  return (
    <Field
      ref={ref}
      label={label}
      error={error}
      type={show ? "text" : "password"}
      rightSlot={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-content-faint transition-colors hover:text-white"
        >
          <EyeIcon off={show} />
        </button>
      }
      {...props}
    />
  );
});

export default PasswordField;
