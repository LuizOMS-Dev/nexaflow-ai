"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Menu Context ─── */

type MenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  close: () => void;
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  registerItem: (id: string, disabled?: boolean) => void;
  unregisterItem: (id: string) => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext() {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    throw new Error("MenuItem must be used within a Menu / DropdownMenu component.");
  }
  return ctx;
}

/* ─── Position Calculator with Viewport Collision Detection ─── */

type MenuPosition = {
  top: number;
  left: number;
  width?: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
  placement: "bottom" | "top";
  align: "left" | "right" | "center";
};

const GAP = 6;
const VIEWPORT_PADDING = 8;
const DEFAULT_MIN_WIDTH = 200;
const DEFAULT_MAX_WIDTH = 320;
const DEFAULT_MAX_HEIGHT = 380;

function computePosition(
  triggerRect: DOMRect,
  panelRect: DOMRect | null,
  align: "left" | "right" | "center" = "right",
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidth = DEFAULT_MAX_WIDTH,
  matchTriggerWidth = false,
  preferredPlacement: "auto" | "top" | "bottom" = "auto"
): MenuPosition {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const availableWidth = Math.max(0, vw - VIEWPORT_PADDING * 2);

  const panelW = matchTriggerWidth
    ? Math.min(triggerRect.width, availableWidth)
    : Math.max(minWidth, Math.min(maxWidth, panelRect?.width || minWidth));
  const panelH = panelRect?.height || 220;

  const spaceBelow = vh - triggerRect.bottom - GAP - VIEWPORT_PADDING;
  const spaceAbove = triggerRect.top - GAP - VIEWPORT_PADDING;
  const usefulPanelHeight = Math.min(panelH, 160);
  const preferBottom =
    preferredPlacement === "top"
      ? !(spaceAbove >= usefulPanelHeight || spaceAbove >= spaceBelow)
      : preferredPlacement === "bottom"
        ? spaceBelow >= usefulPanelHeight || spaceBelow >= spaceAbove
        : spaceBelow >= usefulPanelHeight || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(
    140,
    Math.min(DEFAULT_MAX_HEIGHT, preferBottom ? spaceBelow : spaceAbove)
  );

  let left: number;
  if (align === "right") {
    left = triggerRect.right - panelW;
  } else if (align === "center") {
    left = triggerRect.left + (triggerRect.width - panelW) / 2;
  } else {
    left = triggerRect.left;
  }

  // Clamping within viewport
  if (left + panelW > vw - VIEWPORT_PADDING) {
    left = Math.max(VIEWPORT_PADDING, vw - panelW - VIEWPORT_PADDING);
  }
  if (left < VIEWPORT_PADDING) {
    left = VIEWPORT_PADDING;
  }

  const top = preferBottom
    ? triggerRect.bottom + GAP
    : Math.max(VIEWPORT_PADDING, triggerRect.top - GAP - Math.min(panelH, maxHeight));

  return {
    top,
    left,
    width: matchTriggerWidth ? panelW : undefined,
    minWidth: matchTriggerWidth ? panelW : minWidth,
    maxWidth: matchTriggerWidth ? panelW : maxWidth,
    maxHeight,
    placement: preferBottom ? "bottom" : "top",
    align,
  };
}

/* ─── DropdownMenu / Menu Primitives ─── */

export type MenuProps = {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right" | "center";
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Menu({
  trigger,
  children,
  align = "right",
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidth = DEFAULT_MAX_WIDTH,
  className,
  triggerClassName,
  disabled = false,
  onOpenChange,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemsRef = useRef<Array<{ id: string; disabled?: boolean }>>([]);

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const handleSetOpen = useCallback(
    (nextOpen: boolean) => {
      if (disabled && nextOpen) return;
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        setFocusedIndex(-1);
      }
    },
    [disabled, onOpenChange]
  );

  const close = useCallback(() => handleSetOpen(false), [handleSetOpen]);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const triggerRect = triggerEl.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect() || null;
    const calculated = computePosition(triggerRect, panelRect, align, minWidth, maxWidth);
    setPos(calculated);
  }, [align, minWidth, maxWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    const animId = window.requestAnimationFrame(() => updatePosition());
    const onResizeOrScroll = () => updatePosition();
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [open, updatePosition]);

  // Click outside & Escape handling
  useEffect(() => {
    if (!open) return;
    function onDocumentClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    }
    function onDocumentKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        // Return focus to trigger
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onDocumentKey);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onDocumentKey);
    };
  }, [open, close]);

  const registerItem = useCallback((id: string, itemDisabled?: boolean) => {
    itemsRef.current = [...itemsRef.current.filter((i) => i.id !== id), { id, disabled: itemDisabled }];
  }, []);

  const unregisterItem = useCallback((id: string) => {
    itemsRef.current = itemsRef.current.filter((i) => i.id !== id);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        handleSetOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    const availableItems = itemsRef.current.filter((i) => !i.disabled);
    if (availableItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % availableItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + availableItems.length) % availableItems.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIndex(availableItems.length - 1);
    } else if (e.key === "Tab") {
      close();
    }
  };

  const contextValue = useMemo<MenuContextValue>(
    () => ({
      open,
      setOpen: handleSetOpen,
      close,
      focusedIndex,
      setFocusedIndex,
      registerItem,
      unregisterItem,
    }),
    [open, handleSetOpen, close, focusedIndex, registerItem, unregisterItem]
  );

  const renderedPortal =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-orientation="vertical"
            tabIndex={-1}
            className={cn(
              "fixed z-[var(--z-popover)] flex flex-col overflow-y-auto rounded-2xl",
              "border border-black/[0.08] bg-white p-1.5 text-ink shadow-2xl shadow-black/15",
              "dark:border-white/[0.09] dark:bg-[#12141c] dark:text-zinc-200 dark:shadow-black/70",
              "backdrop-blur-md transition-all duration-150 ease-out",
              "animate-in fade-in-0 zoom-in-95",
              className
            )}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              minWidth: pos?.minWidth ?? minWidth,
              maxWidth: pos?.maxWidth ?? maxWidth,
              maxHeight: pos?.maxHeight ?? DEFAULT_MAX_HEIGHT,
              visibility: pos ? "visible" : "hidden",
            }}
          >
            {children}
          </div>,
          document.body
        )
      : null;

  return (
    <MenuContext.Provider value={contextValue}>
      <div className={cn("relative inline-flex", triggerClassName)}>
        <div
          ref={triggerRef}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-disabled={disabled}
          onClick={() => handleSetOpen(!open)}
          onKeyDown={handleKeyDown}
          className={cn(disabled && "cursor-not-allowed opacity-50")}
        >
          {trigger}
        </div>
        {renderedPortal}
      </div>
    </MenuContext.Provider>
  );
}

export const DropdownMenu = Menu;
export const Dropdown = Menu;

/* ─── MenuItem ─── */

export type MenuItemProps = {
  children: ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  shortcut?: string;
  trailing?: ReactNode;
  className?: string;
};

export function MenuItem({
  children,
  icon: Icon,
  onClick,
  danger = false,
  disabled = false,
  active = false,
  shortcut,
  trailing,
  className,
}: MenuItemProps) {
  const id = useId();
  const { close, registerItem, unregisterItem } = useMenuContext();

  useEffect(() => {
    registerItem(id, disabled);
    return () => unregisterItem(id);
  }, [id, disabled, registerItem, unregisterItem]);

  const handleClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    onClick?.(e);
    close();
  };

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40",
        danger
          ? "text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-300"
          : active
            ? "bg-violet-500/[0.08] text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 font-semibold"
            : "text-ink-secondary hover:bg-violet-500/[0.06] hover:text-ink dark:text-zinc-300 dark:hover:bg-violet-500/[0.12] dark:hover:text-white",
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors duration-150",
            danger
              ? "text-red-500 dark:text-red-400"
              : active
                ? "text-violet-600 dark:text-violet-400"
                : "text-ink-muted group-hover:text-violet-600 dark:text-zinc-400 dark:group-hover:text-violet-300"
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      ) : null}

      <span className="min-w-0 flex-1 truncate">{children}</span>

      {shortcut ? (
        <span className="shrink-0 text-[10px] font-mono text-ink-faint dark:text-zinc-500 uppercase">
          {shortcut}
        </span>
      ) : null}

      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </button>
  );
}

export const DropdownItem = MenuItem;

/* ─── MenuSeparator ─── */

export function MenuSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={cn("my-1 h-px bg-black/[0.06] dark:bg-white/[0.06]", className)}
    />
  );
}

/* ─── MenuGroup & MenuLabel ─── */

export function MenuGroup({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="group" className={cn("space-y-0.5", className)}>
      {label ? (
        <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted dark:text-zinc-400">
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function MenuLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted dark:text-zinc-400",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ─── ActionMenu (Atalho para menus de 3 pontinhos) ─── */

export type ActionMenuItem = {
  id?: string;
  label: ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
};

export function ActionMenu({
  items,
  trigger,
  align = "right",
  minWidth = 200,
  className,
  buttonClassName,
  "aria-label": ariaLabel = "Ações",
}: {
  items: ActionMenuItem[];
  trigger?: ReactNode;
  align?: "left" | "right" | "center";
  minWidth?: number;
  className?: string;
  buttonClassName?: string;
  "aria-label"?: string;
}) {
  const defaultTrigger = (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-ink-muted transition-colors hover:border-black/[0.06] hover:bg-black/[0.03] hover:text-ink dark:text-zinc-400 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.05] dark:hover:text-zinc-100",
        buttonClassName
      )}
    >
      <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );

  return (
    <Menu
      trigger={trigger || defaultTrigger}
      align={align}
      minWidth={minWidth}
      className={className}
    >
      {items.map((item, idx) => (
        <div key={item.id || `item-${idx}`}>
          {item.separatorBefore && <MenuSeparator />}
          <MenuItem
            icon={item.icon}
            onClick={item.onClick}
            danger={item.danger}
            disabled={item.disabled}
            active={item.active}
            shortcut={item.shortcut}
          >
            {item.label}
          </MenuItem>
        </div>
      ))}
    </Menu>
  );
}

/* ─── Popover Primitive ─── */

export type PopoverProps = {
  trigger: ReactNode;
  children: ReactNode | ((helpers: { close: () => void }) => ReactNode);
  align?: "left" | "right" | "center";
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  matchTriggerWidth?: boolean;
  preferredPlacement?: "auto" | "top" | "bottom";
  triggerIsInteractive?: boolean;
};

export function Popover({
  trigger,
  children,
  align = "right",
  minWidth = 240,
  maxWidth = 360,
  className,
  triggerClassName,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  matchTriggerWidth = false,
  preferredPlacement = "auto",
  triggerIsInteractive = false,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<MenuPosition | null>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const handleSetOpen = useCallback(
    (nextOpen: boolean) => {
      if (disabled && nextOpen) return;
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [disabled, isControlled, onOpenChange]
  );

  const close = useCallback(() => handleSetOpen(false), [handleSetOpen]);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const triggerRect = triggerEl.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect() || null;
    const calculated = computePosition(
      triggerRect,
      panelRect,
      align,
      minWidth,
      maxWidth,
      matchTriggerWidth,
      preferredPlacement
    );
    setPos(calculated);
  }, [align, matchTriggerWidth, maxWidth, minWidth, preferredPlacement]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    const animId = window.requestAnimationFrame(() => updatePosition());
    const onResizeOrScroll = () => updatePosition();
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    }
    function onDocumentKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onDocumentKey);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onDocumentKey);
    };
  }, [open, close]);

  const content = typeof children === "function" ? children({ close }) : children;
  const nativeInteractiveTrigger =
    triggerIsInteractive &&
    isValidElement(trigger) &&
    typeof trigger.type === "string" &&
    ["button", "a", "input", "select", "textarea"].includes(trigger.type);
  const accessibleTrigger = nativeInteractiveTrigger
    ? cloneElement(
        trigger as ReactElement<{
          "aria-haspopup"?: "dialog";
          "aria-expanded"?: boolean;
          "aria-disabled"?: boolean;
        }>,
        {
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-disabled": disabled || undefined,
        }
      )
    : trigger;

  const renderedPortal =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            tabIndex={-1}
            className={cn(
              "fixed z-[var(--z-popover)] flex flex-col overflow-y-auto rounded-2xl",
              "border border-black/[0.08] bg-white p-3 text-ink shadow-2xl shadow-black/15",
              "dark:border-white/[0.09] dark:bg-[#12141c] dark:text-zinc-200 dark:shadow-black/70",
              "backdrop-blur-md transition-all duration-150 ease-out",
              "animate-in fade-in-0 zoom-in-95",
              className
            )}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: pos?.width,
              minWidth: pos?.minWidth ?? minWidth,
              maxWidth: pos?.maxWidth ?? maxWidth,
              maxHeight: pos?.maxHeight ?? DEFAULT_MAX_HEIGHT,
              visibility: pos ? "visible" : "hidden",
            }}
          >
            {content}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={cn("relative inline-flex", triggerClassName)}>
      <div
        ref={triggerRef}
        role={nativeInteractiveTrigger ? undefined : "button"}
        tabIndex={nativeInteractiveTrigger || disabled ? -1 : 0}
        aria-haspopup={nativeInteractiveTrigger ? undefined : "dialog"}
        aria-expanded={nativeInteractiveTrigger ? undefined : open}
        aria-disabled={nativeInteractiveTrigger ? undefined : disabled}
        onClick={() => handleSetOpen(!open)}
        onKeyDown={(event) => {
          if (nativeInteractiveTrigger || disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSetOpen(!open);
          }
        }}
        className={cn(
          matchTriggerWidth && "w-full min-w-0",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {accessibleTrigger}
      </div>
      {renderedPortal}
    </div>
  );
}
