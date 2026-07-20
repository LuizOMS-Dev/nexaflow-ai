"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** Linha secundária (ex.: telefone, e-mail) */
  description?: string;
  /** Avatar / ícone à esquerda (contato rico) */
  leading?: ReactNode;
  disabled?: boolean;
};

export type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** classes extras no botão trigger */
  triggerClassName?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  error?: boolean;
  required?: boolean;
  size?: "sm" | "md";
  /**
   * Largura mínima do menu (px).
   * O menu NÃO fica preso à largura do trigger — usa max(trigger, min, conteúdo).
   */
  menuMinWidth?: number;
};

type MenuPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "bottom" | "top";
};

const MENU_MAX = 280;
const GAP = 6;
/** Teto do menu (textos longos excepcionais usam ellipsis só após isso) */
const MENU_MAX_WIDTH = 360;

/**
 * Largura do painel aberto: independente do trigger compacto.
 * min ≥ 180/200, cresce com o texto das opções, não ultrapassa a viewport.
 */
function computeMenuWidth(params: {
  triggerWidth: number;
  options: SelectOption[];
  menuMinWidth?: number;
  size: "sm" | "md";
  viewportWidth: number;
}): number {
  const floor =
    params.menuMinWidth ?? (params.size === "sm" ? 180 : 200);
  let longest = 8;
  for (const o of params.options) {
    const labelLen = (o.label || "").length;
    const descLen = o.description ? Math.min(o.description.length, 32) : 0;
    longest = Math.max(longest, labelLen, descLen);
  }
  // ~7.2px/char (sm) / 7.6 (md) + check (14) + gaps/padding (~42)
  const charPx = params.size === "sm" ? 7.1 : 7.6;
  const content = Math.ceil(longest * charPx + 56);
  const max = Math.max(140, Math.min(MENU_MAX_WIDTH, params.viewportWidth - 16));
  return Math.min(max, Math.max(params.triggerWidth, floor, content));
}

/**
 * Select NexaFlow — substitui &lt;select&gt; nativo.
 * Portal no body (sem clipping). Valores e onChange idênticos ao nativo.
 * Trigger compacto; menu com largura própria para texto completo.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Selecione…",
  disabled,
  className,
  triggerClassName,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  error,
  required,
  size = "md",
  menuMinWidth,
}: SelectProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const refinedWidthRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const enabledIndexes = useMemo(
    () => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0),
    [options]
  );

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = computeMenuWidth({
      triggerWidth: r.width,
      options,
      menuMinWidth,
      size,
      viewportWidth: vw,
    });
    const spaceBelow = vh - r.bottom - GAP - 8;
    const spaceAbove = r.top - GAP - 8;
    const preferBottom = spaceBelow >= Math.min(MENU_MAX, 160) || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(MENU_MAX, preferBottom ? spaceBelow : spaceAbove);
    const heightEstimate = Math.min(maxHeight, options.length * 36 + 8);
    // align start com o trigger; se estourar a direita, empurra para dentro da viewport
    let left = r.left;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    if (left < 8) left = 8;

    if (preferBottom) {
      setPos({
        top: r.bottom + GAP,
        left,
        width,
        maxHeight: Math.max(120, maxHeight),
        placement: "bottom",
      });
    } else {
      setPos({
        top: Math.max(8, r.top - GAP - heightEstimate),
        left,
        width,
        maxHeight: Math.max(120, maxHeight),
        placement: "top",
      });
    }
  }, [menuMinWidth, options, size]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      refinedWidthRef.current = false;
      return;
    }
    updatePosition();
    const onWin = () => {
      refinedWidthRef.current = false;
      updatePosition();
    };
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, updatePosition]);

  // Após montar o menu: se o conteúdo real for maior que a estimativa, expande (1x)
  useLayoutEffect(() => {
    if (!open || !pos || !listRef.current || refinedWidthRef.current) return;
    const scroll = listRef.current.querySelector(".nf-select-menu-scroll") as HTMLElement | null;
    const needed = Math.ceil(
      Math.max(listRef.current.scrollWidth, scroll?.scrollWidth || 0) + 2
    );
    if (needed <= pos.width + 1) {
      refinedWidthRef.current = true;
      return;
    }
    const vw = window.innerWidth;
    const width = Math.min(MENU_MAX_WIDTH, vw - 16, needed);
    let left = pos.left;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    refinedWidthRef.current = true;
    setPos((p) => (p ? { ...p, width, left } : p));
  }, [open, pos, options]);

  // Highlight inicial + close on outside click — só quando o menu abre
  // (não reexecutar a cada mudança de `value` do formulário pai).
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value && !o.disabled);
    setHighlight(idx >= 0 ? idx : enabledIndexes[0] ?? -1);

    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value/options só na abertura
  }, [open]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(dir: 1 | -1) {
    if (!enabledIndexes.length) return;
    const curPos = enabledIndexes.indexOf(highlight);
    let nextPos: number;
    if (curPos < 0) nextPos = dir === 1 ? 0 : enabledIndexes.length - 1;
    else nextPos = (curPos + dir + enabledIndexes.length) % enabledIndexes.length;
    setHighlight(enabledIndexes[nextPos]);
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (e.key === "ArrowDown") moveHighlight(1);
      if (e.key === "ArrowUp") moveHighlight(-1);
      if (e.key === "Enter" || e.key === " ") {
        if (highlight >= 0 && options[highlight] && !options[highlight].disabled) {
          commit(options[highlight].value);
        }
      }
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
    if (e.key === "Home" && open) {
      e.preventDefault();
      if (enabledIndexes.length) setHighlight(enabledIndexes[0]);
    }
    if (e.key === "End" && open) {
      e.preventDefault();
      if (enabledIndexes.length) setHighlight(enabledIndexes[enabledIndexes.length - 1]);
    }
  }

  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      if (enabledIndexes.length) setHighlight(enabledIndexes[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      if (enabledIndexes.length) setHighlight(enabledIndexes[enabledIndexes.length - 1]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (highlight >= 0 && options[highlight] && !options[highlight].disabled) {
        commit(options[highlight].value);
      }
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  // Valor presente na lista (inclui value="" com label, ex.: "Todos")
  const displayLabel = selected?.label ?? (value && !selected ? value : null);
  const isPlaceholder = displayLabel == null || displayLabel === "";

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              highlight >= 0 ? `${listId}-opt-${highlight}` : undefined
            }
            className={cn(
              "nf-select-menu",
              pos.placement === "top" ? "nf-select-menu--top" : "nf-select-menu--bottom"
            )}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              minWidth: pos.width,
              maxWidth: `min(${MENU_MAX_WIDTH}px, calc(100vw - 16px))`,
              maxHeight: pos.maxHeight,
              zIndex: "var(--z-popover)",
            }}
            onKeyDown={onListKey}
          >
            <div className="nf-select-menu-scroll">
              {options.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-ink-faint">Nenhuma opção</div>
              ) : (
                options.map((opt, i) => {
                  const isSelected = opt.value === value;
                  const isActive = i === highlight;
                  return (
                    <div
                      key={`${opt.value}-${i}`}
                      id={`${listId}-opt-${i}`}
                      role="option"
                      data-idx={i}
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled || undefined}
                      className={cn(
                        "nf-select-option",
                        isSelected && "is-selected",
                        isActive && "is-active",
                        opt.disabled && "is-disabled"
                      )}
                      onMouseEnter={() => {
                        if (!opt.disabled) setHighlight(i);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (opt.disabled) return;
                        commit(opt.value);
                      }}
                    >
                      <span className="nf-select-option-check" aria-hidden>
                        {isSelected ? <Check className="h-3.5 w-3.5" strokeWidth={2.25} /> : null}
                      </span>
                      {opt.leading ? (
                        <span className="shrink-0 self-center">{opt.leading}</span>
                      ) : null}
                      <span className="nf-select-option-text min-w-0 flex-1">
                        {/* Sem truncate no label — menu tem largura própria */}
                        <span className="block whitespace-nowrap">{opt.label}</span>
                        {opt.description ? (
                          <span className="mt-0.5 block whitespace-nowrap text-[11px] text-ink-faint">
                            {opt.description}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  const selectedDesc = selected?.description;
  const selectedLeading = selected?.leading;
  const richTrigger =
    !isPlaceholder && Boolean(selectedDesc || selectedLeading);

  return (
    <div className={cn("nf-select w-full", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        aria-invalid={error || undefined}
        className={cn(
          "nf-select-trigger",
          size === "sm" && "nf-select-trigger--sm",
          open && "is-open",
          error && "is-error",
          disabled && "is-disabled",
          isPlaceholder && "is-placeholder",
          richTrigger && "nf-select-trigger--multi",
          triggerClassName
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKey}
      >
        {selectedLeading && !isPlaceholder ? (
          <span className="shrink-0 self-center">{selectedLeading}</span>
        ) : null}
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate">
            {isPlaceholder ? placeholder : displayLabel}
          </span>
          {selectedDesc && !isPlaceholder ? (
            <span className="mt-0.5 block truncate text-[11px] font-normal text-ink-faint">
              {selectedDesc}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn("nf-select-chevron h-3.5 w-3.5 shrink-0", open && "is-open")}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
