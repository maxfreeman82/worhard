"use client";

import { clsx } from "clsx";
import { Check, ChevronRight, X } from "lucide-react";
import { Dialog as RDialog, DropdownMenu, Popover as RPopover, Tooltip as RTooltip } from "radix-ui";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ Menu */

const menuPanel =
  "z-50 min-w-[220px] max-w-[320px] overflow-hidden rounded-md bg-bg p-1 text-sm text-fg shadow-pop";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ children, align = "start" }: { children: ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} sideOffset={4} className={menuPanel}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

const itemClass =
  "flex h-7 cursor-default select-none items-center gap-2 rounded-sm px-2 outline-none " +
  "data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export function MenuItem({
  icon,
  shortcut,
  danger,
  children,
  ...rest
}: DropdownMenu.DropdownMenuItemProps & { icon?: ReactNode; shortcut?: string; danger?: boolean }) {
  return (
    <DropdownMenu.Item className={clsx(itemClass, danger && "text-danger")} {...rest}>
      {icon && <span className={clsx("flex size-4 items-center justify-center", !danger && "text-muted")}>{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <kbd className="font-sans text-xs text-muted">{shortcut}</kbd>}
    </DropdownMenu.Item>
  );
}

export function MenuCheckItem({
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.CheckboxItem checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={itemClass}>
      <span className="flex-1 truncate">{children}</span>
      <DropdownMenu.ItemIndicator>
        <Check aria-hidden className="size-4" />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuSub({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={clsx(itemClass, "data-[state=open]:bg-surface-hover")}>
        {icon && <span className="flex size-4 items-center justify-center text-muted">{icon}</span>}
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight aria-hidden className="size-4 text-muted" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={6} className={menuPanel}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2 pb-1 pt-2 text-xs font-medium text-muted">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}

/* --------------------------------------------------------------- Popover */

export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;
export const PopoverAnchor = RPopover.Anchor;

export function PopoverContent({
  children,
  className,
  ...rest
}: RPopover.PopoverContentProps) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        sideOffset={4}
        align="start"
        className={clsx("z-50 rounded-md bg-bg text-sm text-fg shadow-pop outline-none", className)}
        {...rest}
      >
        {children}
      </RPopover.Content>
    </RPopover.Portal>
  );
}

/* ----------------------------------------------------------------- Modal */

export const Modal = RDialog.Root;
export const ModalTrigger = RDialog.Trigger;
export const ModalClose = RDialog.Close;

export function ModalContent({
  title,
  description,
  size = "md",
  children,
  hideTitle = false,
}: {
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  hideTitle?: boolean;
}) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className="fixed inset-0 z-50 bg-[rgb(15_15_15/0.6)]" />
      <RDialog.Content
        className={clsx(
          "fixed left-1/2 top-[12vh] z-50 max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-auto",
          "rounded-xl bg-bg text-fg shadow-modal outline-none",
          size === "sm" && "max-w-[400px]",
          size === "md" && "max-w-[560px]",
          size === "lg" && "max-w-[860px]",
        )}
      >
        <div className={clsx("flex items-start justify-between gap-4 px-5 pt-4", hideTitle && "sr-only")}>
          <div>
            <RDialog.Title className="text-base font-semibold">{title}</RDialog.Title>
            {description && <RDialog.Description className="mt-0.5 text-sm text-muted">{description}</RDialog.Description>}
          </div>
          <RDialog.Close
            aria-label="Fermer"
            className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-surface-hover hover:text-fg"
          >
            <X aria-hidden className="size-4" />
          </RDialog.Close>
        </div>
        {!description && hideTitle && <RDialog.Description className="sr-only">{title}</RDialog.Description>}
        <div className="px-5 pb-5 pt-3">{children}</div>
      </RDialog.Content>
    </RDialog.Portal>
  );
}

/* --------------------------------------------------------------- Tooltip */

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={500}>{children}</RTooltip.Provider>;
}

export function Tooltip({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactNode }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          sideOffset={6}
          className="z-50 rounded-sm bg-fg px-2 py-1 text-xs font-medium text-bg shadow-pop"
        >
          {label}
          {shortcut && <span className="ml-2 opacity-70">{shortcut}</span>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
