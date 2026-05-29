import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SendButton } from "./send-button";

describe("SendButton (deprecated alias for <Button variant=primary arrow>)", () => {
  it("renders a button with the primary variant class", () => {
    const html = renderToStaticMarkup(<SendButton />);
    expect(html).toMatch(/^<button[^>]*class="ds-btn ds-btn--primary"[^>]*>/);
  });

  it("defaults to type='submit' for form usage", () => {
    const html = renderToStaticMarkup(<SendButton />);
    expect(html).toContain('type="submit"');
  });

  it("renders the default 'Send' label and a decorative arrow", () => {
    const html = renderToStaticMarkup(<SendButton />);
    expect(html).toContain("<span>Send</span>");
    expect(html).toContain('<span class="ds-btn__arrow" aria-hidden="true">↗</span>');
  });

  it("respects a custom type when explicitly passed", () => {
    const html = renderToStaticMarkup(<SendButton type="button" />);
    expect(html).toContain('type="button"');
  });

  it("renders custom children in place of 'Send'", () => {
    const html = renderToStaticMarkup(<SendButton>Continue</SendButton>);
    expect(html).toContain("<span>Continue</span>");
    expect(html).not.toContain("<span>Send</span>");
  });

  it("forwards disabled and aria-label through to the underlying button", () => {
    const html = renderToStaticMarkup(
      <SendButton disabled aria-label="Submit form" />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain('aria-label="Submit form"');
  });
});
