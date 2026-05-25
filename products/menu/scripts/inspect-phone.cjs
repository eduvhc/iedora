const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Use last execution that has the form with address confirmed
  await page.goto("https://www.idealista.pt/flow/novo-anuncio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Dump HTML around the phone section
  const html = await page.evaluate(() => {
    const phone = document.querySelector("#ca-contact-phone1");
    if (!phone) return "not found";
    // Go up a few levels to find the custom wrapper
    return phone.closest(".form-group, .item-form, [class*='phone'], [class*='contact']")?.outerHTML?.slice(0, 3000) ?? phone.parentElement.outerHTML.slice(0, 3000);
  });
  console.log("Phone section HTML:\n", html);

  // Find all visible tel inputs
  const visibleTels = await page.evaluate(() => {
    return [...document.querySelectorAll("input[type='tel']")].map(el => ({
      id: el.id,
      name: el.name,
      visible: !!(el.offsetWidth || el.offsetHeight),
      value: el.value,
      cls: el.className.slice(0, 60),
      parentCls: el.parentElement?.className?.slice(0, 60) ?? "",
    }));
  });
  console.log("\nAll tel inputs:", JSON.stringify(visibleTels, null, 2));

  await page.close();
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
