const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto("https://www.idealista.pt/flow/novo-anuncio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Select typology first so operation section appears
  await page.locator("#qa_typology").click();
  await page.waitForTimeout(400);
  await page.locator('#qa_typology li[data-value="HOME"]').click();
  await page.waitForTimeout(800);

  // Dump the HTML around the operation section
  const html = await page.evaluate(() => {
    const section = [...document.querySelectorAll("h2")].find(h => h.innerText.includes("Operação"));
    return section ? section.parentElement.innerHTML.slice(0, 3000) : "section not found";
  });
  console.log("Operation section HTML:\n", html);

  // Also try JS click directly
  await page.evaluate(() => {
    const radio = document.querySelector("#ca-radio-sell");
    if (radio) {
      radio.click();
      console.log("clicked ca-radio-sell");
    } else {
      console.log("ca-radio-sell not found");
    }
  });

  await page.close();
  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
