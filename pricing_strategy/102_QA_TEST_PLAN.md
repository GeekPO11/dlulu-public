# QA Test Plan: Pricing & Billing

> **Status**: Draft
> **Scope**: Billing integration, entitlements, and enforcement gates.

---

## 1. Test Matrix

| Scenario | User Type | Action | Expected Outcome |
|:---|:---|:---|:---|
| **T1** | Free | Create 1st Goal | **Success** |
| **T2** | Free | Create 2nd Goal | **Block** (Show Upgrade Modal) |
| **T3** | Free | Chat (Usage < 100k) | **Success** |
| **T4** | Free | Chat (Usage > 100k) | **Block** (Quota Exceeded Error) |
| **T5** | Pro | Create 2nd Goal | **Success** |
| **T6** | Pro | Chat (Usage > 100k) | **Success** (No block) |
| **T7** | Pro | Chat (Usage > 2M) | **Success but Slow** (Throttle Verify) |
| **T8** | Free | Enable Cal Sync | **Block** (UI Disabled + API 403) |
| **T9** | Pro | Enable Cal Sync | **Success** |
| **T10** | Early Adopter | Create 2nd Goal | **Success** (Should have Pro limits) |
| **T11** | Early Adopter | Check Billing | **Show "Free Forever" badge** (No Stripe) |
| **T12** | User #101 | Sign Up | **Defaults to Free** (No override) |

---

## 2. Billing Lifecycle Tests (Stripe Sandbox)

### B1: Upgrade Flow
1.  Free User clicks "Upgrade".
2.  Completes Stripe Checkout (Test Card `4242...`).
3.  Redirects back to App.
4.  **Verify**: User is now `pro`. Can create 2nd goal immediately.

### B2: Cancellation
1.  Pro User visits Portal -> Cancels.
2.  **Verify**: User remains `pro` until period end.
3.  Simulate Period End (Stripe Clock or Dev Tool).
4.  **Verify**: User downgrades to `free`.
5.  **Verify**: 2nd Goal is now "Locked" or "Archived" (depending on implement), or just prevents *new* creation.

### B3: Payment Failure
1.  Pro User card fails (use Stripe `declined` card).
2.  **Verify**: Webhook `invoice.payment_failed` received.
3.  **Verify**: User logic handles grace period (remains Pro) or blocks (if no grace period implemented).

---

## 3. Negative & Edge Cases

### N1: Webhook Spoofing
*   **Action**: Send fake `checkout.session.completed` payload to webhook endpoint without valid logic signature.
*   **Expect**: 400/401 Error. Database **NOT** updated.

### N2: Bypass UI
*   **Action**: Free user sends `curl POST /generate-schedule` directly to API.
*   **Expect**: 403 Forbidden. (Backend must not rely on frontend button disabled state).

### N3: Token Double Count
*   **Action**: Send 10 rapid chat requests.
*   **Expect**: Counter increments by approx correct amount (atomic updates). No locking errors.

---

## 4. Observability Checks
Before shipping, verify logs:
*   [ ] "Upgrade Modal Views" are logging.
*   [ ] "Stripe Webhook Received" logs exist.
*   [ ] "Limit Hit" errors appear in error tracking (Middleware/Sentry) but as *Business Logic* info, not System Crashes.

## 5. Exit Criteria
*   **0** Critical Bugs in Parsing Webhooks.
*   **0** Critical Bugs in Hard Stop enforcement (Free users must not get free tokens).
*   **Pass**: All T1-T9 scenarios pass in Staging.
