import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { Slot } from "radix-ui";
import { cn } from "../lib/cn";

/**
 * Iedora editorial nav — shared shell for the menu landing, the menu
 * dashboard, and any future product surface.
 *
 * Composition (slots, not props):
 *
 *   <Nav sticky>
 *     <NavBrand>...wordmark...</NavBrand>
 *     <NavLinks>          // omit when there are no in-product links
 *       <NavLink href="/x" active>Analytics</NavLink>
 *     </NavLinks>
 *     <NavActions>        // lang switcher, auth, logout, ...
 *     </NavActions>
 *   </Nav>
 *
 * Layout (mobile-first, no hamburger — every link reachable at every
 * width):
 *
 *   ≤lg (< 1080px)     Brand           Actions      (row 1)
 *                      ───────────────────────────
 *                      Links · scroll-x            (row 2, full-width)
 *
 *   ≥lg                Brand   Links   Actions     (single row)
 *
 * The links row collapses to zero height when `<NavLinks>` is absent
 * (CSS `:has()` query swaps the grid template). Active state is driven
 * by `<NavLink active>` and read off `data-active` so consumers can
 * inspect it from tests + screen readers (`aria-current="page"`).
 */

export type NavProps = HTMLAttributes<HTMLElement> & {
  /** Stick the chrome to the top of the viewport with a paper-bg + z=40. */
  sticky?: boolean;
  children: ReactNode;
};

export function Nav({ sticky, className, children, ...rest }: NavProps) {
  return (
    <header
      {...rest}
      className={cn("ds-nav", sticky && "ds-nav--sticky", className)}
    >
      <div className="ds-nav__inner">{children}</div>
    </header>
  );
}

export type NavBrandProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function NavBrand({ className, children, ...rest }: NavBrandProps) {
  return (
    <div {...rest} className={cn("ds-nav__brand", className)}>
      {children}
    </div>
  );
}

export type NavLinksProps = HTMLAttributes<HTMLElement> & {
  /** Accessible label for the in-product links region. */
  "aria-label"?: string;
  children: ReactNode;
};

export function NavLinks({
  className,
  children,
  "aria-label": ariaLabel = "Primary",
  ...rest
}: NavLinksProps) {
  return (
    <nav
      {...rest}
      aria-label={ariaLabel}
      className={cn("ds-nav__links", className)}
    >
      {children}
    </nav>
  );
}

export type NavLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Mark the link as the current route. Drives the cinnabar underline. */
  active?: boolean;
  /**
   * Render through the child element instead of a plain `<a>`. Use this
   * to compose with a framework router primitive (`next/link`,
   * `<Link>` from react-router, etc.) so navigation stays client-side
   * and prefetch behavior is preserved:
   *
   *   <NavLink asChild active={isActive} data-test-id="nav-billing">
   *     <Link href="/dashboard/billing">Billing</Link>
   *   </NavLink>
   *
   * Backed by Radix `Slot` — `data-active`, `aria-current`, className
   * and any `data-*` test id all merge onto the child.
   */
  asChild?: boolean;
};

export function NavLink({
  active,
  asChild,
  className,
  children,
  ...rest
}: NavLinkProps) {
  const Comp = asChild ? Slot.Slot : "a";
  return (
    <Comp
      {...rest}
      data-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
      className={cn("ds-nav__link", className)}
    >
      {children}
    </Comp>
  );
}

export type NavActionsProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function NavActions({
  className,
  children,
  ...rest
}: NavActionsProps) {
  return (
    <div {...rest} className={cn("ds-nav__actions", className)}>
      {children}
    </div>
  );
}
