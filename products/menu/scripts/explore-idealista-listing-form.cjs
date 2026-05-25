// Walks every step of the Idealista listing creation form via CDP.
// Uses test data to advance through all 3 steps WITHOUT publishing.
// Stops before final photo upload submission.
const { chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const EMAIL = "eduardoferdcarvalho+agency@gmail.com";
const PASSWORD = "Teste1234_@";
const PHONE = "917140356";   // without country code
const PHONE_PREFIX = "351";  // PT
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

  // 1c. Locality — clear + type + pick first autocomplete suggestion
  const locInput = page.locator("#ca-geo-locality");
  await locInput.click(); await d(200);
  await locInput.fill("");           // clear any previous value
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

  // 1d. Street — clear + type
  const streetInput = page.locator("#ca-geo-address");
  if (await streetInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await streetInput.click(); await d(200);
    await streetInput.fill("");      // clear
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

  // 1e. Street number — clear + fill
  const numInput = page.locator("#ca-geo-number");
  if (await numInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await numInput.fill("100");
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
    await d(600);
    console.log("    ✓ floor = 1");
  }

  // 1g2. Door type — custom widget: div.qa_doorselect > button.dropdown-wrapper > li[data-value]
  await d(600);
  const doorBtn = page.locator('.qa_doorselect button.dropdown-wrapper');
  if (await doorBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await doorBtn.click(); await d(400);
    await page.locator('.qa_doorselect li[data-value="pu"]').click();
    await d(400);
    console.log("    ✓ door = pu (Porta única)");
  } else {
    console.log("    ℹ .qa_doorselect not found — skipping door");
  }

  // 1g3. hasBlock radio — no ids; select "no" (no building block)
  await page.evaluate(() => {
    const radios = document.querySelectorAll('input[name="hasBlock"]');
    const noRadio = [...radios].find(r => r.value === "no");
    if (noRadio) noRadio.click();
  });
  await d(300);
  console.log("    ✓ hasBlock = no");

  // 1h. Wait for .phone-code_input (the visible phone widget) to appear
  await page.waitForFunction(
    () => {
      const w = document.querySelector(".phone-code_input");
      return w && w.offsetWidth > 0 && w.offsetHeight > 0;
    },
    { timeout: 15000 }
  );
  await page.locator(".phone-code_input").first().scrollIntoViewIfNeeded();
  await d(600);
  await shot(page, "05-step1-contact");

  // 1i. Phone — fill via click+clear+type to ensure JS events fire and sync to backing input
  const phoneWidget = page.locator(".phone-code_input").first();
  await phoneWidget.click(); await d(200);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await d(200);
  await phoneWidget.type(PHONE, { delay: 80 });
  await d(500);
  // Force backing input + phone prefix via JS (widget doesn't sync on type())
  await page.evaluate(({ phone, prefix }) => {
    const ph = document.querySelector("#ca-contact-phone1");
    if (ph) {
      ph.value = phone;
      ph.dispatchEvent(new Event("input", { bubbles: true }));
      ph.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const pfx = document.querySelector("#ca-international-prefix");
    if (pfx) {
      pfx.value = prefix;
      pfx.dispatchEvent(new Event("input", { bubbles: true }));
      pfx.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, { phone: PHONE, prefix: PHONE_PREFIX });
  const [backingPhone2, prefix2] = await page.evaluate(() => [
    document.querySelector("#ca-contact-phone1")?.value ?? "",
    document.querySelector("#ca-international-prefix")?.value ?? "",
  ]);
  console.log(`    ✓ phone = "${backingPhone2}" prefix = "${prefix2}"`);

  // 1j. Name — clear + fill
  const nameInput = page.locator("#ca-contact-name");
  await nameInput.fill("Eduardo");
  await d(300);
  console.log("    ✓ name = Eduardo");

  // 1j2. Email — contact email fields (separate from login); fill both if visible
  const emailInput = page.locator("#ca-login-email");
  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    const existing = await emailInput.inputValue();
    if (!existing) {
      await emailInput.fill(EMAIL);
      console.log("    ✓ email = " + EMAIL);
    } else {
      console.log("    ℹ email already filled: " + existing);
    }
  }
  // Force email confirm via JS — it's in the DOM but CSS-hidden (isVisible() returns false)
  await page.evaluate((email) => {
    const el = document.querySelector("#ca-login-repeat-email");
    if (el) {
      el.value = email;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, EMAIL);
  const confirmVal = await page.evaluate(() => document.querySelector("#ca-login-repeat-email")?.value ?? "");
  console.log("    ✓ email confirm forced = " + confirmVal);

  // 1k. Privacy policy
  const privacyExists = await page.evaluate(() => !!document.querySelector("#privacyPolicyAccepted1"));
  if (privacyExists) {
    const isChecked = await page.evaluate(() => document.querySelector("#privacyPolicyAccepted1").checked);
    if (!isChecked) await page.evaluate(() => document.querySelector("#privacyPolicyAccepted1").click());
    await d(300);
    console.log("    ✓ privacy policy accepted");
  }

  await shot(page, "06-step1-filled");

  // 1l-pre. Dump ALL named inputs and their current values before submit
  const allInputVals = await page.evaluate(() =>
    [...document.querySelectorAll("input[name], select[name], textarea[name]")]
      .map(el => ({ name: el.name, id: el.id, type: el.type, value: el.value, checked: el.checked }))
      .filter(f => f.name)
  );
  console.log("  All form values before submit:", JSON.stringify(allInputVals));

  // 1l. Set up POST interception to capture submitted form data
  const capturedPost = [];
  page.on("request", req => {
    if (req.method() === "POST" && req.url().includes("/flow/")) {
      capturedPost.push({ url: req.url(), body: req.postData() });
    }
  });

  // Submit step 1 — scroll into view then JS click to bypass overlay
  console.log("\n  Submitting step 1…");
  await page.evaluate(() => document.querySelector("#ca-button-continue").scrollIntoView());
  await d(500);
  await shot(page, "06b-step1-submit-visible");
  await page.evaluate(() => document.querySelector("#ca-button-continue").click());
  await d(5000);

  if (capturedPost.length) {
    console.log("  POST captured:", JSON.stringify(capturedPost[0]));
  } else {
    console.log("  ℹ No POST captured — form may not have submitted");
  }

  // Check for post-submit errors — broad selector
  const postErrors = await page.evaluate(() => {
    const errs = [];
    document.querySelectorAll("[class*='error'], [class*='invalid'], .has-error, .alert-danger, .alert-error").forEach(e => {
      const text = e.innerText?.trim();
      if (!text || text.length > 300 || text.length < 2) return;
      const container = e.closest(".item-form, .form-group, label") || e.parentElement;
      const inp = container?.querySelector("input, select, textarea");
      errs.push({ text, field: inp?.name || inp?.id || "?", elCls: e.className?.slice(0, 80) });
    });
    // Deduplicate by text
    return [...new Map(errs.map(e => [e.text, e])).values()];
  });
  if (postErrors.length) console.log("  ⚠ Post-submit errors:", JSON.stringify(postErrors, null, 2));

  await shot(page, "07-step1-submitted");
  console.log("  URL:", page.url());

  // ══════════════════════════════════════════════════════════════════════════
  // INTERMEDIATE: "Este anúncio terá um custo" (cost notice — if it appears)
  // Single submit button "Ok, entendido", no id.
  // ══════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════
  // INTERMEDIATE: Phone conflict confirmation page (if it appears)
  // "Parece que já tiveste anúncios publicados com outros emails e o telefone …"
  // Select ca-radio-continue, wait for button to enable, then click Aceitar.
  // ══════════════════════════════════════════════════════════════════════════
  const phoneConflict = page.locator("#ca-radio-continue");
  if (await phoneConflict.isVisible({ timeout: 4000 }).catch(() => false)) {
    console.log("\n══ INTERMEDIATE: Phone conflict — selecting continue");
    await page.evaluate(() => document.querySelector("#ca-radio-continue").click());
    await d(600);
    // Wait for Aceitar to become enabled
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

  // Fill minimum required fields on step 2
  // Constructed area (m²)
  const areaInput = page.locator("#constructedArea");
  if (await areaInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await areaInput.fill("80");
    await d(300);
    console.log("    ✓ constructedArea = 80");
  }

  // Built type (condition) — required radio
  await page.evaluate(() => document.querySelector("#builtTypeId-good")?.click());
  await d(300);
  console.log("    ✓ builtType = good");

  // Rooms
  const roomInput = page.locator("#roomNumber");
  if (await roomInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await roomInput.fill("2");
    await d(300);
    console.log("    ✓ roomNumber = 2");
  }

  // Bathrooms
  const bathInput = page.locator("#bathNumber");
  if (await bathInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await bathInput.fill("1");
    await d(300);
    console.log("    ✓ bathNumber = 1");
  }

  // Energy certificate
  const energyTrigger = page.locator("#qa_portugalEnergeticClass");
  if (await energyTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
    await energyTrigger.click(); await d(400);
    await page.locator("#qa_portugalEnergeticClass li[data-value='unknown']").click();
    await d(400);
    console.log("    ✓ energeticClass = unknown");
  }

  // hasLift — required radio: hasLift1=yes / hasLift2=no
  await page.evaluate(() => document.querySelector("#hasLift2")?.click()); // no elevator
  await d(300);
  console.log("    ✓ hasLift = no");

  // currentOccupationType — required radio (vacant / occupied)
  await page.evaluate(() => document.querySelector("#currentOccupationType1")?.click());
  await d(300);
  const occVal = await page.evaluate(() => {
    const r = document.querySelector("#currentOccupationType1");
    return r ? { value: r.value, checked: r.checked } : null;
  });
  console.log("    ✓ currentOccupationType1 =", JSON.stringify(occVal));

  // Price — 320000 for 80m² in Lisboa avoids the soft "price seems low" warning
  const priceInput = page.locator("#ca-price");
  if (await priceInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await priceInput.fill("320000");
    await d(300);
    console.log("    ✓ price = 320000");
  }

  await shot(page, "09-step2-partial");

  // Scroll down to see all fields
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await d(600);
  await shot(page, "10-step2-scrolled");
  console.log("  Fields after scroll:");
  await dumpForm(page);

  // Submit step 2 — button text is "Continuar e importar fotos", no id
  const step2btn = page.locator('input[type=submit]:has-text("Continuar"), input[value*="Continuar"], input[value*="continuar"], input[type=submit]').last();
  const step2btnAlt = page.locator('input[type=submit]').filter({ hasText: /Continuar/i });
  const step2submit = page.evaluate(() => {
    // Find submit by value text
    const btn = [...document.querySelectorAll("input[type=submit]")].find(b => b.value?.toLowerCase().includes("continuar"));
    return btn?.id || btn?.value || null;
  });
  console.log("\n  Submitting step 2…");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("input[type=submit], button[type=submit]")]
      .find(b => (b.value || b.innerText || "").toLowerCase().includes("continuar"));
    if (btn) btn.click();
    else throw new Error("Step 2 submit button not found");
  });
  await d(5000);

  // Post-submit errors for step 2
  const step2Errors = await page.evaluate(() => {
    const errs = [];
    document.querySelectorAll("[class*='error'], [class*='invalid'], .has-error, .alert-danger").forEach(e => {
      const text = e.innerText?.trim();
      if (!text || text.length > 300 || text.length < 2) return;
      const container = e.closest(".item-form, .form-group, label") || e.parentElement;
      const inp = container?.querySelector("input, select, textarea");
      errs.push({ text, field: inp?.name || inp?.id || "?", cls: e.className?.slice(0, 60) });
    });
    return [...new Map(errs.map(e => [e.text, e])).values()];
  });
  if (step2Errors.length) console.log("  ⚠ Step 2 errors:", JSON.stringify(step2Errors, null, 2));

  await shot(page, "11-step2-submitted");
  console.log("  URL:", page.url());

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
