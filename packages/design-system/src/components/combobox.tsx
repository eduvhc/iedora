import * as React from "react";
import { Popover } from "radix-ui";
import { cn } from "../lib/cn";

/**
 * Iedora Manual § VI.4 — Combobox.
 *
 * A single typeahead input. The input itself is the search field —
 * typing filters the list below, the chevron toggles the dropdown, the
 * inline × clears the selection. There is no separate search bar
 * inside the popover.
 *
 * State machine:
 *   - When closed, the input shows the selected option's label (or the
 *     placeholder if nothing is selected).
 *   - On focus / click / ArrowDown / typing, the dropdown opens with
 *     `query` reset to '' so every option shows.
 *   - As the user types, `query` filters by label or hint.
 *   - Picking an option commits the value, closes, and the input
 *     returns to displaying the new label.
 *   - Outside click or Escape closes without changing the value — the
 *     input snaps back to the current label.
 *
 * Built on Radix `Popover.Anchor` (positioning only — open/close is
 * fully controlled here). `onOpenAutoFocus={preventDefault}` keeps
 * focus in the input so keyboard navigation never has to jump.
 */

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary text rendered to the right of the label (e.g. slug, id). */
  hint?: string;
};

export type ComboboxProps = {
  options: ReadonlyArray<ComboboxOption>;
  value: string | null;
  onChange: (next: string | null) => void;
  /** Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** Empty-result message. */
  emptyMessage?: string;
  /** Show an inline × in the input chrome when something is selected. */
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  /** When set, a hidden input is rendered so the combobox can be part of
   * a plain `<form>` submission. */
  name?: string;
  className?: string;
  /** Additional className for the popover content (rarely needed). */
  popoverClassName?: string;
  /** Forwarded to the input — used by Playwright `getByTestId`. */
  "data-test-id"?: string;
  /** Forwarded to the input — pairs with a `<FieldLabel htmlFor>`. */
  "aria-label"?: string;
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "— select —",
  emptyMessage = "No matches.",
  clearable = true,
  disabled = false,
  id,
  name,
  className,
  popoverClassName,
  "data-test-id": testId,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpenState] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  // `useId` gives the same string on server and client — a module-scope
  // counter would race the SSR + hydration passes and warn about
  // mismatched `aria-controls`. The listbox is always mounted via
  // Radix's portal at the same DOM node, but the id is read at render
  // time so it has to be deterministic across both passes.
  const listId = React.useId();

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false),
    );
  }, [options, query]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length, query]);

  // Keep the active item in view as the user arrows through a long list.
  React.useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const node = list.querySelectorAll<HTMLLIElement>("[role='option']")[
      activeIndex
    ];
    if (node) node.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const current = options.find((o) => o.value === value) ?? null;
  const inputValue = open ? query : current?.label ?? "";
  const placeholderText = current && !open ? "" : placeholder;

  function setOpen(next: boolean) {
    if (disabled) return;
    if (next) {
      // Reset query each time we open so the full list is visible.
      setQuery("");
      setActiveIndex(0);
    }
    setOpenState(next);
  }

  function commit(opt: ComboboxOption | null) {
    onChange(opt ? opt.value : null);
    setOpenState(false);
    setQuery("");
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) =>
        Math.min(i + 1, Math.max(0, filtered.length - 1)),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) commit(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpenState(false);
      setQuery("");
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
    } else if (e.key === "Backspace" && query === "" && value !== null) {
      // Empty query + Backspace clears the selection — common typeahead
      // shorthand for "let me pick something else".
      e.preventDefault();
      commit(null);
    }
  }

  function onClear(e: React.MouseEvent) {
    e.stopPropagation();
    commit(null);
    inputRef.current?.focus();
  }

  return (
    <Popover.Root open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <Popover.Anchor asChild>
        <div
          ref={wrapperRef}
          className={cn("ds-combobox", disabled && "ds-combobox--disabled", className)}
          data-state={open ? "open" : "closed"}
        >
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && filtered[activeIndex]
                ? `ds-combobox-opt-${filtered[activeIndex].value}`
                : undefined
            }
            aria-label={ariaLabel}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            className="ds-combobox__input"
            placeholder={placeholderText}
            value={inputValue}
            title={!open && current ? current.label : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpenState(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => {
              if (!open) setOpen(true);
            }}
            onKeyDown={onKey}
            data-test-id={testId}
            data-placeholder={current === null ? "" : undefined}
          />
          {clearable && value !== null && !disabled && (
            <button
              type="button"
              className="ds-combobox__clear"
              aria-label="Clear selection"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClear}
            >
              ×
            </button>
          )}
          <span
            aria-hidden
            className="ds-combobox__chevron"
            onMouseDown={(e) => {
              // Toggle without stealing focus from the input.
              e.preventDefault();
              if (disabled) return;
              if (open) {
                setOpenState(false);
              } else {
                inputRef.current?.focus();
                setOpen(true);
              }
            }}
          >
            <ChevronDownIcon />
          </span>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn("ds-combobox__popover", popoverClassName)}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Clicks inside the input wrapper aren't "outside" — those
            // already drive open/close via the input handlers.
            const target = e.target as Node | null;
            if (target && wrapperRef.current?.contains(target)) {
              e.preventDefault();
            }
          }}
        >
          {filtered.length === 0 ? (
            <div className="ds-combobox__empty">{emptyMessage}</div>
          ) : (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              className="ds-combobox__list"
            >
              {filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === activeIndex;
                return (
                  <li
                    key={opt.value}
                    id={`ds-combobox-opt-${opt.value}`}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "ds-combobox__item",
                      isActive && "ds-combobox__item--active",
                      isSelected && "ds-combobox__item--selected",
                    )}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => {
                      // Don't blur the input on mousedown — wait for
                      // the click to commit so focus stays put.
                      e.preventDefault();
                    }}
                    onClick={() => commit(opt)}
                  >
                    <span
                      className="ds-combobox__item-label"
                      title={opt.label}
                    >
                      {opt.label}
                    </span>
                    {opt.hint && (
                      <span
                        className="ds-combobox__item-hint"
                        title={opt.hint}
                      >
                        {opt.hint}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
        d="M6 9l6 6 6-6"
      />
    </svg>
  );
}
