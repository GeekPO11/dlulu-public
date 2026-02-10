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
await page.waitForTimeout(2500);

const upgradeVisible = await page.locator('button', { hasText: /Upgrade to Pro/i }).first().isVisible().catch(() => false);
const manageVisible = await page.locator('button', { hasText: /Manage Billing/i }).first().isVisible().catch(() => false);
const subscriptionText = await page.locator('body').innerText();

await page.screenshot({ path: 'audit_artifacts/12-settings-post-payment.png', fullPage: true });

console.log(JSON.stringify({
  upgradeVisible,
  manageVisible,
  hasProWord: /\bpro\b/i.test(subscriptionText),
}, null, 2));

await browser.close();
