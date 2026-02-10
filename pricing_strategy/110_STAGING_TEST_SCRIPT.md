# Staging Test Script — Pricing & Billing (30 min)

> **Goal**: Verify entitlements, billing, gates, and webhook resilience in staging.
> **Prereq**: Staging environment with Stripe test keys and webhooks configured.

---

## 0) Setup (5 min)

1. **Confirm staging caps**  
   Set `ENTITLEMENTS_STAGING_PLAN_ID=staging_free` in staging to make caps tiny.  
   Verify plan exists:
   ```sql
   SELECT plan_id, token_hard_cap, token_soft_cap
   FROM plan_entitlements
   WHERE plan_id = 'staging_free';
   ```

2. **Verify early adopter count**  
   ```sql
   SELECT count(*) FILTER (WHERE reason = 'early_adopter_100') AS early_adopter_count
   FROM user_entitlement_overrides;
   ```

---

## 1) Early Adopter Allocation (5 min)

1. **Create a new user (User A)** via signup.  
2. Check override assignment:
   ```sql
   SELECT user_id, override_plan_id, reason
   FROM user_entitlement_overrides
   WHERE user_id = '<USER_A_ID>';
   ```
3. **If count < 100** → expect `pro_early`.  
4. **If count >= 100** → expect no override.  
5. **Validate #101 behavior** by creating additional users until count crosses 100.

---

## 2) Free User Gates (7 min)

1. **Create Goal #1** → should succeed.  
2. **Attempt Goal #2** → should be blocked with upgrade CTA.  
3. **Chat token cap**  
   - Send repeated large prompts until tokens exceed staging cap.  
   - Expect 402/403 response and upgrade payload.  
   - Verify counters increment:
   ```sql
   SELECT user_id, period_start, tokens_input_used, tokens_output_used, tokens_total_used
   FROM user_usage_periods
   WHERE user_id = '<USER_A_ID>'
   ORDER BY period_start DESC
   LIMIT 1;
   ```
4. **Calendar sync**  
   - Call `generate-schedule` for an existing goal.  
   - Expect 403 with upgrade payload.

---

## 3) Pro Checkout + Webhook (7 min)

1. Click **Upgrade to Pro** → Stripe Checkout opens.  
2. Complete with test card `4242 4242 4242 4242`.  
3. Confirm redirect back to app.  
4. Verify subscription row:
   ```sql
   SELECT id, user_id, status, plan_id, stripe_customer_id, current_period_end
   FROM subscriptions
   WHERE user_id = '<USER_A_ID>'
   ORDER BY current_period_end DESC
   LIMIT 1;
   ```
5. Confirm entitlements flip to Pro (goal #2 now allowed; calendar sync works).

---

## 4) Pro Throttle Behavior (4 min)

1. Temporarily reduce Pro soft cap in staging:
   ```sql
   UPDATE plan_entitlements
   SET token_soft_cap = 2000
   WHERE plan_id = 'pro_monthly';
   ```
2. Chat until usage exceeds 2,000 tokens.  
3. Expect slow-mode behavior (added delay).  
4. Verify usage_events idempotency by repeating the same request and checking only 1 new usage_events row:
   ```sql
   SELECT count(*) FROM usage_events WHERE user_id = '<USER_A_ID>';
   ```
5. Revert cap:
   ```sql
   UPDATE plan_entitlements
   SET token_soft_cap = 2000000
   WHERE plan_id = 'pro_monthly';
   ```

---

## 5) Manage Billing Portal (2 min)

1. From Settings, click **Manage Billing**.  
2. Expect redirect to Stripe Billing Portal.  
3. For Early Adopter user, verify “Included (Early Adopter)” and button disabled.

---

## 6) Webhook Resilience (Optional, 2 min)

1. Re-send the last `customer.subscription.updated` event from Stripe Dashboard.  
2. Verify idempotency: subscription row is updated, not duplicated.  
3. Temporarily disable webhook endpoint, complete a checkout, re-enable, and verify delayed update works.

---

## Exit Criteria

- All steps above pass without manual DB fixes.
- Webhook updates propagate to `subscriptions` within ~30s.
- Free caps block and Pro throttle triggers under staged limits.
