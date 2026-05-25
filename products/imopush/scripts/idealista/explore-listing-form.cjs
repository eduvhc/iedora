// Walks every step of the Idealista listing creation form via CDP.
// Uses test data to advance through all 3 steps WITHOUT publishing.
// Stops before final photo upload submission.
const { chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const EMAIL = "eduardoferdcarvalho+agency@gmail.com";
const PASSWORD = "Teste1234_@";
const DIR = path.join(__dirname, "idealista-screenshots", "listing-form");
fs.mkdirSync(DIR, { recursive: true });

let n = 0;
const shot = async (page, name) => {
  const f = path.join(DIR, `${String(n).padStart(2,"0")}-${name}.png`);
  await page.screenshot({ path: f, fullPage: true });
  console.log(`  📸 ${String(n).padStart(2,"0")}-${name}`);
  n++;
};
const d = ms => new Promise(r => setTimeout(r, ms));

// Click a custom dropdown trigger then pick an option by data-value
const pickDropdown = async (page, triggerId, value) => {
  await page.locator(`#${triggerId}`).click();
  await d(400);
  await page.locator(`#${triggerId} li[data-value="${value}"]`).click();
  await d(400);
  console.log(`    ✓ ${triggerId} = ${value}`);
};

// Dump all visible form fields + headings + buttons on current page
const dumpForm = async (page) => {
  const fields = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("input:not([type=hidden]), select, textarea").forEach(el => {
      const label = (() => {
        if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.innerText.trim().replace(/\s+/g," ").slice(0,80); }
        return "";
      })();
      out.push({
        tag: el.tagName.toLowerCase(),
        type: el.type||"",
        name: el.name||"",
        id: el.id||"",
        ph: el.placeholder||"",
        label,
        req: el.required,
        opts: el.tagName==="SELECT" ? [...el.options].map(o=>`${o.value}:${o.text.trim()}`).join("|").slice(0,200) : undefined,
      });
    });
    return out;
  });
  fields.forEach(f => {
    const r = f.req?" [req]":"";
    const l = f.label?` "${f.label}"`:"";
    if (f.opts) {
      console.log(`    <select name="${f.name}" id="${f.id}">${r}${l}`);
      console.log(`      options: ${f.opts}`);
    } else {
      console.log(`    <${f.tag} type="${f.type}" name="${f.name}" id="${f.id}" ph="${f.ph}">${r}${l}`);
    }
  });
  const h = await page.evaluate(() =>
    [...document.querySelectorAll("h1,h2,h3,h4,legend")].map(e=>e.innerText.trim().replace(/\s+/g," ")).filter(t=>t&&t.length<120).slice(0,10)
  );
  if (h.length) console.log("  Headings:", h);
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll("button,input[type=submit],input[type=button]")]
      .map(e=>({id:e.id||"",type:e.type||"",text:(e.innerText||e.value||"").trim().replace(/\s+/g," ").slice(0,60)}))
      .filter(b=>b.text)
  );
  if (btns.length) console.log("  Buttons:", btns);
};

(async () => {
  console.log("Connecting to Chrome on port 9222…");
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log("\n── Login");
  await page.goto("https://www.idealista.pt/login", { waitUntil: "domcontentloaded" });
  await d(2000);
  if (page.url().includes("/login")) {
    const em = page.locator("input[type=email], #email").first();
    await em.click(); await d(300);
    await em.type(EMAIL, { delay: 80 });
    await d(400);
    await page.locator('button:has-text("Continuar"), button[type=submit]').first().click();
    await page.waitForSelector("input[type=password]", { timeout: 15000 });
    await d(600);
    const pw = page.locator("input[type=password]").first();
    await pw.click(); await d(300);
    await pw.type(PASSWORD, { delay: 80 });
    await d(500);
    await page.locator("button[type=submit]").first().click();
    await d(4000);
  }
  console.log("  Logged in. URL:", page.url());
  await shot(page, "00-logged-in");

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Dados básicos
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n══ STEP 1: Dados básicos");
  await page.goto("https://www.idealista.pt/flow/novo-anuncio", { waitUntil: "domcontentloaded" });
  await d(2000);
  console.log("  URL:", page.url());
  await shot(page, "01-step1-blank");
  console.log("  Fields:");
  await dumpForm(page);

  // 1a. Property type = HOME (Apartamento)
  console.log("\n  Filling…");
  await pickDropdown(page, "qa_typology", "HOME");
  await d(600);
  await shot(page, "02-step1-typology");

  // 1b. Operation = sell — input inside label with span overlay; use JS click
  await page.evaluate(() => document.querySelector("#ca-radio-sell").click());
  await d(400);
  console.log("    ✓ operation = sell");

  // 1c. Locality — type + pick first autocomplete suggestion
  const locInput = page.locator("#ca-geo-locality");
  await locInput.click(); await d(300);
  await locInput.type("Lisboa", { delay: 80 });
  await d(1800);
  const sug = page.locator("[class*=autocomplete] li, [role=option], [class*=suggestion]").first();
  if (await sug.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sug.click();
    console.log("    ✓ locality = Lisboa (autocomplete)");
  } else {
    await page.keyboard.press("ArrowDown");
    await d(200);
    await page.keyboard.press("Enter");
    console.log("    ✓ locality = Lisboa (keyboard)");
  }
  await d(600);

  // 1d. Street
  const streetInput = page.locator("#ca-geo-address");
  if (await streetInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await streetInput.click(); await d(300);
    await streetInput.type("Rua Augusta", { delay: 80 });
    await d(1800);
    const ss = page.locator("[class*=autocomplete] li, [role=option]").first();
    if (await ss.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ss.click();
      console.log("    ✓ street = Rua Augusta (autocomplete)");
    } else {
      await streetInput.press("Enter");
      console.log("    ✓ street = Rua Augusta (no autocomplete)");
    }
    await d(600);
  }

  // 1e. Street number
  const numInput = page.locator("#ca-geo-number");
  if (await numInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await numInput.click(); await d(200);
    await numInput.type("100", { delay: 80 });
    await d(400);
    console.log("    ✓ number = 100");
  }

  // 1f. Verify address → confirm modal "Está no lugar correto?"
  await shot(page, "03-step1-address-filled");
  await page.locator("#ca-geo-validate").click();
  console.log("    ✓ Clicked Verificar morada");
  await d(3000);
  await shot(page, "04-step1-address-verified");

  // Dismiss confirmation modal — "Confirmar morada"
  const confirmBtn = page.locator('button:has-text("Confirmar morada"), a:has-text("Confirmar morada")');
  if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirmBtn.click();
    console.log("    ✓ Confirmed address on map modal");
    await d(2000);
    await shot(page, "04b-step1-address-confirmed");
  }
  console.log("  URL after verify:", page.url());

  // 1g. Floor — open custom dropdown with id qa_address.floorNumber
  const floorTrigger = page.locator('[id="qa_address.floorNumber"]');
  if (await floorTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
    await floorTrigger.click(); await d(400);
    await page.locator('[id="qa_address.floorNumber"] li[data-value="1"]').click();
    await d(400);
    console.log("    ✓ floor = 1");
  }

  // 1h. Scroll to contact section
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await d(600);
  await shot(page, "05-step1-contact");

  // 1i. Phone
  const phone1 = page.locator("#ca-contact-phone1");
  if (await phone1.isVisible({ timeout: 3000 }).catch(() => false)) {
    await phone1.click(); await d(200);
    await phone1.fill("912345678");
    await d(300);
    console.log("    ✓ phone = 912345678");
  }

  // 1j. Name
  const nameInput = page.locator("#ca-contact-name");
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.click(); await d(200);
    await nameInput.fill("Eduardo");
    await d(300);
    console.log("    ✓ name = Eduardo");
  }

  // 1k. Privacy policy
  const privacyExists = await page.evaluate(() => !!document.querySelector("#privacyPolicyAccepted1"));
  if (privacyExists) {
    const isChecked = await page.evaluate(() => document.querySelector("#privacyPolicyAccepted1").checked);
    if (!isChecked) await page.evaluate(() => document.querySelector("#privacyPolicyAccepted1").click());
    await d(300);
    console.log("    ✓ privacy policy accepted");
  }

  await shot(page, "06-step1-filled");

  // 1l. Submit step 1 — scroll into view then JS click to bypass overlay
  console.log("\n  Submitting step 1…");
  await page.evaluate(() => document.querySelector("#ca-button-continue").scrollIntoView());
  await d(500);
  await shot(page, "06b-step1-submit-visible");
  await page.evaluate(() => document.querySelector("#ca-button-continue").click());
  await d(5000);
  await shot(page, "07-step1-submitted");
  console.log("  URL:", page.url());

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Detalhes
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n══ STEP 2: Detalhes");
  await shot(page, "08-step2-blank");
  console.log("  URL:", page.url());
  console.log("  Fields:");
  await dumpForm(page);

  // Fill minimum required fields on step 2 to be able to advance
  // Price
  const priceInput = page.locator('input[name*="price"], input[id*="price"]').first();
  if (await priceInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await priceInput.click(); await d(200);
    await priceInput.fill("150000");
    await d(300);
    console.log("    ✓ price = 150000");
  }

  // Size / area
  const sizeInput = page.locator('input[name*="size"], input[name*="Size"], input[name*="area"], input[name*="Area"]').first();
  if (await sizeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sizeInput.click(); await d(200);
    await sizeInput.fill("80");
    await d(300);
    console.log("    ✓ size = 80");
  }

  await shot(page, "09-step2-partial");

  // Scroll down to see all fields
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await d(600);
  await shot(page, "10-step2-scrolled");
  console.log("  Fields after scroll:");
  await dumpForm(page);

  // Try to advance to step 3
  const step2btn = page.locator("#ca-button-continue, input[type=submit][id*=continue], button:has-text('Seguinte'), button[type=submit]").first();
  if (await step2btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("\n  Submitting step 2…");
    await step2btn.click();
    await d(5000);
    await shot(page, "11-step2-submitted");
    console.log("  URL:", page.url());
  } else {
    console.log("  No submit button found on step 2 (all fields might not be filled).");
    await shot(page, "11-step2-no-submit");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Fotos
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n══ STEP 3: Fotos");
  await shot(page, "12-step3-blank");
  console.log("  URL:", page.url());
  console.log("  Fields:");
  await dumpForm(page);

  // DO NOT submit step 3 — that would publish the listing.
  console.log("\n  ⛔ Stopping here — step 3 is photo upload; submitting would publish the listing.");

  console.log("\n✅ Exploration complete. Screenshots:", DIR);
  await page.close();
  await browser.close();
})().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
