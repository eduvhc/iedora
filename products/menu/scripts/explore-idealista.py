import sys
sys.stdout.reconfigure(encoding="utf-8")
import undetected_chromedriver as uc
import time
import os
import json

EMAIL = "eduardoferdcarvalho+agency@gmail.com"
PASSWORD = "Teste1234_@"
SCREENSHOTS = os.path.join(os.path.dirname(__file__), "idealista-screenshots")
os.makedirs(SCREENSHOTS, exist_ok=True)

def shot(driver, name):
    p = os.path.join(SCREENSHOTS, f"{name}.png")
    driver.save_screenshot(p)
    print(f"[screenshot] {name}")

def body_text(driver, chars=300):
    try:
        return driver.find_element("tag name", "body").text[:chars]
    except:
        return driver.page_source[:chars]

print("Launching undetected Chrome")
options = uc.ChromeOptions()
options.add_argument("--window-size=1280,900")
options.add_argument("--lang=pt-PT")

driver = uc.Chrome(
    options=options,
    headless=2,
    use_subprocess=True,
    version_main=148,
    browser_executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
)

try:
    #  1. Homepage 
    print("\n 1. Homepage")
    driver.get("https://www.idealista.pt")
    time.sleep(4)
    shot(driver, "uc01-homepage")
    print(f"  Title: {driver.title}")
    print(f"  URL:   {driver.current_url}")
    print(f"  Body:  {body_text(driver, 150)}")

    # Accept cookies
    try:
        btn = driver.find_element("id", "didomi-notice-agree-button")
        btn.click()
        print("  OK Cookies accepted")
        time.sleep(1)
    except:
        pass

    shot(driver, "uc02-homepage-clean")

    #  2. Login page 
    print("\n 2. Login")
    driver.get("https://www.idealista.pt/areas/login/")
    time.sleep(4)
    shot(driver, "uc03-login")
    print(f"  URL: {driver.current_url}")
    print(f"  Body: {body_text(driver, 200)}")

    inputs = driver.find_elements("tag name", "input")
    print(f"  Inputs: {[{'type': i.get_attribute('type'), 'name': i.get_attribute('name'), 'id': i.get_attribute('id')} for i in inputs]}")

    email_field = None
    for i in inputs:
        if i.get_attribute("type") in ("email", "text") or i.get_attribute("name") in ("email", "username"):
            email_field = i
            break

    if email_field:
        #  3. Fill & submit 
        print("\n 3. Filling credentials")
        email_field.clear()
        email_field.send_keys(EMAIL)
        pass_field = driver.find_element("css selector", 'input[type="password"]')
        pass_field.send_keys(PASSWORD)
        shot(driver, "uc04-filled")
        submit = driver.find_element("css selector", 'button[type="submit"], input[type="submit"]')
        submit.click()
        time.sleep(4)
        shot(driver, "uc05-after-login")
        print(f"  Post-login URL: {driver.current_url}")

        #  4. My area 
        print("\n 4. My area")
        driver.get("https://www.idealista.pt/areas/minha-area/")
        time.sleep(3)
        shot(driver, "uc06-my-area")
        print(f"  URL: {driver.current_url}")
        print(f"  Body:\n{body_text(driver, 600)}")

        links = driver.find_elements("css selector", "a[href]")
        print("\n  Links on page:")
        seen = set()
        for l in links[:40]:
            href = l.get_attribute("href") or ""
            text = l.text.strip()[:60]
            if text and href and href not in seen and "javascript" not in href:
                seen.add(href)
                print(f"    \"{text}\"  {href}")

        #  5. Create listing 
        print("\n 5. Anunciar (publish listing)")
        driver.get("https://www.idealista.pt/areas/anunciar/")
        time.sleep(3)
        shot(driver, "uc07-anunciar")
        print(f"  URL: {driver.current_url}")
        print(f"  Body:\n{body_text(driver, 800)}")

        form_fields = driver.find_elements("css selector", "input, select, textarea")
        if form_fields:
            print("  Form fields:")
            for f in form_fields:
                print(f"    <{f.tag_name} type='{f.get_attribute('type')}' name='{f.get_attribute('name')}' id='{f.get_attribute('id')}' placeholder='{f.get_attribute('placeholder')}'>")

        shot(driver, "uc08-anunciar-detail")

        # Also try the pro/agency area
        print("\n 6. Pro/agency area")
        for url in [
            "https://www.idealista.pt/areas/minha-area/anuncios/",
            "https://www.idealista.pt/areas/minha-area/perfil/",
        ]:
            driver.get(url)
            time.sleep(2)
            slug = url.rstrip("/").split("/")[-1]
            shot(driver, f"uc09-{slug}")
            print(f"  {url}  {driver.current_url}")
            print(f"  {body_text(driver, 300)}\n")

    else:
        print("  WARN DataDome still blocking  no login form found")
        print(f"  Page source snippet:\n{driver.page_source[:800]}")

finally:
    driver.quit()
    print(f"\nDONE Done. Screenshots: {SCREENSHOTS}")
