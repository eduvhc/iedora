"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "../lib/cn";

/**
 * Iedora editorial sidebar — mobile-first vertical chrome.
 *
 *   <SidebarProvider>
 *     <SidebarMobileBar>
 *       <SidebarTrigger />
 *       …brand or page title…
 *     </SidebarMobileBar>
 *     <Sidebar aria-label="Dashboard">
 *       <SidebarBrand>…</SidebarBrand>
 *       <SidebarLinks>
 *         <SidebarLink asChild active><Link href=…>…</Link></SidebarLink>
 *       </SidebarLinks>
 *       <SidebarFooter>…</SidebarFooter>
 *     </Sidebar>
 *     <main>…</main>
 *   </SidebarProvider>
 *
 * Layout strategy: one DOM tree, controlled by CSS.
 *
 *   <lg (≤1023px):  `<aside>` slides in from the left, dim overlay,
 *                   ESC closes, click overlay closes, body scroll
 *                   locks while open. The `<SidebarTrigger>` toggles.
 *                   `<SidebarMobileBar>` is visible at this width.
 *
 *   ≥lg (≥1024px):  `<aside>` is a sticky 240px rail, always visible;
 *                   the mobile bar and overlay both `display: none`.
 *                   Trigger is hidden, open state is irrelevant.
 *
 * Test-ids on children stay unique because the tree is never duplicated.
 */

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) {
    throw new Error(
      "useSidebar must be used inside <SidebarProvider>. Wrap the layout that hosts <Sidebar> and <SidebarTrigger>.",
    );
  }
  return ctx;
}

export function SidebarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

type SidebarProps = Omit<React.HTMLAttributes<HTMLElement>, "aria-label"> & {
  "aria-label": string;
  children: React.ReactNode;
};

export function Sidebar({
  className,
  children,
  "aria-label": ariaLabel,
  ...rest
}: SidebarProps) {
  const { open, setOpen } = useSidebar();

  // ESC closes the drawer. Only attached while open — keeps key
  // handling cheap when the drawer isn't in play.
  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Body scroll-lock while the drawer is open. Desktop never sets
  // open=true (the trigger is hidden), so this only ever fires on
  // mobile widths.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Resizing past the desktop breakpoint while the drawer is open
  // would otherwise leave `open=true` (and the scroll-lock above)
  // even though the rail is now permanently visible. Close on the
  // crossing so state stays in sync with the CSS.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1024px)");
    function onChange(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [setOpen]);

  return (
    <>
      <div
        className="ds-sidebar__overlay"
        data-open={open ? "true" : "false"}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <aside
        {...rest}
        aria-label={ariaLabel}
        data-open={open ? "true" : "false"}
        className={cn("ds-sidebar", className)}
      >
        {children}
      </aside>
    </>
  );
}

export function SidebarBrand({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("ds-sidebar__brand", className)} />;
}

type SidebarLinksProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "aria-label"
> & {
  "aria-label"?: string;
  children: React.ReactNode;
};

export function SidebarLinks({
  className,
  children,
  "aria-label": ariaLabel = "Primary",
  ...rest
}: SidebarLinksProps) {
  return (
    <nav
      {...rest}
      aria-label={ariaLabel}
      className={cn("ds-sidebar__links", className)}
    >
      {children}
    </nav>
  );
}

type SidebarLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Marks the link as the current route — drives the cinnabar rail. */
  active?: boolean;
  /**
   * Render through the child element so the framework router primitive
   * (`next/link`, `<Link>` from react-router, …) keeps client-side
   * routing + prefetch intact:
   *
   *   <SidebarLink asChild active={isActive}>
   *     <Link href="/dashboard/billing">Billing</Link>
   *   </SidebarLink>
   */
  asChild?: boolean;
};

export function SidebarLink({
  active,
  asChild,
  className,
  children,
  ...rest
}: SidebarLinkProps) {
  const Comp = asChild ? Slot.Slot : "a";
  return (
    <Comp
      {...rest}
      data-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
      className={cn("ds-sidebar__link", className)}
    >
      {children}
    </Comp>
  );
}

export function SidebarFooter({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("ds-sidebar__footer", className)} />;
}

/**
 * Mono-caps label for grouping nav items inside `<SidebarLinks>`
 * (e.g. an "Admin" parent above QR codes + Sessions). Not interactive —
 * just an editorial separator that sets context for the links below.
 * Renders as a plain `<div>` so screen readers still announce the
 * label inside the `<nav>` landmark (no `role="presentation"`).
 */
export function SidebarSectionLabel({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn("ds-sidebar__section-label", className)}
    >
      {children}
    </div>
  );
}

type SidebarTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Accessible name for the trigger button. Required — it carries no
   * visible label, so this is what screen readers announce. Pass a
   * translated string ("Open navigation" / "Abrir navegação" / …).
   */
  "aria-label": string;
};

/**
 * Hamburger button that toggles the sidebar drawer. Below `lg` it
 * floats over the page in the top-right corner (left is reserved for
 * the page heading; right is empty on every dashboard surface). No
 * dedicated bar — keeps vertical space for content. At ≥lg it's
 * hidden entirely; the rail is always visible.
 */
export function SidebarTrigger({
  className,
  onClick,
  "aria-label": ariaLabel,
  ...rest
}: SidebarTriggerProps) {
  const { open, setOpen } = useSidebar();
  // While the drawer is open, the trigger has no job — closing belongs
  // to <SidebarClose> / scrim / ESC. Unmount it instead of relying on a
  // CSS rule to hide it: keeps the DOM honest, removes it from the a11y
  // tree + tab order, and follows the shadcn Sheet convention where the
  // trigger doesn't fight the open surface for the same affordance.
  if (open) return null;
  return (
    <button
      type="button"
      {...rest}
      aria-label={ariaLabel}
      aria-expanded={false}
      aria-haspopup="dialog"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      }}
      className={cn("ds-sidebar-trigger", className)}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 7h16M4 12h16M4 17h16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

type SidebarCloseProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Accessible name for the close button. Required — it carries no
   * visible label. Pass a translated string ("Close navigation" /
   * "Fechar navegação" / …).
   */
  "aria-label": string;
};

/**
 * In-drawer X button. Mobile-only — sits absolute in the top-right of
 * the open drawer so a left-thumb user has a close target on the same
 * side as the drawer. At ≥lg the rail is always visible, so this
 * button `display: none`'s out.
 */
export function SidebarClose({
  className,
  onClick,
  "aria-label": ariaLabel,
  ...rest
}: SidebarCloseProps) {
  const { setOpen } = useSidebar();
  return (
    <button
      type="button"
      {...rest}
      aria-label={ariaLabel}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      className={cn("ds-sidebar__close", className)}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 6 L18 18 M6 18 L18 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
