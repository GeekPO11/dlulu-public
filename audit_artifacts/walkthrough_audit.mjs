import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const email = process.env.AUDIT_EMAIL || '';
const password = process.env.AUDIT_PASSWORD || '';
const outDir = 'audit_artifacts';
const timeoutMs = Number(process.env.AUDIT_TIMEOUT_MS || 240000);

if (!email || !password) {
  throw new Error('Missing AUDIT_EMAIL or AUDIT_PASSWORD');
}

const findings = {
  baseUrl,
  reached: {
    onboarding: false,
    status: false,
    blueprint: false,
    feasibility: false,
  },
  walkthroughVisible: {
    profile: false,
    ambitions: false,
    status: false,
    blueprint: false,
    feasibility: false,
  },
  gaps: [],
  notes: [],
};

const log = (...args) => {
  console.log('[walkthrough-audit]', ...args);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(30000);

const hasWalkthrough = async () =>
  page.locator('text=Walkthrough').first().isVisible().catch(() => false);

const markGap = (phase, note) => {
  findings.gaps.push({ phase, note });
};

try {
  const startedAt = Date.now();
  const elapsed = () => `${Math.round((Date.now() - startedAt) / 1000)}s`;
  log(`starting; baseUrl=${baseUrl}; timeoutMs=${timeoutMs}`);
  await fs.mkdir(outDir, { recursive: true });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  log(`opened app (${elapsed()})`);
  await page.locator('button', { hasText: 'Login' }).first().click();
  log(`opened auth modal (${elapsed()})`);

  const signInTab = page.locator('button', { hasText: /^Sign In$/i }).first();
  if (await signInTab.isVisible().catch(() => false)) {
    await signInTab.click();
  }

  await page.locator('input[placeholder="name@company.com"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  log(`submitted sign in (${elapsed()})`);

  const routedToOnboarding = await page
    .locator('input[placeholder="Your full name"]')
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!routedToOnboarding) {
    const dashboardVisible = await page
      .locator('[data-wt="dash-title"]')
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (dashboardVisible) {
      findings.notes.push('Account routed to dashboard (likely already onboarded), walkthrough audit skipped.');
      log(`routed to dashboard (${elapsed()})`);
    } else {
      findings.notes.push('Could not route to onboarding or dashboard after sign in.');
      markGap('auth', 'Post-login route did not stabilize.');
      log(`route unstable after sign in (${elapsed()})`);
    }
  } else {
    findings.reached.onboarding = true;
    log(`onboarding/profile reached (${elapsed()})`);
    findings.walkthroughVisible.profile = await hasWalkthrough();
    if (!findings.walkthroughVisible.profile) {
      markGap('profile', 'Walkthrough not visible on profile step.');
    }
    await page.screenshot({ path: `${outDir}/walkthrough-01-profile.png`, fullPage: true });

    await page.locator('input[placeholder="Your full name"]').fill('Audit User');
    await page.locator('input[placeholder="e.g. Entrepreneur"]').fill('Founder');
    await page.locator('button', { hasText: /Continue Journey/i }).click();

    await page.locator('[data-wt="ob-ambition-input"]').waitFor({ state: 'visible', timeout: 15000 });
    log(`ambitions step reached (${elapsed()})`);
    findings.walkthroughVisible.ambitions = await hasWalkthrough();
    if (!findings.walkthroughVisible.ambitions) {
      markGap('ambitions', 'Walkthrough not visible on ambitions step.');
    }
    await page.screenshot({ path: `${outDir}/walkthrough-02-ambitions.png`, fullPage: true });

    await page.locator('[data-wt="ob-ambition-input"]').fill('Run a marathon by November');
    await page.locator('[data-wt="ob-ambition-continue"]').click();

    const statusVisible = await page
      .locator('[data-wt="ob-status-header"]')
      .waitFor({ state: 'visible', timeout: 45000 })
      .then(() => true)
      .catch(() => false);

    if (statusVisible) {
      findings.reached.status = true;
      log(`status step reached (${elapsed()})`);
      findings.walkthroughVisible.status = await hasWalkthrough();
      if (!findings.walkthroughVisible.status) {
        markGap('status', 'Walkthrough not visible on status check.');
      }
      await page.screenshot({ path: `${outDir}/walkthrough-03-status.png`, fullPage: true });
      await page.locator('button', { hasText: /Generate Blueprint/i }).click();
    } else {
      markGap('status', 'Status check did not appear.');
    }

    const blueprintVisible = await page
      .locator('[data-wt="ob-blueprint-nav"]')
      .waitFor({ state: 'visible', timeout: 45000 })
      .then(() => true)
      .catch(() => false);

    if (blueprintVisible) {
      findings.reached.blueprint = true;
      log(`blueprint reached (${elapsed()})`);
      findings.walkthroughVisible.blueprint = await hasWalkthrough();
      if (!findings.walkthroughVisible.blueprint) {
        markGap('blueprint', 'Walkthrough not visible on blueprint.');
      }
      await page.screenshot({ path: `${outDir}/walkthrough-04-blueprint.png`, fullPage: true });

      const startPlanVisible = await page.locator('[data-wt="ob-blueprint-start"]').isVisible().catch(() => false);
      if (startPlanVisible) {
        await page.locator('[data-wt="ob-blueprint-start"]').click();
      } else {
        findings.notes.push('Blueprint start button not visible (possibly not last goal yet).');
      }
    } else {
      markGap('blueprint', 'Blueprint view did not appear.');
    }

    const feasibilityVisible = await page
      .locator('h1', { hasText: /Feasibility Review/i })
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);

    if (feasibilityVisible) {
      findings.reached.feasibility = true;
      log(`feasibility reached (${elapsed()})`);
      findings.walkthroughVisible.feasibility = await hasWalkthrough();
      if (!findings.walkthroughVisible.feasibility) {
        markGap('feasibility', 'Walkthrough not visible on feasibility review.');
      }
      await page.screenshot({ path: `${outDir}/walkthrough-05-feasibility.png`, fullPage: true });
    } else {
      findings.notes.push('Feasibility review did not appear in this run.');
      log(`feasibility not reached (${elapsed()})`);
    }
  }
} finally {
  await fs.writeFile(`${outDir}/walkthrough-audit-report.json`, JSON.stringify(findings, null, 2), 'utf8');
  log('report written to audit_artifacts/walkthrough-audit-report.json');
  await browser.close();
}
