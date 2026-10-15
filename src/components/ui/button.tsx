import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-bg text-fg border border-border-strong hover:bg-surface-hover",
  ghost: "bg-transparent text-fg hover:bg-surface-hover active:bg-surface-active",
  danger: "bg-bg text-danger border border-border-strong hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2 text-sm gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
  lg: "h-10 px-4 text-base gap-2",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm font-medium",
        "transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md";
};

/** Bouton carré sans texte (barres d'outils, sidebar). Le libellé sert aux lecteurs d'écran et à l'info-bulle. */
export function IconButton({ label, size = "md", className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-sm text-muted",
        "transition-colors duration-100 hover:bg-surface-hover hover:text-fg active:bg-surface-active",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "size-6" : "size-7",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
