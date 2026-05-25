const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto("https://www.idealista.pt/flow/novo-anuncio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Click typology dropdown trigger
  await page.locator("#qa_typology").click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: require("path").join(__dirname, "idealista-screenshots/listing-form/inspect-dropdown.png") });

  // Dump dropdown items
  const opts = await page.evaluate(() => {
    const items = [...document.querySelectorAll("li[data-value], ul li[class*='item'], [class*='dropdown'] li, [class*='list'] li")];
    return items.map(el => ({
      text: el.innerText.trim().slice(0, 60),
      value: el.dataset.value || "",
      cls: el.className.slice(0, 80),
    }));
  });
  console.log("Dropdown options:", JSON.stringify(opts, null, 2));

  // HTML of the dropdown parent
  const html = await page.evaluate(() => {
    const btn = document.querySelector("#qa_typology");
    return btn ? btn.closest("div,span,ul").outerHTML.slice(0, 3000) : "not found";
  });
  console.log("\nDropdown HTML snippet:\n", html);

  await page.close();
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
