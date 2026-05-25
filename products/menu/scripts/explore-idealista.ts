import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";

const EMAIL = "eduardoferdcarvalho+agency@gmail.com";
const PASSWORD = "Teste1234_@";

const SCREENSHOTS = path.join(import.meta.dir, "idealista-screenshots");
fs.mkdirSync(SCREENSHOTS, { recursive: true });

async function shot(page: any, name: string) {
  const p = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name}`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 900 },
  locale: "pt-PT",
});
const page = await ctx.newPage();

// ── 1. Homepage ──────────────────────────────────────────────────────────────
console.log("\n── 1. Homepage");
await page.goto("https://www.idealista.pt", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await shot(page, "01-homepage");

// Accept cookies if present
const cookieBtn = page.locator(
  "button:has-text('Aceitar'), button:has-text('Accept'), #didomi-notice-agree-button"
);
if (await cookieBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
  await cookieBtn.first().click();
  console.log("  ✓ Cookies accepted");
  await page.waitForTimeout(1000);
}

// ── 2. Find login link ────────────────────────────────────────────────────────
console.log("\n── 2. Looking for login");
await shot(page, "02-before-login");

const loginLink = page.locator(
  "a[href*='login'], a[href*='acesso'], button:has-text('Entrar'), a:has-text('Entrar'), a:has-text('Iniciar sessão')"
);
const loginVisible = await loginLink
  .first()
  .isVisible({ timeout: 4000 })
  .catch(() => false);

if (loginVisible) {
  console.log("  ✓ Login link found, clicking…");
  await loginLink.first().click();
  await page.waitForTimeout(2000);
  await shot(page, "03-login-page");
} else {
  console.log("  ⚠ No login link visible, navigating directly…");
  await page.goto("https://www.idealista.pt/areas/login/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);
  await shot(page, "03-login-page-direct");
}

// ── 3. Fill credentials ───────────────────────────────────────────────────────
console.log("\n── 3. Filling credentials");
const emailField = page.locator(
  'input[type="email"], input[name="email"], input[id*="email"], input[name="username"]'
);
const passField = page.locator('input[type="password"]');

if (await emailField.first().isVisible({ timeout: 4000 }).catch(() => false)) {
  await emailField.first().fill(EMAIL);
  await passField.first().fill(PASSWORD);
  await shot(page, "04-credentials-filled");

  const submitBtn = page.locator(
    'button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")'
  );
  await submitBtn.first().click();
  await page.waitForTimeout(3000);
  await shot(page, "05-after-login");
  console.log(`  Current URL: ${page.url()}`);
} else {
  console.log("  ⚠ No email field found");
  await shot(page, "04-no-email-field");
}

// ── 4. Explore post-login area ───────────────────────────────────────────────
console.log("\n── 4. Post-login exploration");
const currentUrl = page.url();
console.log(`  URL: ${currentUrl}`);

// Look for "anunciar" / "publicar" / "add listing" links
const publishLinks = page.locator(
  "a[href*='anunciar'], a[href*='publicar'], a[href*='anunci'], a:has-text('Anunciar'), a:has-text('Publicar'), a:has-text('Novo anúncio')"
);
const publishCount = await publishLinks.count();
console.log(`  Found ${publishCount} publish-related links`);

if (publishCount > 0) {
  for (let i = 0; i < Math.min(publishCount, 3); i++) {
    const href = await publishLinks.nth(i).getAttribute("href");
    const text = await publishLinks.nth(i).innerText().catch(() => "");
    console.log(`    [${i}] "${text.trim()}" → ${href}`);
  }

  // Click the first one
  await publishLinks.first().click();
  await page.waitForTimeout(2000);
  await shot(page, "06-publish-flow");
  console.log(`  Publish URL: ${page.url()}`);

  // One more level deep
  await shot(page, "07-publish-detail");
}

// ── 5. Check for agency/pro area ─────────────────────────────────────────────
console.log("\n── 5. Agency/pro area");
const proLinks = page.locator(
  "a[href*='profissional'], a[href*='agencia'], a[href*='empresa'], a:has-text('Profissional'), a:has-text('Agência')"
);
const proCount = await proLinks.count();
if (proCount > 0) {
  for (let i = 0; i < Math.min(proCount, 3); i++) {
    const href = await proLinks.nth(i).getAttribute("href");
    const text = await proLinks.nth(i).innerText().catch(() => "");
    console.log(`    [${i}] "${text.trim()}" → ${href}`);
  }
}

// ── 6. Network requests snapshot ─────────────────────────────────────────────
console.log("\n── 6. Checking for API endpoints during page load…");
const apiCalls: string[] = [];
page.on("request", (req) => {
  const url = req.url();
  if (url.includes("/api/") || url.includes(".json") || url.includes("graphql")) {
    apiCalls.push(`${req.method()} ${url}`);
  }
});

// Navigate to dashboard/account area
await page.goto("https://www.idealista.pt/areas/minha-area/", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2000);
await shot(page, "08-my-area");
console.log(`  My-area URL: ${page.url()}`);

if (apiCalls.length > 0) {
  console.log("\n  API calls intercepted:");
  apiCalls.forEach((c) => console.log(`    ${c}`));
}

// Final state
await shot(page, "09-final");
console.log(`\n✅ Done. Screenshots saved to: ${SCREENSHOTS}`);

await browser.close();
