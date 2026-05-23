// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import {
  Sidebar,
  SidebarBrand,
  SidebarFooter,
  SidebarLink,
  SidebarLinks,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./sidebar";

// JSDOM doesn't implement matchMedia. The sidebar uses it to listen
// for the lg+ crossing so it can auto-close the drawer; stub a noop
// MediaQueryList that never matches and never fires.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function Fixture() {
  return (
    <SidebarProvider>
      <SidebarTrigger aria-label="Open navigation" />
      <Sidebar aria-label="Dashboard">
        <SidebarBrand>brand</SidebarBrand>
        <SidebarLinks aria-label="Dashboard">
          <SidebarLink href="/x" active>
            X
          </SidebarLink>
          <SidebarLink href="/y">Y</SidebarLink>
        </SidebarLinks>
        <SidebarFooter>footer</SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );
}

function aside() {
  return screen.getByRole("complementary", { name: "Dashboard" });
}
function trigger() {
  return screen.getByRole("button", { name: "Open navigation" });
}
function queryTrigger() {
  return screen.queryByRole("button", { name: "Open navigation" });
}

describe("Sidebar", () => {
  it("renders the rail closed by default and marks the active link", () => {
    render(<Fixture />);
    expect(aside()).toHaveAttribute("data-open", "false");

    const x = screen.getByRole("link", { name: "X" });
    expect(x).toHaveAttribute("data-active", "true");
    expect(x).toHaveAttribute("aria-current", "page");

    const y = screen.getByRole("link", { name: "Y" });
    expect(y).toHaveAttribute("data-active", "false");
    expect(y).not.toHaveAttribute("aria-current");
  });

  it("opens the drawer via the trigger, unmounts the trigger while open, locks body scroll", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    expect(aside()).toHaveAttribute("data-open", "false");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger());
    expect(aside()).toHaveAttribute("data-open", "true");
    expect(queryTrigger()).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on Escape and restores body scroll + trigger", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(trigger());
    expect(aside()).toHaveAttribute("data-open", "true");

    await user.keyboard("{Escape}");
    expect(aside()).toHaveAttribute("data-open", "false");
    expect(document.body.style.overflow).toBe("");
    expect(queryTrigger()).not.toBeNull();
  });

  it("closes when the overlay is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<Fixture />);
    await user.click(trigger());
    expect(aside()).toHaveAttribute("data-open", "true");

    const overlay = container.querySelector<HTMLElement>(".ds-sidebar__overlay");
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
    expect(aside()).toHaveAttribute("data-open", "false");
  });

  it("throws when useSidebar is called outside a provider", () => {
    function Bad() {
      useSidebar();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow(/SidebarProvider/);
    spy.mockRestore();
  });
});
