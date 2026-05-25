const { addExtra } = require("C:/Users/eduvhc/AppData/Local/Temp/idealista-probe/node_modules/playwright-extra");
const StealthPlugin = require("C:/Users/eduvhc/AppData/Local/Temp/idealista-probe/node_modules/puppeteer-extra-plugin-stealth");
const { chromium: baseChromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const chromium = addExtra(baseChromium);
chromium.use(StealthPlugin());

chromium.use(StealthPlugin());

const EMAIL = "eduardoferdcarvalho+agency@gmail.com";
const PASSWORD = "Teste1234_@";
const SCREENSHOTS = path.join(__dirname, "idealista-screenshots");
fs.mkdirSync(SCREENSHOTS, { recursive: true });

async function shot(page, name) {
  const p = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name}`);
  return p;
}

(async () => {
  // Copy the real Chrome profile to a temp location so we can use it without
  // Chrome locking the original. This gives us real cookies incl. DataDome.
  const REAL_PROFILE = "C:\\Users\\eduvhc\\AppData\\Local\\Google\\Chrome\\User Data";
  const TEMP_PROFILE = "C:\\Users\\eduvhc\\AppData\\Local\\Temp\\idealista-chrome-profile";

  if (fs.existsSync(TEMP_PROFILE)) {
    fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  }
  console.log("Copying Chrome profile…");
  let copied = 0, skipped = 0;
  function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      // Skip heavy dirs we don't need
      if (entry.isDirectory() && ["GPUCache","ShaderCache","GrShaderCache","GraphiteDawnCache","Code Cache","Cache"].includes(entry.name)) continue;
      if (entry.isDirectory()) { copyDir(s, d); }
      else {
        try { fs.copyFileSync(s, d); copied++; }
        catch { skipped++; } // locked by Chrome — skip
      }
    }
  }
  // Only copy Default + Local State
  copyDir(path.join(REAL_PROFILE, "Default"), path.join(TEMP_PROFILE, "Default"));
  try { fs.copyFileSync(path.join(REAL_PROFILE, "Local State"), path.join(TEMP_PROFILE, "Local State")); } catch {}
  console.log(`  Copied ${copied} files, skipped ${skipped} locked.`);

  console.log("Launching browser with real Chrome profile…");
  // Must use launchPersistentContext when passing userDataDir
  const ctx = await chromium.launchPersistentContext(TEMP_PROFILE, {
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--profile-directory=Default",
      "--disable-blink-features=AutomationControlled",
    ],
    viewport: { width: 1280, height: 900 },
    locale: "pt-PT",
    timezoneId: "Europe/Lisbon",
  });

  const browser = ctx; // launchPersistentContext returns a BrowserContext directly
  const page = await ctx.newPage();

  // ── 1. Homepage ──────────────────────────────────────────────────────────
  console.log("\n── 1. Homepage");
  await page.goto("https://www.idealista.pt", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot(page, "s01-homepage");
  console.log("  Title:", await page.title());
  console.log("  URL:", page.url());

  // Is DataDome still present?
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
  console.log("  Body snippet:", bodyText);

  // Accept cookies
  try {
    const cookie = page.locator("#didomi-notice-agree-button, button:has-text('Aceitar'), button:has-text('Accept')");
    if (await cookie.first().isVisible({ timeout: 4000 })) {
      await cookie.first().click();
      console.log("  ✓ Cookies accepted");
      await page.waitForTimeout(1500);
    }
  } catch {}

  await shot(page, "s02-homepage-after-cookies");

  // ── 2. Login ─────────────────────────────────────────────────────────────
  console.log("\n── 2. Login");
  await page.goto("https://www.idealista.pt/areas/login/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot(page, "s03-login");
  console.log("  URL:", page.url());
  console.log("  Title:", await page.title());

  // Check for DataDome
  const loginBody = await page.evaluate(() => document.body.innerText.substring(0, 300));
  console.log("  Body:", loginBody);

  const hasEmailField = await page.locator('input[type="email"], input[name="email"]').count() > 0;
  console.log("  Has email field:", hasEmailField);

  if (hasEmailField) {
    // ── 3. Fill credentials ───────────────────────────────────────────────
    console.log("\n── 3. Filling credentials");
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.waitForTimeout(500);
    await shot(page, "s04-filled");
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await page.waitForTimeout(4000);
    await shot(page, "s05-after-login");
    console.log("  Post-login URL:", page.url());

    // ── 4. Explore dashboard ─────────────────────────────────────────────
    console.log("\n── 4. Dashboard / My area");
    await page.goto("https://www.idealista.pt/areas/minha-area/", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, "s06-my-area");
    console.log("  URL:", page.url());

    const links = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map(a => ({ text: a.innerText.trim().slice(0, 60), href: a.href }))
        .filter(l => l.text && l.href && !l.href.startsWith("javascript"))
        .slice(0, 30)
    );
    console.log("  Links:");
    links.forEach(l => console.log(`    "${l.text}" → ${l.href}`));

    // ── 5. Anunciar flow ─────────────────────────────────────────────────
    console.log("\n── 5. Anunciar (create listing)");
    await page.goto("https://www.idealista.pt/areas/anunciar/", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, "s07-anunciar");
    console.log("  URL:", page.url());

    const anunciarBody = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log("  Body:", anunciarBody);

    // Check form fields
    const formFields = await page.evaluate(() =>
      [...document.querySelectorAll("input, select, textarea")]
        .map(el => ({ tag: el.tagName, type: el.type || "", name: el.name, id: el.id, placeholder: el.placeholder }))
    );
    if (formFields.length) {
      console.log("  Form fields:");
      formFields.forEach(f => console.log(`    <${f.tag.toLowerCase()} type="${f.type}" name="${f.name}" id="${f.id}" placeholder="${f.placeholder}">`));
    }

    await shot(page, "s08-anunciar-detail");
  } else {
    console.log("  ⚠ DataDome still blocking. Login form not accessible.");
    // Dump cookies for debugging
    const cookies = await ctx.cookies();
    console.log("  Cookies:", cookies.map(c => `${c.name}=${c.value.slice(0,20)}…`).join(", "));
  }

  console.log(`\n✅ Done. Screenshots saved to: ${SCREENSHOTS}`);
  await ctx.close();
})().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
