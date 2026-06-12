import type { Metadata } from 'next'
import {
  Wordmark, Nav, NavBrand, NavActions,
  Statement, SectionHeader, MetaStrip, HouseSvg,
  Card, CardTitle, CardDesc, CardFoot,
} from '@iedora/design-system'
import { PRODUCTS, productUrl, CONTACT_EMAIL, BRAND_NAME } from '@iedora/brand'

export const metadata: Metadata = {
  title: 'Iedora. House of Software.',
  description:
    'We build quiet tools for restaurants. Digital menus, reservations, order-to-table.'
}

export default function HouseLanding() {
  const menuUrl = productUrl(PRODUCTS.menu)

  return (
    <div className="ds-root ds-root--washed">
      <Nav sticky>
        <NavBrand>
          <Wordmark variant="inline" />
        </NavBrand>
        <NavActions>
          <a href={`mailto:${CONTACT_EMAIL}`} className="ds-btn">
            {CONTACT_EMAIL}
          </a>
        </NavActions>
      </Nav>

      <main className="ds-shell">
        {/* ── Hero ──────────────────────────────────────────── */}
        <header className="ds-hero" data-test-id="house-hero">
          <HouseSvg className="ds-hero__house" />
          <span className="ds-eyebrow">
            <span className="ds-eyebrow__idx">/ 00</span>
            <span>
              <Wordmark variant="inline" />
            </span>
          </span>
          <h1 className="ds-hero__h ds-hero__h--dot">
            Software for <em>restaurants</em>.
          </h1>
          <Statement>
            We build quiet tools for the people who run restaurants. Digital menus
            work now. Reservations and order-to-table are on the way.
          </Statement>
          <p className="ds-hero__trust" data-test-id="house-trust">
            Self-hosted multi-tenant platform. Patient work, quiet interfaces.
          </p>
          <div className="ds-hero__ctas">
            <a
              className="ds-btn ds-btn--primary"
              href={menuUrl}
              rel="noopener"
              data-test-id="house-cta-menu"
            >
              <span>See our first product: menu</span>
              <span className="ds-btn__arrow" aria-hidden="true">
                →
              </span>
            </a>
            <a
              className="ds-btn"
              href={`mailto:${CONTACT_EMAIL}`}
              data-test-id="house-cta-contact"
            >
              <span>Write to {CONTACT_EMAIL}</span>
            </a>
          </div>
        </header>

        {/* ── Products ──────────────────────────────────────── */}
        <section data-test-id="house-products">
          <SectionHeader title="What we build" hint="Products" />

          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            style={{ marginTop: 24 }}
          >
            <a
              href={menuUrl}
              className="ds-card no-underline"
              data-test-id="house-product-menu"
            >
              <CardTitle>Menu</CardTitle>
              <CardDesc>
                A drag-and-drop menu builder. QR codes, publishing, analytics,
                multi-language. Always free for one restaurant.
              </CardDesc>
              <CardFoot>
                Live &middot; {menuUrl.replace('https://', '')}
              </CardFoot>
            </a>

            <Card data-test-id="house-product-reservations">
              <CardTitle>Reservations</CardTitle>
              <CardDesc>
                Table management that works around the kitchen, not against it.
                Guests book, the house knows who is coming.
              </CardDesc>
              <CardFoot>Coming soon</CardFoot>
            </Card>

            <Card data-test-id="house-product-ott">
              <CardTitle>Order-to-table</CardTitle>
              <CardDesc>
                Guests order from the menu. The kitchen sees it instantly. No
                waiting for a server, no lost tickets.
              </CardDesc>
              <CardFoot>Coming soon</CardFoot>
            </Card>

            <Card data-test-id="house-product-loyalty">
              <CardTitle>Loyalty</CardTitle>
              <CardDesc>
                Remember regulars, reward them quietly. A gentle system regulars
                actually want to use.
              </CardDesc>
              <CardFoot>Coming soon</CardFoot>
            </Card>
          </div>
        </section>

        {/* ── Contact ───────────────────────────────────────── */}
        <section data-test-id="house-contact">
          <SectionHeader title="Write to us" hint="Contact" />

          <Statement>
            If you run a restaurant and want a better menu, or just want to talk
            about what we are building, we read every message.
          </Statement>

          <p style={{ marginTop: 24 }}>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="ds-btn ds-btn--primary"
              data-test-id="house-cta-contact-end"
            >
              <span>{CONTACT_EMAIL}</span>
              <span className="ds-btn__arrow" aria-hidden="true">
                →
              </span>
            </a>
          </p>
        </section>
      </main>

      <MetaStrip
        left={<span>&copy; {BRAND_NAME}</span>}
        center={<Wordmark variant="inline" />}
        right={<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
      />
    </div>
  )
}
