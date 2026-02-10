import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const email = 'gumbers@students.ufairfax.edu';
const password = 'Welcome@130';
const baseUrl = 'http://127.0.0.1:3000';

const log = [];
const warnings = [];
const failures = [];

const push = (msg) => {
  const line = `${new Date().toISOString()} ${msg}`;
  log.push(line);
  console.log(line);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'warning' || msg.type() === 'error') {
    warnings.push({ type: msg.type(), text: msg.text() });
  }
});

page.on('requestfailed', (req) => {
  failures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || 'unknown' });
});

let outcome = 'unknown';
let outcomeText = '';

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'audit_artifacts/08-pre-checkout.png', fullPage: true });

  await page.locator('button', { hasText: 'Login' }).first().click();
  const signInToggle = page.locator('button', { hasText: /^Sign In$/i }).first();
  if (await signInToggle.isVisible().catch(() => false)) {
    await signInToggle.click();
  }

  await page.locator('input[placeholder="name@company.com"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await page.locator('[data-wt="dash-title"]').waitFor({ state: 'visible', timeout: 45000 });

  await page.locator('[data-wt="dock-settings"]').click();
  await page.waitForTimeout(1800);

  const settingsUpgrade = page.locator('button', { hasText: /Upgrade to Pro/i }).first();
  if (!(await settingsUpgrade.isVisible().catch(() => false))) {
    outcome = 'already_pro_or_no_upgrade_button';
    outcomeText = 'Upgrade button not visible in Settings';
    push(outcomeText);
  } else {
    await settingsUpgrade.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'audit_artifacts/09-pricing-before-pay.png', fullPage: true });

    const pricingUpgrade = page.locator('button', { hasText: /Upgrade to Pro/i }).first();
    await pricingUpgrade.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'audit_artifacts/10-checkout-before-pay.png', fullPage: true });

    const paymentFrame = page.frames().find((f) => f.url().includes('elements-inner-payment'));
    if (!paymentFrame) {
      outcome = 'payment_frame_not_found';
      outcomeText = 'Stripe payment iframe not found';
      push(outcomeText);
    } else {
      push('Filling Stripe test card fields');
      await paymentFrame.locator('input[name="number"]').fill('4242424242424242');
      await paymentFrame.locator('input[name="expiry"]').fill('1234');
      await paymentFrame.locator('input[name="cvc"]').fill('123');
      const postal = paymentFrame.locator('input[name="postalCode"]');
      if (await postal.isVisible().catch(() => false)) {
        await postal.fill('10001');
      }

      const confirmButton = page.getByRole('button', { name: /Confirm/i }).first();
      await confirmButton.click();

      push('Submitted payment; waiting for completion message');
      const successBanner = page.locator('text=Payment complete').first();
      const processingBanner = page.locator('text=Upgrade active. Enjoy Pro.').first();
      const errorText = page.locator('text=Payment failed').first();

      const settled = await Promise.race([
        successBanner.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'success-banner').catch(() => null),
        processingBanner.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'active-banner').catch(() => null),
        errorText.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'error-banner').catch(() => null),
      ]);

      if (settled === 'success-banner' || settled === 'active-banner') {
        outcome = 'payment_submitted_success_ui';
        outcomeText = settled;
      } else if (settled === 'error-banner') {
        outcome = 'payment_error_ui';
        outcomeText = await errorText.innerText().catch(() => 'Payment failed');
      } else {
        outcome = 'timeout_waiting_for_payment_state';
        outcomeText = 'No success/error status surfaced within 45s';
      }

      await page.waitForTimeout(2500);
      await page.screenshot({ path: 'audit_artifacts/11-checkout-after-pay.png', fullPage: true });
      push(`Outcome: ${outcome} (${outcomeText})`);
    }
  }
} catch (err) {
  outcome = 'script_error';
  outcomeText = err instanceof Error ? (err.stack || err.message) : String(err);
  push(`Error: ${outcomeText}`);
  await page.screenshot({ path: 'audit_artifacts/11-checkout-after-pay.png', fullPage: true }).catch(() => {});
} finally {
  const report = { outcome, outcomeText, log, warnings, failures };
  await fs.writeFile('audit_artifacts/stripe-payment-report.json', JSON.stringify(report, null, 2), 'utf8');
  await browser.close();
}
