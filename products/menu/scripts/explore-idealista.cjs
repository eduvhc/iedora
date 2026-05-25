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
  console.log(`📸 ${name} → ${p}`);
}

(async () => {
  console.log("Launching browser…");
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "pt-PT",
  });

  // Intercept API calls
  const apiCalls = [];
  ctx.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/") || url.includes("graphql") || url.endsWith(".json")) {
      apiCalls.push(`${req.method()} ${url}`);
    }
  });

  const page = await ctx.newPage();

  // ── 1. Homepage ─────────────────────────────────────────────────────────
  console.log("\n── 1. Homepage");
  await page.goto("https://www.idealista.pt", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, "01-homepage");
  console.log("  Title:", await page.title());

  // Accept cookies
  try {
    const cookie = page.locator("#didomi-notice-agree-button, button:has-text('Aceitar tudo'), button:has-text('Aceitar')");
    if (await cookie.first().isVisible({ timeout: 3000 })) {
      await cookie.first().click();
      console.log("  ✓ Cookies accepted");
      await page.waitForTimeout(1000);
    }
  } catch {}

  // ── 2. Navigate to login ─────────────────────────────────────────────────
  console.log("\n── 2. Login page");
  await page.goto("https://www.idealista.pt/areas/login/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, "02-login-page");
  console.log("  URL:", page.url());

  // Print all input fields to understand the form
  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll("input")].map((i) => ({
      type: i.type,
      name: i.name,
      id: i.id,
      placeholder: i.placeholder,
    }))
  );
  console.log("  Inputs found:", JSON.stringify(inputs, null, 2));

  // ── 3. Fill & submit ─────────────────────────────────────────────────────
  console.log("\n── 3. Filling credentials");
  const emailSel = 'input[type="email"], input[name="email"], input[id*="email"], input[name="username"]';
  const passSel = 'input[type="password"]';

  const emailVisible = await page.locator(emailSel).first().isVisible({ timeout: 5000 }).catch(() => false);
  if (emailVisible) {
    await page.locator(emailSel).first().fill(EMAIL);
    await page.locator(passSel).first().fill(PASSWORD);
    await shot(page, "03-credentials-filled");
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    await shot(page, "04-after-submit");
    console.log("  Post-login URL:", page.url());
  } else {
    console.log("  ⚠ No email field — dumping page HTML snippet");
    const html = await page.content();
    console.log(html.substring(0, 2000));
  }

  // ── 4. My area / dashboard ───────────────────────────────────────────────
  console.log("\n── 4. My area");
  await page.goto("https://www.idealista.pt/areas/minha-area/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, "05-my-area");
  console.log("  URL:", page.url());

  // Get all links on the page for navigation mapping
  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => ({ text: a.innerText.trim().substring(0, 50), href: a.getAttribute("href") }))
      .filter((l) => l.text && l.href && !l.href.startsWith("javascript"))
      .slice(0, 40)
  );
  console.log("  Links on my-area page:");
  links.forEach((l) => console.log(`    "${l.text}" → ${l.href}`));

  // ── 5. Publish/anunciar flow ──────────────────────────────────────────────
  console.log("\n── 5. Publish flow");
  const publishUrls = [
    "https://www.idealista.pt/areas/anunciar/",
    "https://www.idealista.pt/anunciar/",
    "https://www.idealista.pt/areas/minha-area/anuncios/",
  ];
  for (const url of publishUrls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(1500);
      const finalUrl = page.url();
      console.log(`  ${url} → ${finalUrl}`);
      await shot(page, `06-publish-${url.split("/").filter(Boolean).pop()}`);
    } catch (e) {
      console.log(`  ${url} → ERROR: ${e.message}`);
    }
  }

  // ── 6. API calls summary ─────────────────────────────────────────────────
  if (apiCalls.length > 0) {
    console.log("\n── 6. API calls intercepted:");
    [...new Set(apiCalls)].forEach((c) => console.log(`  ${c}`));
  }

  console.log(`\n✅ Done. Screenshots: ${SCREENSHOTS}`);
  await browser.close();
})().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
