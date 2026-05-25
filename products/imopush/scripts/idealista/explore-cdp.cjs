// Connects to the already-running Chrome (started with --remote-debugging-port=9222)
// and explores Idealista using the real logged-in session.
const { chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const EMAIL = "eduardoferdcarvalho+agency@gmail.com";
const PASSWORD = "Teste1234_@";
const SCREENSHOTS = path.join(__dirname, "idealista-screenshots");
fs.mkdirSync(SCREENSHOTS, { recursive: true });

async function shot(page, name) {
  const p = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name}`);
}

(async () => {
  console.log("Connecting to Chrome on port 9222…");
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  console.log("  Connected!");

  // Use existing context (with real cookies) or create a new one
  const contexts = browser.contexts();
  const ctx = contexts.length > 0 ? contexts[0] : await browser.newContext();
  const page = await ctx.newPage();

  // ── 1. Homepage ──────────────────────────────────────────────────────────
  console.log("\n── 1. Homepage");
  await page.goto("https://www.idealista.pt", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot(page, "cdp01-homepage");
  console.log("  Title:", await page.title());
  console.log("  URL:", page.url());

  const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 200));
  console.log("  Body:", bodySnippet);

  // Accept cookies
  try {
    const cookieBtn = page.locator("#didomi-notice-agree-button, button:has-text('Aceitar')");
    if (await cookieBtn.first().isVisible({ timeout: 3000 })) {
      await cookieBtn.first().click();
      console.log("  ✓ Cookies accepted");
      await page.waitForTimeout(1000);
    }
  } catch {}
  await shot(page, "cdp02-homepage-clean");

  // ── 2. Login ─────────────────────────────────────────────────────────────
  console.log("\n── 2. Login");
  await page.goto("https://www.idealista.pt/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, "cdp03-login");
  console.log("  URL:", page.url());

  // Check if already logged in (redirected away from /login)
  const isLoggedIn = !page.url().includes("/login");
  console.log("  Already logged in:", isLoggedIn);

  if (!isLoggedIn) {
    const hasEmail = await page.locator('input[type="email"], input[name="email"], input[id="email"]').count() > 0;
    console.log("  Has email field:", hasEmail);

    if (hasEmail) {
      console.log("\n── 3. Step 1 — enter email");
      const emailInput = page.locator('input[type="email"], input[name="email"], input[id="email"]').first();
      await emailInput.click();
      await page.waitForTimeout(300 + Math.random() * 200);
      await emailInput.type(EMAIL, { delay: 80 + Math.random() * 40 });
      await page.waitForTimeout(500 + Math.random() * 300);
      await shot(page, "cdp04-email-filled");

      // Click "Continuar" to proceed to password step
      await page.locator('button:has-text("Continuar"), button[type="submit"]').first().click();
      console.log("  Clicked Continuar, waiting for password field…");
      await page.waitForSelector('input[type="password"]', { timeout: 15000 });
      await page.waitForTimeout(500 + Math.random() * 300);
      await shot(page, "cdp05-password-step");

      console.log("── 3b. Step 2 — enter password");
      const passInput = page.locator('input[type="password"]').first();
      await passInput.click();
      await page.waitForTimeout(200 + Math.random() * 200);
      await passInput.type(PASSWORD, { delay: 80 + Math.random() * 40 });
      await page.waitForTimeout(500 + Math.random() * 400);
      await shot(page, "cdp06-password-filled");

      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(5000);
      await shot(page, "cdp07-after-login");
      console.log("  URL after login:", page.url());
    } else {
      const loginBody = await page.evaluate(() => document.body.innerText.substring(0, 600));
      console.log("  No email field. Body:", loginBody);
      await shot(page, "cdp04-login-body");
    }
  } else {
    await shot(page, "cdp04-already-logged-in");
  }

  // ── 3. My area ────────────────────────────────────────────────────────────
  console.log("\n── 4. My area");
  await page.goto("https://www.idealista.pt/minha-area/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, "cdp08-my-area");
  console.log("  URL:", page.url());

  const myAreaText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log("  Content:", myAreaText);

  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map(a => ({ text: a.innerText.trim().slice(0, 60), href: a.href }))
      .filter(l => l.text && !l.href.startsWith("javascript"))
      .slice(0, 30)
  );
  links.forEach(l => console.log(`  "${l.text}" → ${l.href}`));

  // ── 4. Novo anúncio ────────────────────────────────────────────────────────
  console.log("\n── 5. Novo anúncio");
  await page.goto("https://www.idealista.pt/info/novo-anuncio", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, "cdp09-novo-anuncio");
  console.log("  URL:", page.url());
  const anunciarText = await page.evaluate(() => document.body.innerText.substring(0, 800));
  console.log("  Content:", anunciarText);

  const formFields = await page.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea")]
      .map(el => ({ tag: el.tagName, type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }))
  );
  if (formFields.length) {
    console.log("  Form fields:");
    formFields.forEach(f => console.log(`    <${f.tag.toLowerCase()} type="${f.type}" name="${f.name}" id="${f.id}">`));
  }

  await shot(page, "cdp10-novo-anuncio-detail");

  console.log(`\n✅ Done. Screenshots: ${SCREENSHOTS}`);
  await page.close();
  await browser.close();
})().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
