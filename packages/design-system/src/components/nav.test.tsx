import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Nav, NavBrand, NavLinks, NavLink, NavActions } from "./nav";

describe("Nav", () => {
  it("renders a <header> with the base class", () => {
    const html = renderToStaticMarkup(
      <Nav>
        <NavBrand>m</NavBrand>
      </Nav>,
    );
    expect(html).toMatch(/^<header class="ds-nav">/);
  });

  it("adds the sticky modifier when sticky", () => {
    const html = renderToStaticMarkup(<Nav sticky>x</Nav>);
    expect(html).toContain('class="ds-nav ds-nav--sticky"');
  });

  it("forwards arbitrary HTML attributes (incl. data-test-id)", () => {
    const html = renderToStaticMarkup(
      <Nav data-test-id="my-nav" id="primary">
        x
      </Nav>,
    );
    expect(html).toContain('id="primary"');
    expect(html).toContain('data-test-id="my-nav"');
  });
});

describe("NavBrand", () => {
  it("renders a <div> with the brand class", () => {
    const html = renderToStaticMarkup(<NavBrand>menu.</NavBrand>);
    expect(html).toContain('class="ds-nav__brand"');
    expect(html).toContain("menu.");
  });
});

describe("NavLinks", () => {
  it("renders a <nav> with the links class + default aria-label", () => {
    const html = renderToStaticMarkup(
      <NavLinks>
        <NavLink href="/a">A</NavLink>
      </NavLinks>,
    );
    expect(html).toMatch(/^<nav\b/);
    expect(html).toContain('class="ds-nav__links"');
    expect(html).toContain('aria-label="Primary"');
  });

  it("respects a custom aria-label", () => {
    const html = renderToStaticMarkup(
      <NavLinks aria-label="Dashboard">x</NavLinks>,
    );
    expect(html).toContain('aria-label="Dashboard"');
  });
});

describe("NavLink", () => {
  it("renders an <a> with the link class", () => {
    const html = renderToStaticMarkup(
      <NavLink href="/x">Analytics</NavLink>,
    );
    expect(html).toContain('class="ds-nav__link"');
    expect(html).toContain('href="/x"');
    expect(html).toContain("Analytics");
  });

  it("marks the active link with data-active + aria-current", () => {
    const html = renderToStaticMarkup(
      <NavLink href="/x" active>
        Analytics
      </NavLink>,
    );
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-current="page"');
  });

  it("omits aria-current and sets data-active='false' when inactive", () => {
    const html = renderToStaticMarkup(<NavLink href="/x">A</NavLink>);
    expect(html).toContain('data-active="false"');
    expect(html).not.toContain("aria-current");
  });

  it("forwards data-test-id", () => {
    const html = renderToStaticMarkup(
      <NavLink href="/x" data-test-id="nav-billing">
        Billing
      </NavLink>,
    );
    expect(html).toContain('data-test-id="nav-billing"');
  });

  it("renders through asChild — merges class + data-active onto the child", () => {
    const html = renderToStaticMarkup(
      <NavLink asChild active data-test-id="nav-billing">
        <a href="/dashboard/billing" className="custom-link">
          Billing
        </a>
      </NavLink>,
    );
    // Single anchor (no extra wrapper) with merged className + slot attrs.
    expect(html).toMatch(/^<a[^>]*href="\/dashboard\/billing"/);
    expect(html).toContain("ds-nav__link");
    expect(html).toContain("custom-link");
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-test-id="nav-billing"');
    expect(html).not.toMatch(/<a[^>]*><a/); // not double-anchored
  });
});

describe("NavActions", () => {
  it("renders a <div> with the actions class", () => {
    const html = renderToStaticMarkup(
      <NavActions data-test-id="actions">x</NavActions>,
    );
    expect(html).toContain('class="ds-nav__actions"');
    expect(html).toContain('data-test-id="actions"');
  });
});
