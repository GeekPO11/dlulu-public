import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const outFile = 'audit_artifacts/signup-smoke-report.json';
const email = process.env.AUDIT_SIGNUP_EMAIL || `qa_${Date.now()}@example.com`;
const password = process.env.AUDIT_SIGNUP_PASSWORD || 'Welcome@123';

const report = {
  baseUrl,
  email,
  success: false,
  verificationPrompt: false,
  onboardingReached: false,
  errorBanner: null,
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

try {
  await fs.mkdir('audit_artifacts', { recursive: true });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('button', { hasText: 'Login' }).first().click();

  const signUpTab = page.locator('button', { hasText: /^Sign Up$/i }).first();
  if (await signUpTab.isVisible().catch(() => false)) {
    await signUpTab.click();
  }

  await page.locator('input[placeholder="name@company.com"]').first().fill(email);
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill(password);
  await passwordInputs.nth(1).fill(password);

  await page.locator('input[type="checkbox"]').first().check();
  await page.locator('form button[type="submit"]').first().click();

  const verificationPrompt = await page
    .locator('h2', { hasText: /Check Your Inbox/i })
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  const onboardingReached = await page
    .locator('input[placeholder="Your full name"]')
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  const errorText = await page
    .locator('form .bg-red-500\/20')
    .first()
    .innerText()
    .catch(() => null);

  report.verificationPrompt = verificationPrompt;
  report.onboardingReached = onboardingReached;
  report.errorBanner = errorText;
  report.success = verificationPrompt || onboardingReached;

  await page.screenshot({ path: 'audit_artifacts/signup-smoke.png', fullPage: true });
} finally {
  await fs.writeFile(outFile, JSON.stringify(report, null, 2), 'utf8');
  await browser.close();
}
