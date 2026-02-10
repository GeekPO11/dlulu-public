import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const email = process.env.AUDIT_EMAIL || '';
const password = process.env.AUDIT_PASSWORD || '';
const outDir = 'audit_artifacts';

if (!email || !password) {
  throw new Error('Missing AUDIT_EMAIL or AUDIT_PASSWORD');
}

const report = {
  baseUrl,
  reached: {
    onboarding: false,
    status: false,
    blueprint: false,
    feasibility: false,
    dashboard: false,
    settings: false,
    checkoutModal: false,
  },
  notes: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(30000);

const screenshot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
};

try {
  await fs.mkdir(outDir, { recursive: true });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('button', { hasText: 'Login' }).first().click();

  const signInTab = page.locator('button', { hasText: /^Sign In$/i }).first();
  if (await signInTab.isVisible().catch(() => false)) {
    await signInTab.click();
  }

  await page.locator('input[placeholder="name@company.com"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();

  const onboardingVisible = await page
    .locator('input[placeholder="Your full name"]')
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (onboardingVisible) {
    report.reached.onboarding = true;
    await screenshot('checkout-smoke-01-onboarding-profile');

    await page.locator('input[placeholder="Your full name"]').fill('Audit User');
    await page.locator('input[placeholder="e.g. Entrepreneur"]').fill('Founder');
    await page.locator('button', { hasText: /Continue Journey/i }).click();

    await page.locator('[data-wt="ob-ambition-input"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-wt="ob-ambition-input"]').fill('Run a marathon by November');
    await page.locator('[data-wt="ob-ambition-continue"]').click();

    const statusVisible = await page
      .locator('[data-wt="ob-status-header"]')
      .waitFor({ state: 'visible', timeout: 60000 })
      .then(() => true)
      .catch(() => false);

    if (statusVisible) {
      report.reached.status = true;
      await screenshot('checkout-smoke-02-status');
      await page.locator('button', { hasText: /Generate Blueprint/i }).click();
    } else {
      report.notes.push('Status screen did not appear.');
    }

    const blueprintVisible = await page
      .locator('[data-wt="ob-blueprint-nav"]')
      .waitFor({ state: 'visible', timeout: 60000 })
      .then(() => true)
      .catch(() => false);

    if (blueprintVisible) {
      report.reached.blueprint = true;
      await screenshot('checkout-smoke-03-blueprint');
      const startPlanButton = page.locator('[data-wt="ob-blueprint-start"]');
      if (await startPlanButton.isVisible().catch(() => false)) {
        await startPlanButton.click();
      } else {
        report.notes.push('Blueprint start button not visible.');
      }
    } else {
      report.notes.push('Blueprint screen did not appear.');
    }

    const feasibilityVisible = await page
      .locator('h1', { hasText: /Feasibility Review/i })
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true)
      .catch(() => false);

    if (feasibilityVisible) {
      report.reached.feasibility = true;
      await screenshot('checkout-smoke-04-feasibility');

      const riskAckBoxes = page.locator('label:has-text("I acknowledge this guidance") input[type="checkbox"]');
      const riskAckCount = await riskAckBoxes.count().catch(() => 0);
      for (let i = 0; i < riskAckCount; i += 1) {
        await riskAckBoxes.nth(i).check().catch(() => {});
      }

      const proceedAnyway = page.locator('label:has-text("Proceed anyway") input[type="checkbox"]').first();
      if (await proceedAnyway.isVisible().catch(() => false)) {
        await proceedAnyway.check().catch(() => {});
      }

      const continueButton = page.locator('[data-wt="ob-feasibility-continue"]');
      if (await continueButton.isVisible().catch(() => false)) {
        await page.waitForTimeout(300);
        const isDisabled = await continueButton.isDisabled().catch(() => false);
        if (!isDisabled) {
          await continueButton.click();
        } else {
          report.notes.push('Feasibility continue button disabled.');
        }
      }
    } else {
      report.notes.push('Feasibility screen did not appear.');
    }
  } else {
    report.notes.push('Account routed directly past onboarding.');
  }

  const dashboardVisible = await page
    .locator('[data-wt="dash-title"]')
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false);

  if (dashboardVisible) {
    report.reached.dashboard = true;
    await screenshot('checkout-smoke-05-dashboard');
    await page.locator('[data-wt="dock-settings"]').click();

    const settingsVisible = await page
      .locator('[data-wt="settings-profile"]')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (settingsVisible) {
      report.reached.settings = true;
      await screenshot('checkout-smoke-06-settings');
    }

    const upgradeButton = page.locator('button', { hasText: /Upgrade to Pro/i }).first();
    if (await upgradeButton.isVisible().catch(() => false)) {
      await upgradeButton.click();
      const checkoutVisible = await page
        .locator('text=Secure Checkout')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);

      if (checkoutVisible) {
        report.reached.checkoutModal = true;
        await screenshot('checkout-smoke-07-checkout-modal');
      } else {
        report.notes.push('Checkout modal did not appear after Upgrade click.');
      }
    } else {
      report.notes.push('Upgrade button not visible in settings (possible paid plan).');
    }
  } else {
    report.notes.push('Dashboard did not appear after auth/onboarding.');
  }
} finally {
  await fs.writeFile(
    `${outDir}/onboarding-checkout-smoke-report.json`,
    JSON.stringify(report, null, 2),
    'utf8'
  );
  await browser.close();
}
