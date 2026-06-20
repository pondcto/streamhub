"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "gradient" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-0 " +
  "disabled:opacity-50 disabled:pointer-events-none select-none active:scale-[0.97]";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover hover:shadow-glow-accent",
  gradient: "bg-accent-gradient text-white hover:shadow-glow-accent hover:brightness-105",
  secondary: "border border-white/10 bg-white/5 text-content-muted hover:bg-white/10 hover:text-white",
  ghost: "text-content-muted hover:bg-white/5 hover:text-white",
  danger: "border border-danger/30 text-danger-soft hover:bg-danger/10 hover:text-danger-soft",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  icon: "h-9 w-9",
};

/** Class string for the button look — apply to <a>/<Link> when you need link semantics. */
export function buttonVariants({
  variant = "primary",
  size = "md",
}: { variant?: Variant; size?: Size } = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size]);
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, leftIcon, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
    </button>
  );
});

export default Button;
