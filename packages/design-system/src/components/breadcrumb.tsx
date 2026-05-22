import * as React from "react";
import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { Slot } from "radix-ui";
import { cn } from "../lib/cn";

type BreadcrumbProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

type BreadcrumbLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Render through the child element — compose with a framework router
   *  primitive (e.g. `next/link`) so navigation stays client-side. */
  asChild?: boolean;
  children: ReactNode;
};

type BreadcrumbHereProps = HTMLAttributes<HTMLElement> & {
  /** Tag for the current item. Defaults to `<h1>` so the breadcrumb's
   *  current node doubles as the page heading (SEO + a11y win); pass
   *  `as="span"` when the page already has another `<h1>`. */
  as?: "h1" | "h2" | "h3" | "span";
  children: ReactNode;
};

/**
 * Iedora Manual § VI.9 — Breadcrumb trail.
 *
 * Editorial vocabulary, three pieces:
 *   - Ancestors render via `<BreadcrumbLink>` — small mono-caps,
 *     `--ink-55`, underline on hover.
 *   - The current page renders via `<BreadcrumbHere>` — italic serif
 *     at body size, `--ink`. By default it's an `<h1>` so it also
 *     serves as the page heading.
 *   - The separator is a cinnabar `/`. This is the iedora accent
 *     applied as a connector between trail segments (same family as
 *     the wordmark's terminal dot and the closing-statement period).
 *
 * Composition:
 *
 *   <Breadcrumb>
 *     <BreadcrumbLink href="/dashboard">Back</BreadcrumbLink>
 *     <BreadcrumbHere>QR codes (admin)</BreadcrumbHere>     // renders as <h1>
 *   </Breadcrumb>
 *
 * For Next.js client routing, pass `asChild` on `BreadcrumbLink` and
 * wrap a `<Link>`:
 *
 *   <BreadcrumbLink asChild>
 *     <Link href="/dashboard">Back</Link>
 *   </BreadcrumbLink>
 */
export function Breadcrumb({ className, children, ...rest }: BreadcrumbProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <nav
      {...rest}
      aria-label={rest["aria-label"] ?? "Breadcrumb"}
      className={cn("ds-breadcrumb", className)}
    >
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <span aria-hidden="true" className="ds-breadcrumb__sep">
              /
            </span>
          ) : null}
          {child}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function BreadcrumbLink({
  asChild,
  className,
  children,
  ...rest
}: BreadcrumbLinkProps) {
  const Comp = asChild ? Slot.Slot : "a";
  return (
    <Comp {...rest} className={cn("ds-breadcrumb__link", className)}>
      {children}
    </Comp>
  );
}

export function BreadcrumbHere({
  as: Tag = "h1",
  className,
  children,
  ...rest
}: BreadcrumbHereProps) {
  return (
    <Tag
      {...rest}
      aria-current="page"
      className={cn("ds-breadcrumb__here", className)}
    >
      {children}
    </Tag>
  );
}
