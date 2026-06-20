"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string | null;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  containerClassName?: string;
}

const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, leftIcon, rightSlot, className, containerClassName, id, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cn("block", containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-faint">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          className={cn(
            "w-full rounded-lg border bg-surface-overlay/60 py-2.5 text-sm text-white placeholder:text-content-faint transition-all duration-200 focus:outline-none focus:ring-2",
            leftIcon ? "pl-10" : "pl-3.5",
            rightSlot ? "pr-10" : "pr-3.5",
            error
              ? "border-danger/50 focus:border-danger/60 focus:ring-danger/25"
              : "border-white/10 focus:border-accent/50 focus:ring-accent/25",
            className
          )}
          {...props}
        />
        {rightSlot && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger-soft">{error}</p>}
    </div>
  );
});

export default Field;
