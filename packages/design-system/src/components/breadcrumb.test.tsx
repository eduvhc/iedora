import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Breadcrumb,
  BreadcrumbHere,
  BreadcrumbLink,
} from "./breadcrumb";

describe("Breadcrumb", () => {
  it("renders a <nav> with aria-label=Breadcrumb by default", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb>
        <BreadcrumbLink href="/">Studio</BreadcrumbLink>
        <BreadcrumbHere>menu</BreadcrumbHere>
      </Breadcrumb>,
    );
    expect(html).toMatch(/^<nav\b/);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('class="ds-breadcrumb"');
  });

  it("inserts a cinnabar-class separator `/` between siblings, never before the first", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb>
        <BreadcrumbLink href="/">Studio</BreadcrumbLink>
        <BreadcrumbLink href="/works">Works</BreadcrumbLink>
        <BreadcrumbHere>menu</BreadcrumbHere>
      </Breadcrumb>,
    );
    // Exactly two separators for three items.
    expect(html.match(/ds-breadcrumb__sep/g)?.length).toBe(2);
    // Cinnabar `/` glyph appears between segments.
    expect(html).toContain(">/</span>");
    expect(html).toContain('aria-hidden="true"');
  });

  it("the leading item has no separator before it", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb>
        <BreadcrumbLink href="/">Studio</BreadcrumbLink>
      </Breadcrumb>,
    );
    expect(html).not.toContain("ds-breadcrumb__sep");
  });
});

describe("BreadcrumbLink", () => {
  it("renders an <a> with the supplied href + the link class", () => {
    const html = renderToStaticMarkup(
      <BreadcrumbLink href="/works">Works</BreadcrumbLink>,
    );
    expect(html).toMatch(/^<a\b/);
    expect(html).toContain('href="/works"');
    expect(html).toContain("ds-breadcrumb__link");
    expect(html).toContain(">Works</a>");
  });

  it("forwards data-test-id", () => {
    const html = renderToStaticMarkup(
      <BreadcrumbLink href="/x" data-test-id="bc-x">
        x
      </BreadcrumbLink>,
    );
    expect(html).toContain('data-test-id="bc-x"');
  });

  it("renders through asChild so a router primitive can wrap it", () => {
    const html = renderToStaticMarkup(
      <BreadcrumbLink asChild data-test-id="bc-back">
        <a href="/dashboard" className="custom">
          Back
        </a>
      </BreadcrumbLink>,
    );
    // One anchor, merged classes + test id.
    expect(html).toMatch(/^<a\b/);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("ds-breadcrumb__link");
    expect(html).toContain("custom");
    expect(html).toContain('data-test-id="bc-back"');
    expect(html).not.toMatch(/<a[^>]*><a/);
  });
});

describe("BreadcrumbHere", () => {
  it("defaults to <h1> so the current item also serves as the page heading", () => {
    const html = renderToStaticMarkup(<BreadcrumbHere>menu</BreadcrumbHere>);
    expect(html).toMatch(/^<h1\b/);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("ds-breadcrumb__here");
    expect(html).toContain(">menu</h1>");
  });

  it("respects an `as` override (e.g. span when the page already has an h1)", () => {
    const html = renderToStaticMarkup(
      <BreadcrumbHere as="span">menu</BreadcrumbHere>,
    );
    expect(html).toMatch(/^<span\b/);
    expect(html).toContain(">menu</span>");
  });
});
