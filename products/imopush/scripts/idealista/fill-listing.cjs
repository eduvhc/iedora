// Fills the Idealista listing creation form with real property data from a fixture JSON.
// Usage: node fill-listing.cjs [path-to-fixture.json]
// Default: ../../fixtures/quinta-galizes.json
// Connects to Chrome on port 9222 (start-chrome-debug.bat / `google-chrome --remote-debugging-port=9222`)
// Stops at Step 3 (photos) — does NOT publish the listing.
const { chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

// ── Load fixture ──────────────────────────────────────────────────────────────
const fixturePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "../../fixtures/quinta-galizes.json");

if (!fs.existsSync(fixturePath)) {
  console.error("Fixture not found:", fixturePath);
  process.exit(1);
}
const prop = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
console.log(`Loaded fixture: ${fixturePath}`);
console.log(`  ${prop.reference} — ${prop.type} — ${prop.operation} — ${prop.address.locality}`);

// ── Credentials (from fixture contact or env) ─────────────────────────────────
const EMAIL = prop.contact.email;
const PASSWORD = process.env.IDEALISTA_PASSWORD || "Teste1234_@";
const PHONE = prop.contact.phone ?? "";
const PHONE_PREFIX = prop.contact.phonePrefix ?? "351";

// ── Translation maps (mirrors field-map.ts — no TS runtime in CJS) ────────────
const TYPOLOGY = {
  apartment:      "HOME",
  house:          "CHALET",
  country_house:  "COUNTRYHOUSE",
  room:           "ROOM",
  office:         "OFFICE",
  commercial:     "WAREHOUSE",
  garage:         "GARAGE",
  land:           "LAND",
  storage:        "STORAGEROOM",
  building:       "BUILDING",
  vacation_rental:"VACATIONAL",
};

const ENERGY_CLASS = {
  "A+":"a+", "A":"a", "B":"b", "B-":"b-", "C":"c", "D":"d",
  "E":"e", "F":"f", "G":"g", "unknown":"unknown", "pending":"in-process", "exempt":"exempt",
};

const HEATING_TYPE = { individual:"INDIVIDUAL", central:"CENTRAL", none:"NO_HEATING" };
const INDIVIDUAL_HEAT = {
  gas:"GAS", propane_butane:"PROPANE_BUTANE", electric:"ELECTRIC",
  heat_pump:"AIR_CONDITIONING_HEAT_PUMP", other:"OTHER",
};
const CENTRAL_HEAT = { gas:"GAS", fuel_oil:"FUEL_OIL", other:"OTHER" };

const CONTACT_METHOD = {
  phone_and_chat: "all-radio-button",
  chat_only:      "only-chat-radio-button",
  phone_only:     "only-phone-radio-button",
};

// ── Translate property to Idealista fields ────────────────────────────────────
const f = prop.features ?? {};

const step1 = {
  typology:     TYPOLOGY[prop.type] ?? "COUNTRYHOUSE",
  operation:    prop.operation === "rent" ? "ca-radio-rent" : "ca-radio-sell",
  // For locality, try the exact locality first; fall back to municipality if no autocomplete
  locality:     prop.address.locality,
  localityFallback: prop.address.municipality,
  street:       prop.address.street,
  streetNumber: prop.address.streetNumber,
  email:        EMAIL,
  phone:        PHONE,
  phonePrefix:  PHONE_PREFIX,
  name:         prop.contact.name,
  contactMethod: CONTACT_METHOD[prop.contact.preferredMethod ?? "phone_and_chat"],
};

const step2 = {
  constructedArea:  String(f.constructedAreaSqm ?? prop.sizeSqm ?? ""),
  usableArea:       f.usableAreaSqm ? String(f.usableAreaSqm) : null,
  lotSize:          f.lotSizeSqm ? String(f.lotSizeSqm) : null,
  roomNumber:       prop.rooms != null ? String(prop.rooms) : null,
  bathNumber:       prop.bathrooms != null ? String(prop.bathrooms) : null,
  builtTypeId:      f.condition === "needs_renovation" ? "builtTypeId-restore" : "builtTypeId-good",
  hasLiftId:        f.hasLift ? "hasLift1" : "hasLift2",
  energyCertValue:  ENERGY_CLASS[f.energyCertificate ?? ""] ?? "unknown",
  occupancyId:      prop.occupancy === "tenanted" ? "currentOccupationType1" : "currentOccupationType2",
  price:            String(Math.round((prop.priceCents ?? 0) / 100)),
  constructionYear: f.yearBuilt ? String(f.yearBuilt) : null,
  heatingType:      f.heatingType ? HEATING_TYPE[f.heatingType] : null,
  individualHeat:   f.individualHeatFuel ? INDIVIDUAL_HEAT[f.individualHeatFuel] : null,
  centralHeat:      f.centralHeatFuel ? CENTRAL_HEAT[f.centralHeatFuel] : null,
  description:      prop.description ?? null,
  // orientation
  facesNorth:   f.facesNorth ?? false,
  facesSouth:   f.facesSouth ?? false,
  facesEast:    f.facesEast  ?? false,
  facesWest:    f.facesWest  ?? false,
  // feature checkboxes
  hasTerrace:         f.hasTerrace ?? false,
  hasBalcony:         f.hasBalcony ?? false,
  hasGarden:          f.hasGarden ?? false,
  hasPool:            f.hasPool ?? false,
  hasParking:         f.hasParking ?? false,
  parkingInPrice:     f.parkingIncludedInPrice ?? false,
  hasStorage:         f.hasStorage ?? false,
  hasWardrobe:        f.hasWardrobe ?? false,
  hasAirConditioning: f.hasAirConditioning ?? false,
  hasFireplace:       f.hasFireplace ?? false,
  hasHandicapAccess:  f.hasHandicapAccess ?? false,
};

console.log("\n── Step 1 data:", JSON.stringify(step1, null, 2));
console.log("\n── Step 2 data:", JSON.stringify(step2, null, 2));

// ── Helpers ───────────────────────────────────────────────────────────────────
const DIR = path.join(__dirname, "idealista-screenshots", "fill");
fs.mkdirSync(DIR, { recursive: true });

let n = 0;
const shot = async (page, name) => {
  const f = path.join(DIR, `${String(n).padStart(2,"0")}-${name}.png`);
  await page.screenshot({ path: f, fullPage: true });
  console.log(`  📸 ${String(n).padStart(2,"0")}-${name}`);
  n++;
};
const d = ms => new Promise(r => setTimeout(r, ms));

const pickDropdown = async (page, triggerId, value) => {
  const trigger = page.locator(`#${triggerId}`);
  if (!await trigger.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`    ℹ #${triggerId} not visible — skipping`);
    return false;
  }
  await trigger.click();
  await d(500);
  const option = page.locator(`#${triggerId} li[data-value="${value}"]`);
  if (!await option.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`    ⚠ option [data-value="${value}"] not found in #${triggerId}`);
    await page.keyboard.press("Escape");
    return false;
  }
  await option.click();
  await d(400);
  console.log(`    ✓ ${triggerId} = ${value}`);
  return true;
};

// Check a checkbox by id (via JS click — span overlay pattern)
const checkIf = async (page, id, shouldCheck) => {
  const exists = await page.evaluate(id => !!document.querySelector(`#${id}`), id);
  if (!exists) return;
  if (shouldCheck) {
    const isChecked = await page.evaluate(id => document.querySelector(`#${id}`)?.checked, id);
    if (!isChecked) {
      await page.evaluate(id => document.querySelector(`#${id}`)?.click(), id);
      await d(200);
      console.log(`    ✓ ${id} checked`);
    }
  }
};

// Fill a text input by id if visible
const fillIf = async (page, id, value) => {
  if (!value) return;
  const el = page.locator(`#${id}`);
  if (!await el.isVisible({ timeout: 2000 }).catch(() => false)) return;
  await el.fill(String(value));
  await d(200);
  console.log(`    ✓ ${id} = ${value}`);
};

// Dump all form fields (for debugging)
const dumpForm = async (page) => {
  const fields = await page.evaluate(() =>
    [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].map(el => ({
      tag: el.tagName.toLowerCase(), type: el.type||"", name: el.name||"", id: el.id||"",
      ph: el.placeholder||"", req: el.required,
    }))
  );
  fields.forEach(f => console.log(`    <${f.tag} type="${f.type}" name="${f.name}" id="${f.id}" ph="${f.ph}">${f.req?" [req]":""}`));
  const headings = await page.evaluate(() =>
    [...document.querySelectorAll("h1,h2,h3,h4,legend")].map(e=>e.innerText.trim().slice(0,100)).filter(Boolean).slice(0,8)
  );
  if (headings.length) console.log("  Headings:", headings);
};

// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log("\nConnecting to Chrome on port 9222…");
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

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
    await page.locator("input[type=password]").first().type(PASSWORD, { delay: 80 });
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

  // 1a. Typology
  await pickDropdown(page, "qa_typology", step1.typology);
  await d(600);
  await shot(page, "02-step1-typology");

  // 1b. Operation
  await page.evaluate(id => document.querySelector(`#${id}`)?.click(), step1.operation);
  await d(400);
  console.log("    ✓ operation =", step1.operation);

  // 1c. Locality — try exact locality, fall back to municipality if no autocomplete
  const locInput = page.locator("#ca-geo-locality");
  await locInput.click(); await d(200);
  await locInput.fill("");
  await locInput.type(step1.locality, { delay: 80 });
  await d(1800);

  let localityPicked = false;
  const sug = page.locator("[class*=autocomplete] li, [role=option], [class*=suggestion]").first();
  if (await sug.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sug.click();
    console.log("    ✓ locality =", step1.locality, "(autocomplete)");
    localityPicked = true;
  } else if (step1.localityFallback) {
    console.log("    ℹ No autocomplete for", step1.locality, "— trying", step1.localityFallback);
    await locInput.fill("");
    await locInput.type(step1.localityFallback, { delay: 80 });
    await d(1800);
    const sug2 = page.locator("[class*=autocomplete] li, [role=option], [class*=suggestion]").first();
    if (await sug2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sug2.click();
      console.log("    ✓ locality =", step1.localityFallback, "(fallback autocomplete)");
      localityPicked = true;
    } else {
      await page.keyboard.press("ArrowDown"); await d(200); await page.keyboard.press("Enter");
      console.log("    ✓ locality =", step1.localityFallback, "(keyboard)");
      localityPicked = true;
    }
  } else {
    await page.keyboard.press("ArrowDown"); await d(200); await page.keyboard.press("Enter");
    console.log("    ✓ locality = (keyboard enter)");
    localityPicked = true;
  }
  await d(600);

  // 1d. Street (only if visible and we have a street value)
  if (step1.street) {
    const streetInput = page.locator("#ca-geo-address");
    if (await streetInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await streetInput.fill("");
      await streetInput.type(step1.street, { delay: 80 });
      await d(1800);
      const ss = page.locator("[class*=autocomplete] li, [role=option]").first();
      if (await ss.isVisible({ timeout: 3000 }).catch(() => false)) {
        await ss.click();
        console.log("    ✓ street =", step1.street, "(autocomplete)");
      } else {
        await streetInput.press("Enter");
        console.log("    ✓ street =", step1.street);
      }
      await d(600);
    }
  }

  // 1e. Street number
  if (step1.streetNumber) {
    const numInput = page.locator("#ca-geo-number");
    if (await numInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await numInput.fill(step1.streetNumber);
      await d(300);
      console.log("    ✓ number =", step1.streetNumber);
    }
  }

  // 1f. Verify address
  await shot(page, "03-step1-address-filled");
  const verifyBtn = page.locator("#ca-geo-validate");
  if (await verifyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await verifyBtn.click();
    console.log("    ✓ Verificar morada clicked");
    await d(3000);
    await shot(page, "04-step1-address-verified");

    const confirmBtn = page.locator('button:has-text("Confirmar morada"), a:has-text("Confirmar morada")');
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      console.log("    ✓ Confirmed address on map modal");
      await d(2000);
      await shot(page, "04b-step1-address-confirmed");
    }
  }
  console.log("  URL after verify:", page.url());

  // 1g. Floor — COUNTRYHOUSE typically doesn't have this, but handle if present
  const floorTrigger = page.locator('[id="qa_address.floorNumber"]');
  if (await floorTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
    await floorTrigger.click(); await d(400);
    await page.locator('[id="qa_address.floorNumber"] li[data-value="bj"]').click();
    await d(400);
    console.log("    ✓ floor = bj (rés do chão) [apartment-only field]");
  }

  // 1g2. Door — COUNTRYHOUSE: door widget typically absent; handle if present
  const doorBtn = page.locator('.qa_doorselect button.dropdown-wrapper');
  if (await doorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await doorBtn.click(); await d(400);
    await page.locator('.qa_doorselect li[data-value="pu"]').click();
    await d(400);
    console.log("    ✓ door = pu (Porta única)");
  }

  // 1g3. hasBlock — apartment-only; handle if present
  const hasBlockRadios = await page.evaluate(() => document.querySelectorAll('input[name="hasBlock"]').length);
  if (hasBlockRadios > 0) {
    await page.evaluate(() => {
      const noRadio = [...document.querySelectorAll('input[name="hasBlock"]')].find(r => r.value === "no");
      if (noRadio) noRadio.click();
    });
    await d(300);
    console.log("    ✓ hasBlock = no");
  }

  // 1h. Phone widget
  await page.waitForFunction(
    () => {
      const w = document.querySelector(".phone-code_input");
      return w && w.offsetWidth > 0 && w.offsetHeight > 0;
    },
    { timeout: 15000 }
  ).catch(() => console.log("    ⚠ .phone-code_input wait timed out"));

  await page.locator(".phone-code_input").first().scrollIntoViewIfNeeded().catch(() => {});
  await d(600);
  await shot(page, "05-step1-contact");

  // Fill phone if contact has one
  if (step1.phone) {
    const phoneWidget = page.locator(".phone-code_input").first();
    if (await phoneWidget.isVisible({ timeout: 3000 }).catch(() => false)) {
      await phoneWidget.click(); await d(200);
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Delete");
      await d(200);
      await phoneWidget.type(step1.phone, { delay: 80 });
      await d(500);
    }
    // Force backing inputs via JS
    await page.evaluate(({ phone, prefix }) => {
      const ph = document.querySelector("#ca-contact-phone1");
      if (ph) { ph.value = phone; ph.dispatchEvent(new Event("input", { bubbles: true })); ph.dispatchEvent(new Event("change", { bubbles: true })); }
      const pfx = document.querySelector("#ca-international-prefix");
      if (pfx) { pfx.value = prefix; pfx.dispatchEvent(new Event("input", { bubbles: true })); pfx.dispatchEvent(new Event("change", { bubbles: true })); }
    }, { phone: step1.phone, prefix: step1.phonePrefix });
    const [pv, pfv] = await page.evaluate(() => [
      document.querySelector("#ca-contact-phone1")?.value ?? "",
      document.querySelector("#ca-international-prefix")?.value ?? "",
    ]);
    console.log(`    ✓ phone = "${pv}" prefix = "${pfv}"`);
  } else {
    console.log("    ℹ No phone in fixture — skipping phone field");
    // If no phone, pick chat-only contact method
    const chatRadioId = step1.contactMethod === "only-phone-radio-button" ? "only-phone-radio-button" : "only-chat-radio-button";
    await page.evaluate(id => document.querySelector(`#${id}`)?.click(), chatRadioId).catch(() => {});
  }

  // 1i. Name
  const nameInput = page.locator("#ca-contact-name");
  if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nameInput.fill(step1.name);
    await d(300);
    console.log("    ✓ name =", step1.name);
  }

  // 1j. Contact method radio
  await page.evaluate(id => document.querySelector(`#${id}`)?.click(), step1.contactMethod).catch(() => {});
  await d(300);
  console.log("    ✓ contactMethod =", step1.contactMethod);

  // 1k. Email fields
  const emailInput = page.locator("#ca-login-email");
  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    const existing = await emailInput.inputValue();
    if (!existing) {
      await emailInput.fill(step1.email);
      console.log("    ✓ email =", step1.email);
    } else {
      console.log("    ℹ email already filled:", existing);
    }
  }
  // Force email-confirm (CSS-hidden)
  await page.evaluate(email => {
    const el = document.querySelector("#ca-login-repeat-email");
    if (el) { el.value = email; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
  }, step1.email);
  const confirmVal = await page.evaluate(() => document.querySelector("#ca-login-repeat-email")?.value ?? "");
  console.log("    ✓ email-confirm forced =", confirmVal);

  // 1l. Privacy policy
  const privacyExists = await page.evaluate(() => !!document.querySelector("#privacyPolicyAccepted1"));
  if (privacyExists) {
    const checked = await page.evaluate(() => document.querySelector("#privacyPolicyAccepted1").checked);
    if (!checked) await page.evaluate(() => document.querySelector("#privacyPolicyAccepted1").click());
    await d(300);
    console.log("    ✓ privacy policy accepted");
  }

  await shot(page, "06-step1-filled");

  // Dump all form values before submit
  const allVals = await page.evaluate(() =>
    [...document.querySelectorAll("input[name], select[name], textarea[name]")]
      .map(el => ({ name: el.name, id: el.id, type: el.type, value: el.value, checked: el.checked ?? null }))
      .filter(f => f.name)
  );
  console.log("  All form values:", JSON.stringify(allVals, null, 2));

  // POST capture
  const capturedPost = [];
  page.on("request", req => {
    if (req.method() === "POST" && req.url().includes("/flow/")) {
      capturedPost.push({ url: req.url(), body: req.postData() });
    }
  });

  // 1m. Submit step 1
  console.log("\n  Submitting step 1…");
  await page.evaluate(() => document.querySelector("#ca-button-continue").scrollIntoView());
  await d(500);
  await shot(page, "06b-step1-submit-visible");
  await page.evaluate(() => document.querySelector("#ca-button-continue").click());
  await d(5000);

  if (capturedPost.length) {
    console.log("  POST captured:", capturedPost[0].url);
    console.log("  Body:", capturedPost[0].body);
  } else {
    console.log("  ℹ No POST captured — check for validation errors");
  }

  const step1Errors = await page.evaluate(() => {
    const errs = [];
    document.querySelectorAll("[class*='error'], [class*='invalid'], .has-error").forEach(e => {
      const t = e.innerText?.trim();
      if (t && t.length > 1 && t.length < 300) {
        const inp = (e.closest(".item-form, .form-group, label") || e.parentElement)?.querySelector("input, select, textarea");
        errs.push({ text: t, field: inp?.name || inp?.id || "?" });
      }
    });
    return [...new Map(errs.map(e => [e.text, e])).values()];
  });
  if (step1Errors.length) console.log("  ⚠ Step 1 errors:", JSON.stringify(step1Errors, null, 2));

  await shot(page, "07-step1-submitted");
  console.log("  URL:", page.url());

  // ── Cost notice ("Este anúncio terá um custo") ────────────────────────────
  const costNotice = await page.evaluate(() =>
    [...document.querySelectorAll("h1,h2,h3,h4")].some(h => h.innerText?.includes("terá um custo"))
  );
  if (costNotice) {
    console.log("\n══ INTERMEDIATE: Cost notice — clicking Ok, entendido");
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("input[type=submit], button[type=submit]")]
        .find(b => (b.value || b.innerText || "").toLowerCase().includes("entendido"));
      if (btn) btn.click();
    });
    await d(3000);
    console.log("  ✓ Cost notice dismissed. URL:", page.url());
    await shot(page, "07c-cost-notice-dismissed");
  }

  // ── Phone conflict page ───────────────────────────────────────────────────
  const phoneConflict = page.locator("#ca-radio-continue");
  if (await phoneConflict.isVisible({ timeout: 4000 }).catch(() => false)) {
    console.log("\n══ INTERMEDIATE: Phone conflict — selecting continue");
    await page.evaluate(() => document.querySelector("#ca-radio-continue").click());
    await d(600);
    await page.waitForFunction(() => {
      const btn = document.querySelector("#ca-continue");
      return btn && !btn.disabled;
    }, { timeout: 10000 });
    await page.evaluate(() => document.querySelector("#ca-continue").click());
    await d(4000);
    console.log("  ✓ Phone conflict dismissed. URL:", page.url());
    await shot(page, "07b-phone-conflict-dismissed");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Detalhes
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n══ STEP 2: Detalhes");
  await shot(page, "08-step2-blank");
  console.log("  URL:", page.url());
  console.log("  Fields:");
  await dumpForm(page);

  // Constructed area
  await fillIf(page, "constructedArea", step2.constructedArea);

  // Usable area (optional)
  await fillIf(page, "usableArea", step2.usableArea);

  // Lot size (for country house / land)
  await fillIf(page, "lotSize", step2.lotSize);
  // Some Idealista forms use a different id for tereno/plot:
  await fillIf(page, "plotArea", step2.lotSize);

  // Condition (required radio)
  await page.evaluate(id => document.querySelector(`#${id}`)?.click(), step2.builtTypeId);
  await d(300);
  console.log("    ✓ builtType =", step2.builtTypeId);

  // Rooms
  await fillIf(page, "roomNumber", step2.roomNumber);

  // Bathrooms
  await fillIf(page, "bathNumber", step2.bathNumber);

  // Energy certificate
  if (await pickDropdown(page, "qa_portugalEnergeticClass", step2.energyCertValue) === false) {
    console.log("    ℹ Energy cert dropdown not found or value missing");
  }

  // Lift (may not appear for COUNTRYHOUSE)
  const liftExists = await page.evaluate(id => !!document.querySelector(`#${id}`), step2.hasLiftId);
  if (liftExists) {
    await page.evaluate(id => document.querySelector(`#${id}`)?.click(), step2.hasLiftId);
    await d(300);
    console.log("    ✓ hasLift =", step2.hasLiftId);
  } else {
    console.log("    ℹ hasLift field not present (COUNTRYHOUSE)");
  }

  // Heating type
  if (step2.heatingType) {
    await pickDropdown(page, "qa_heatingType", step2.heatingType);
    await d(300);
    if (step2.individualHeat) {
      await pickDropdown(page, "qa_individualHeatingType", step2.individualHeat);
    }
    if (step2.centralHeat) {
      await pickDropdown(page, "qa_centralHeatingType", step2.centralHeat);
    }
  }

  // Occupancy (required radio)
  const occExists = await page.evaluate(id => !!document.querySelector(`#${id}`), step2.occupancyId);
  if (occExists) {
    await page.evaluate(id => document.querySelector(`#${id}`)?.click(), step2.occupancyId);
    await d(300);
    const occVal = await page.evaluate(id => {
      const r = document.querySelector(`#${id}`);
      return r ? { value: r.value, checked: r.checked } : null;
    }, step2.occupancyId);
    console.log("    ✓ occupancy =", JSON.stringify(occVal));
  } else {
    // Try clicking the first occupancy radio if the expected id doesn't exist
    console.log("    ⚠ Occupancy id", step2.occupancyId, "not found — trying currentOccupationType2");
    await page.evaluate(() => document.querySelector("#currentOccupationType2")?.click());
    await d(300);
  }

  // Price (required)
  await fillIf(page, "ca-price", step2.price);

  // Orientation checkboxes
  await checkIf(page, "hasNorthOrientation1", step2.facesNorth);
  await checkIf(page, "hasSouthOrientation1", step2.facesSouth);
  await checkIf(page, "hasEastOrientation1",  step2.facesEast);
  await checkIf(page, "hasWestOrientation1",  step2.facesWest);

  // Feature checkboxes
  await checkIf(page, "hasTerrace1",              step2.hasTerrace);
  await checkIf(page, "hasBalcony1",              step2.hasBalcony);
  await checkIf(page, "hasGarden",               step2.hasGarden);
  await checkIf(page, "hasSwimmingPool1",         step2.hasPool);
  await checkIf(page, "hasWardrobe1",             step2.hasWardrobe);
  await checkIf(page, "hasAirConditioning1",      step2.hasAirConditioning);
  await checkIf(page, "hasBoxRoom1",              step2.hasStorage);
  await checkIf(page, "hasHandicapAdaptedAccess1",step2.hasHandicapAccess);

  // Parking
  if (step2.hasParking) {
    await checkIf(page, "checkboxspace", true);
    await d(400);
    // After checking parking, price-inclusion radio appears
    if (step2.parkingInPrice) {
      const piExists = await page.evaluate(() => !!document.querySelector("#ca-parking-in-price"));
      if (piExists) {
        await page.evaluate(() => document.querySelector("#ca-parking-in-price").click());
        await d(300);
        console.log("    ✓ parking included in price");
      }
    }
  }

  // Year built (optional)
  await fillIf(page, "constructionYear", step2.constructionYear);

  // Description (optional textarea — name="websiteComment.propertyComment")
  if (step2.description) {
    const descSel = page.locator('[name="websiteComment.propertyComment"], #description, textarea[name*="comment"]').first();
    if (await descSel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await descSel.fill(step2.description.slice(0, 2000));
      await d(300);
      console.log("    ✓ description filled (" + Math.min(step2.description.length, 2000) + " chars)");
    } else {
      console.log("    ℹ Description textarea not visible");
    }
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await d(600);
  await shot(page, "09-step2-filled");
  console.log("  Fields after fill:");
  await dumpForm(page);

  // Submit step 2
  console.log("\n  Submitting step 2…");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("input[type=submit], button[type=submit]")]
      .find(b => (b.value || b.innerText || "").toLowerCase().includes("continuar"));
    if (btn) btn.click();
    else throw new Error("Step 2 submit button not found");
  });
  await d(5000);

  const step2Errors = await page.evaluate(() => {
    const errs = [];
    document.querySelectorAll("[class*='error'], [class*='invalid'], .has-error").forEach(e => {
      const t = e.innerText?.trim();
      if (t && t.length > 1 && t.length < 300) {
        const inp = (e.closest(".item-form, .form-group, label") || e.parentElement)?.querySelector("input, select, textarea");
        errs.push({ text: t, field: inp?.name || inp?.id || "?" });
      }
    });
    return [...new Map(errs.map(e => [e.text, e])).values()];
  });
  if (step2Errors.length) console.log("  ⚠ Step 2 errors:", JSON.stringify(step2Errors, null, 2));

  await shot(page, "10-step2-submitted");
  console.log("  URL:", page.url());

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Fotos
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n══ STEP 3: Fotos");
  await shot(page, "11-step3");
  console.log("  URL:", page.url());
  console.log("  Fields:");
  await dumpForm(page);

  console.log("\n  ⛔ Stopping here — step 3 is photo upload. Submitting would PUBLISH the listing.");
  console.log("  To upload photos and publish: implement photo upload in a separate script.");
  console.log("\n✅ Fill complete. Screenshots:", DIR);

  await page.close();
  await browser.close();
})().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
