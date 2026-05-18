import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked"> & {
  /** Controlled checked state. Renders the filled box when true. */
  checked?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Iedora Manual § VI.4 — checkbox.
 * 16px box, ink fills when on, serif label.
 *
 * The actual <input type="checkbox"> is visually hidden but kept in the DOM
 * for accessibility + form submission. Toggle the `checked` prop from the
 * parent.
 */
export function Checkbox({
  checked = false,
  children,
  className,
  ...rest
}: CheckboxProps) {
  return (
    <label className={cn("ds-check", checked && "ds-check--on", className)}>
      <span className="ds-check__box" aria-hidden="true">
        <span className="ds-check__tick" />
      </span>
      <input
        {...rest}
        type="checkbox"
        checked={checked}
        className="ds-check__input"
      />
      <span>{children}</span>
    </label>
  );
}

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked"> & {
  checked?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Iedora Manual § VI.4 — toggle.
 * 36×18 track, 12px knob. Ink fills when on; the knob inverts paper.
 */
export function Toggle({
  checked = false,
  children,
  className,
  ...rest
}: ToggleProps) {
  return (
    <label className={cn("ds-toggle", checked && "ds-toggle--on", className)}>
      <span className="ds-toggle__track" aria-hidden="true">
        <span className="ds-toggle__knob" />
      </span>
      <input
        {...rest}
        type="checkbox"
        role="switch"
        checked={checked}
        className="ds-toggle__input"
      />
      <span>{children}</span>
    </label>
  );
}
