import { chromium } from 'playwright';

const email = 'gumbers@students.ufairfax.edu';
const password = 'Welcome@130';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
await page.locator('button', { hasText: 'Login' }).first().click();
const signInToggle = page.locator('button', { hasText: /^Sign In$/i }).first();
if (await signInToggle.isVisible().catch(() => false)) await signInToggle.click();
await page.locator('input[placeholder="name@company.com"]').first().fill(email);
await page.locator('input[type="password"]').first().fill(password);
await page.locator('form button[type="submit"]').first().click();
await page.locator('[data-wt="dash-title"]').waitFor({ state: 'visible', timeout: 45000 });

await page.locator('[data-wt="dock-settings"]').click();
await page.waitForTimeout(1500);
await page.locator('button', { hasText: /Upgrade to Pro/i }).first().click();
await page.waitForTimeout(2000);
await page.locator('button', { hasText: /Upgrade to Pro/i }).first().click();
await page.waitForTimeout(5000);

const paymentFrame = page.frames().find((f) => f.url().includes('elements-inner-payment'));
if (!paymentFrame) throw new Error('payment frame not found');

const fields = await paymentFrame.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input,select'));
  return inputs.map((el) => ({
    tag: el.tagName,
    name: (el).getAttribute('name'),
    id: (el).id || null,
    placeholder: (el).getAttribute('placeholder'),
    type: (el).getAttribute('type'),
    ariaLabel: (el).getAttribute('aria-label'),
  }));
});

const buttons = await paymentFrame.evaluate(() => {
  return Array.from(document.querySelectorAll('button')).map((el) => ({
    text: (el.textContent || '').trim(),
    ariaLabel: el.getAttribute('aria-label'),
    type: el.getAttribute('type'),
  }));
});

console.log(JSON.stringify({ fields, buttons }, null, 2));
await browser.close();
