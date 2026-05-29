import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "./button";

type SendButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
};

/**
 * @deprecated Use `<Button variant="primary" arrow>` instead.
 *
 * Kept as a thin alias for transition code from before Iedora Manual § VI.1
 * landed. New code should reach for `<Button>` directly.
 */
export function SendButton({ children = "Send", type, ...rest }: SendButtonProps) {
  return (
    <Button {...rest} type={type ?? "submit"} variant="primary" arrow>
      {children}
    </Button>
  );
}
