// Scrape a single Idealista listing page and emit a UnifiedProperty JSON.
// Usage: node scrape-idealista-listing.cjs <url>
// Example: node scrape-idealista-listing.cjs https://www.idealista.pt/imovel/34946733
const { chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const url = process.argv[2] || "https://www.franetic.com/pt/imoveis/quinta-galizes-t4-piscina-vista-serra-estrela";

(async () => {
  console.log("Connecting to Chrome on port 9222…");
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  console.log("Navigating to:", url);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // ── Raw extraction from the page ─────────────────────────────────────────
  const raw = await page.evaluate(() => {
    const text = s => document.querySelector(s)?.innerText?.trim() ?? null;
    const texts = s => [...document.querySelectorAll(s)].map(e => e.innerText?.trim()).filter(Boolean);
    const attr = (s, a) => document.querySelector(s)?.getAttribute(a) ?? null;

    // Title
    const title = text("h1.main-info__title-main, h1[class*='title']");

    // Price
    const priceRaw = text(".info-data-price, [class*='price'] span, .price-container .price");

    // Location breadcrumb
    const breadcrumb = texts(".breadcrumb li, nav[aria-label*='breadcrumb'] li, .breadcrumb-item");

    // Address shown on page
    const address = text(".main-info__title-minor, [class*='address'], [class*='ubicacion']");

    // Features list
    const features = texts(".details-property li, .feature-list li, [class*='features'] li, .details-property-feature-one li, .details-property_features li");

    // Description
    const description = text(".comment .text, [class*='description'] p, #description, .adCommentsWrapper .text");

    // Characteristics table / detail items
    const detailItems = {};
    document.querySelectorAll(".details-property-feature-one .feature-item, .details-property .detail-item, .info-features .info-feature, li.header-map-list, .details-property li").forEach(li => {
      const spans = li.querySelectorAll("span");
      if (spans.length >= 2) {
        const key = spans[0].innerText?.trim();
        const val = spans[spans.length - 1].innerText?.trim();
        if (key && val) detailItems[key] = val;
      }
    });

    // Info data items (rooms, size, floor, etc.)
    const infoData = {};
    document.querySelectorAll(".info-features .info-feature, .details-features .feature").forEach(el => {
      const label = el.querySelector("[class*='label'], [class*='title'], span:last-child")?.innerText?.trim();
      const value = el.querySelector("[class*='value'], span:first-child, strong")?.innerText?.trim();
      if (label && value) infoData[label] = value;
    });

    // Main stats bar (area, rooms, floor, etc.) — most reliable
    const statsBar = {};
    document.querySelectorAll(".info-data .info-data-facts span, .main-info__table .table-element, .details-stats .details-stat").forEach(el => {
      const t = el.innerText?.trim();
      if (t) statsBar[t] = true;
    });

    // Property JSON-LD
    let jsonLd = null;
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const j = JSON.parse(s.textContent);
        if (j["@type"] === "Product" || j["@type"] === "RealEstateListing" || j.name || j.offers) {
          jsonLd = j;
        }
      } catch {}
    });

    // Idealista sometimes puts structured data in a window variable
    let windowData = null;
    try {
      // Try to find property data in global JS vars
      windowData = window.__INITIAL_PROPS__ || window.dataLayer?.[0] || null;
    } catch {}

    // Images
    const images = [...document.querySelectorAll(".images-slider img, [class*='photo'] img, .gallery img")]
      .map(img => img.src || img.dataset.src)
      .filter(src => src && src.startsWith("http"))
      .slice(0, 5);

    // Key detail spans (typically shown in the header area)
    const keyDetails = texts(".info-data-facts span, .details-info .detail, .header-info-inner li");

    // Energy certificate
    const energy = text("[class*='energy'] [class*='letter'], .tag-energy span, .energy-certificate span");

    // Heading detail items — the pill-shaped stats (e.g. "T2", "80 m²", "1 casa de banho")
    const pillDetails = texts(".details-property-h2 span, .property-overview-features li, .details-stats li");

    return {
      title,
      priceRaw,
      breadcrumb,
      address,
      features,
      description,
      detailItems,
      infoData,
      statsBar: Object.keys(statsBar),
      keyDetails,
      pillDetails,
      images,
      energy,
      jsonLd,
      url: window.location.href,
      fullText: document.body.innerText.slice(0, 8000),
    };
  });

  console.log("\n── Raw extraction ─────────────────────────────────────");
  console.log("Title:", raw.title);
  console.log("Price:", raw.priceRaw);
  console.log("Address:", raw.address);
  console.log("Breadcrumb:", raw.breadcrumb);
  console.log("Key details:", raw.keyDetails);
  console.log("Pill details:", raw.pillDetails);
  console.log("Features:", raw.features);
  console.log("Energy:", raw.energy);
  console.log("Detail items:", JSON.stringify(raw.detailItems, null, 2));
  console.log("Info data:", JSON.stringify(raw.infoData, null, 2));
  console.log("Images:", raw.images);
  if (raw.jsonLd) console.log("JSON-LD:", JSON.stringify(raw.jsonLd, null, 2));

  // ── Also dump the page HTML for the main content area ───────────────────
  const mainHtml = await page.evaluate(() => {
    const main = document.querySelector(".detail-info, main, #main-container, article");
    return main?.outerHTML?.slice(0, 12000) ?? "not found";
  });

  // Save raw HTML + raw data for inspection
  const outDir = path.join(__dirname, "idealista-screenshots", "scrape");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "raw.json"), JSON.stringify(raw, null, 2));
  fs.writeFileSync(path.join(outDir, "main.html"), mainHtml);
  await page.screenshot({ path: path.join(outDir, "listing.png"), fullPage: true });
  console.log("\n📸 Screenshot + raw data saved to", outDir);

  // ── Parse into UnifiedProperty ────────────────────────────────────────────
  console.log("\n── Parsing into UnifiedProperty ─────────────────────");

  const jld = raw.jsonLd;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const parsePrice = str => {
    if (str == null) return null;
    if (typeof str === "number") return Math.round(str * 100);
    const num = String(str).replace(/[^\d,\.]/g, "").replace(",", ".");
    const val = parseFloat(num);
    return isNaN(val) ? null : Math.round(val * 100);
  };

  const amenity = name => jld?.amenityFeature?.some(f => f.name === name && f.value) ?? false;

  // ── Type mapping ──────────────────────────────────────────────────────────
  // Determine from fullText / title: moradia+hectares → country_house, else house
  const bodyLower = raw.fullText.toLowerCase();
  let propertyType = "house";
  if (bodyLower.includes("quinta") || (jld?.lotSize?.value ?? 0) >= 5000) {
    propertyType = "country_house"; // COUNTRYHOUSE on Idealista
  } else if (bodyLower.includes("apartamento") || bodyLower.includes("flat")) {
    propertyType = "apartment";
  }

  // ── Energy certificate ────────────────────────────────────────────────────
  const energyMatch = raw.fullText.match(/classe energ[ée]tica[:\s]+([A-G][+-]?)/i)
    || raw.fullText.match(/\bA\+\b|\bA\b|\bB-\b|\bB\b|\bC\b|\bD\b|\bE\b|\bF\b|\bG\b/);
  const energyRaw = energyMatch ? energyMatch[1] || energyMatch[0] : null;
  // Normalise to Idealista values: "A+" → "a+", "B-" → "b-", etc.
  const energyMap = { "A+":"a+","A":"a","B":"b","B-":"b-","C":"c","D":"d","E":"e","F":"f","G":"g" };
  const energyCertificate = energyRaw ? (energyMap[energyRaw.toUpperCase()] ?? energyRaw.toLowerCase()) : undefined;

  // ── Address ───────────────────────────────────────────────────────────────
  const addr = jld?.address ?? {};
  const locality   = addr.addressLocality  || addr.addressRegion || "Lisboa";
  const streetAddr = addr.streetAddress?.split(",")[0]?.trim();   // first segment only

  // ── Price ─────────────────────────────────────────────────────────────────
  const priceCents = jld?.offers?.price != null
    ? parsePrice(jld.offers.price)
    : parsePrice(raw.priceRaw);

  // ── Features ──────────────────────────────────────────────────────────────
  const features = {
    hasPool:      amenity("pool"),
    hasGarden:    amenity("garden"),
    hasTerrace:   amenity("terrace"),
    hasStorage:   amenity("storage"),
    hasParking:   amenity("garage"),
    energyCertificate,
    condition:    bodyLower.includes("novo") || bodyLower.includes("nova") ? "new" : "good",
  };

  // ── Description (full, trimmed to 2000 chars for Idealista) ───────────────
  const description = (jld?.description || raw.description || "").slice(0, 2000) || undefined;

  // ── Images ────────────────────────────────────────────────────────────────
  const photoUrls = Array.isArray(jld?.image) ? jld.image : raw.images;

  // ── Year built ───────────────────────────────────────────────────────────
  const yearMatch = raw.fullText.match(/constru[íi]do em (\d{4})/i);
  const yearBuilt = yearMatch ? parseInt(yearMatch[1]) : undefined;

  const unified = {
    type:       propertyType,
    operation:  "sale",
    address: {
      locality,
      street:   streetAddr,
    },
    contact: {
      name:        "Eduardo",
      email:       "eduardoferdcarvalho+agency@gmail.com",
      phone:       "917140356",
      phonePrefix: "351",
    },
    priceCents,
    sizeSqm:    jld?.floorSize?.value ?? null,
    rooms:      jld?.numberOfRooms ?? null,
    bathrooms:  jld?.numberOfBathroomsTotal ?? null,
    description,
    features,
    photoUrls,
    _meta: {
      title:      jld?.name ?? raw.title,
      sourceUrl:  raw.url,
      yearBuilt,
      lotSizeSqm: jld?.lotSize?.value ?? null,
    },
  };

  console.log("\n── UnifiedProperty ─────────────────────────────────────");
  console.log(JSON.stringify(unified, null, 2));

  const outFile = path.join(outDir, "unified.json");
  fs.writeFileSync(outFile, JSON.stringify(unified, null, 2));
  console.log("\n✅ Saved to", outFile);

  await page.close();
  await browser.close();
})().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
