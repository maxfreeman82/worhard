"use client";

import { clsx } from "clsx";
import { Check, Search } from "lucide-react";
import { Checkbox as RCheckbox, Switch as RSwitch } from "radix-ui";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
};

export function Input({ label, hint, error, leading, className, id, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <div
        className={clsx(
          "flex h-8 items-center gap-2 rounded-sm border bg-bg px-2 text-sm",
          "focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-focus",
          error ? "border-danger" : "border-border-input",
          rest.disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {leading && <span className="text-muted">{leading}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            "h-full w-full min-w-0 bg-transparent text-fg outline-none placeholder:text-placeholder",
            "focus-visible:outline-none disabled:cursor-not-allowed",
            className,
          )}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SearchInput(props: Omit<InputProps, "leading">) {
  return <Input type="search" leading={<Search aria-hidden className="size-4" />} {...props} />;
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange?: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <RCheckbox.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
        className={clsx(
          "flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors duration-100",
          "border-border-input bg-bg data-[state=checked]:border-accent data-[state=checked]:bg-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <RCheckbox.Indicator>
          <Check aria-hidden className="size-3 text-on-accent" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange?: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <RSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={clsx(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors duration-100",
          "bg-border-input data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <RSwitch.Thumb className="block size-3 translate-x-0.5 rounded-full bg-bg transition-transform duration-100 data-[state=checked]:translate-x-3.5" />
      </RSwitch.Root>
    </div>
  );
}
