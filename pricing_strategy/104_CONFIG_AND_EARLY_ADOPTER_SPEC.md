# Configurable Entitlements & Early Adopter Spec

> **Status**: Technical Spec
> **Goal**: Move limits out of code and enable "Early Adopter" giveaways.

---

## 1. Data Model: Configurable Limits

Instead of hardcoding `1` goal or `100k` tokens, we fetch these from the DB.

### A. Plan Entitlements Table (`plan_entitlements`)
Defines the "Template" for each tier.
```sql
CREATE TABLE plan_entitlements (
  plan_id text PRIMARY KEY, -- 'free', 'pro_monthly', 'pro_annual', 'pro_early'
  max_active_goals integer NOT NULL, -- -1 for infinite (frontend handles display)
  token_limit_monthly bigint NOT NULL,
  token_throttle_monthly bigint, -- Nullable. If set, this is the soft cap.
  calendar_sync_enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- Seed Data
INSERT INTO plan_entitlements (plan_id, max_active_goals, token_limit_monthly, calendar_sync_enabled) VALUES
('free', 1, 100000, false),
('pro_monthly', 9999, 10000000, true), -- Effectively infinite hard cap
('pro_annual', 9999, 10000000, true),
('pro_early', 9999, 10000000, true);
```

### B. App Configuration (`app_config`)
For global flags and kill-switches.
```sql
CREATE TABLE app_config (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Example: Early Adopter Cap
-- INSERT INTO app_config VALUES ('early_adopter_limit', '{"count": 100}');
```

---

## 2. Early Adopter Program (The "Special 100")

### Logic
We want the first 100 users to get `pro_early` plan for free, forever (or until we expire it).

### Storage: Overrides Table
```sql
CREATE TABLE user_entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  override_plan_id text REFERENCES plan_entitlements(plan_id) NOT NULL,
  reason text, -- 'early_adopter_100'
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz, -- NULL = Forever
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id) -- Only one active override per user
);
```

### Allocation Strategy (Cloud Function `assign-early-adopter`)
Triggered on `auth.users` insert (via Database Webhook or Supabase Trigger).

**Pseudo-SQL Logic**:
```sql
-- Trigger Function
BEGIN
  IF (SELECT count(*) FROM user_entitlement_overrides WHERE reason = 'early_adopter_100') < 100 THEN
    INSERT INTO user_entitlement_overrides (user_id, override_plan_id, reason)
    VALUES (NEW.id, 'pro_early', 'early_adopter_100');
  END IF;
END;
```
*Note: This relies on "First Come First Served" at the DB level, which is atomic enough for this scale.*

---

## 3. Entitlements Resolver (The "Brain")

**Path**: `supabase/functions/_shared/entitlements.ts`

**Resolution Order**:
1.  **Check Overrides**: Does an active record exist in `user_entitlement_overrides`? -> Return that plan.
2.  **Check Stripe**: Does an active record exist in `subscriptions`? -> Return that plan (`pro_monthly` / `pro_annual`).
3.  **Default**: Return `free`.

**Caching**:
*   Fetch `plan_entitlements` once per edge function warm boot (global variable) or cache for 60s. Low volatility.
*   Fetch User Status (Override + Sub) on every request (security critical).

---

## 4. Enforcement Logic Updates

### Middleware (`gate.ts`)
*   **Old**: `if (goals >= 1)`
*   **New**:
    ```typescript
    const plan = await resolvePlan(user_id);
    const rules = await getPlanEntitlements(plan); // cached lookup
    if (goals >= rules.max_active_goals) throw 403;
    ```

### Throttle logic
*   **Old**: `if (usage > 2000000)`
*   **New**:
    ```typescript
    if (rules.token_throttle_monthly && usage > rules.token_throttle_monthly) {
       // Activate Economy Lane
    }
    ```

---

## 5. Operations / Admin
*   **Updating Limits**: Run SQL `UPDATE plan_entitlements SET max_active_goals = 2 WHERE plan_id = 'free';` -> Immediate effect on next request.
*   **Revoking Early Adopter**: `DELETE FROM user_entitlement_overrides WHERE user_id = ?`.
