import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const email = process.env.AUDIT_EMAIL || '';
const password = process.env.AUDIT_PASSWORD || '';
const outDir = 'audit_artifacts';

const log = [];
const consoleMessages = [];
const requestFailures = [];
const badResponses = [];

const redact = (value) => value
  .replace(email, '<EMAIL>')
  .replace(password, '<PASSWORD>');

const push = (msg) => {
  const line = `${new Date().toISOString()} ${msg}`;
  log.push(line);
  console.log(line);
};

const safeText = async (locator) => {
  try {
    return (await locator.innerText()).trim();
  } catch {
    return null;
  }
};

const run = async () => {
  if (!email || !password) {
    throw new Error('Missing AUDIT_EMAIL or AUDIT_PASSWORD');
  }

  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error' || type === 'warning') {
      consoleMessages.push({ type, text });
    }
  });

  page.on('requestfailed', (req) => {
    requestFailures.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || 'unknown',
    });
  });

  page.on('response', async (res) => {
    if (res.status() >= 400) {
      const url = res.url();
      if (!url.includes('favicon.ico')) {
        badResponses.push({
          status: res.status(),
          url,
          method: res.request().method(),
        });
      }
    }
  });

  try {
    push('Opening landing page');
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: `${outDir}/01-landing.png`, fullPage: true });

    push('Opening login modal');
    const loginBtn = page.locator('button', { hasText: 'Login' }).first();
    await loginBtn.click({ timeout: 15000 });

    // Ensure sign-in mode if sign-up copy is visible
    const signInToggle = page.locator('button', { hasText: /^Sign In$/i }).first();
    if (await signInToggle.isVisible().catch(() => false)) {
      await signInToggle.click();
    }

    const emailInput = page.locator('input[placeholder="name@company.com"]').first();
    await emailInput.fill(email);

    // In sign-in mode password input has bullet placeholder and no confirm field.
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().fill(password);

    const submitBtn = page.locator('form button[type="submit"]').first();
    await submitBtn.click();

    push('Waiting for authenticated dashboard state');
    await page.waitForTimeout(2000);

    const dashTitle = page.locator('[data-wt="dash-title"]');
    await dashTitle.waitFor({ state: 'visible', timeout: 45000 });
    await page.screenshot({ path: `${outDir}/02-dashboard.png`, fullPage: true });

    const greeting = await safeText(dashTitle);
    push(`Dashboard loaded: ${greeting || '(no title text)'}`);

    push('Navigating to goals via floating dock');
    await page.locator('[data-wt="dock-goals"]').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${outDir}/03-goals.png`, fullPage: true });

    push('Navigating to calendar via floating dock');
    await page.locator('[data-wt="dock-calendar"]').click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${outDir}/04-calendar.png`, fullPage: true });

    push('Navigating to settings via floating dock');
    await page.locator('[data-wt="dock-settings"]').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${outDir}/05-settings.png`, fullPage: true });

    const pricingButton = page.locator('button', { hasText: /Upgrade to Pro/i }).first();
    if (await pricingButton.isVisible().catch(() => false)) {
      push('Opening pricing from settings');
      await pricingButton.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${outDir}/06-pricing.png`, fullPage: true });

      const upgradeButton = page.locator('button', { hasText: /Upgrade to Pro/i }).first();
      if (await upgradeButton.isVisible().catch(() => false)) {
        push('Opening Stripe checkout modal');
        await upgradeButton.click();
        await page.waitForTimeout(5000);
        await page.screenshot({ path: `${outDir}/07-checkout-modal.png`, fullPage: true });

        const checkoutTitleVisible = await page.locator('text=Secure Checkout').isVisible().catch(() => false);
        push(`Checkout modal visible: ${checkoutTitleVisible}`);
      }
    } else {
      push('Upgrade button not visible in settings (may already be on paid plan)');
    }

    push('Runtime flow complete');
  } catch (err) {
    const message = err instanceof Error ? err.stack || err.message : String(err);
    push(`Runtime flow failed: ${message}`);
    await page.screenshot({ path: `${outDir}/zz-runtime-error.png`, fullPage: true }).catch(() => {});
  } finally {
    const report = {
      log,
      consoleMessages: consoleMessages.map((m) => ({ ...m, text: redact(m.text) })),
      requestFailures: requestFailures.map((r) => ({ ...r, url: redact(r.url) })),
      badResponses: badResponses.map((r) => ({ ...r, url: redact(r.url) })),
    };

    await fs.writeFile(`${outDir}/runtime-audit-report.json`, JSON.stringify(report, null, 2), 'utf8');
    await browser.close();
  }
};

run().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
