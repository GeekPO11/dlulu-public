# Enforcement Implementation Plan

> **Status**: Engineering Spec
> **Purpose**: Roadmap for devs to implement pricing gates.
> **Link**: See `94_METERING_AND_LIMITS_SPEC.md` for schema details.

---

## 1. Minimal Schema Changes

### A. Usage Tracking Table
Create `user_usage_periods` to store monthly counters.
```sql
-- Run in Supabase SQL Editor
CREATE TABLE public.user_usage_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  token_usage integer DEFAULT 0,  -- The cost driver
  active_goal_count integer DEFAULT 0, -- The value metric (snapshot)
  is_active_period boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_start)
);

CREATE INDEX idx_usage_user_active ON user_usage_periods(user_id) WHERE is_active_period = true;
```

### B. User Plan Metadata
Add strictly necessary fields to `profiles` (avoiding a full stripe_customers table for now if using a simple merchant of record later, but we need *something*).
```sql
ALTER TABLE public.profiles 
ADD COLUMN plan_tier text DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'admin')),
ADD COLUMN plan_status text DEFAULT 'active';
```

---

## 2. Enforcement Approach: Edge Function Middleware
*Recommended Path.*
RLS is good for hard stops (Row count), but bad for "Tokens" or "Feature Gates" (complex logic). Middleware is flexible.

### The Middleware Logic (`/_shared/plan-guard.ts`)
Every Edge Function (e.g., `generate-blueprint`, `chat`) will import this.

```typescript
export async function enforcePlanLimits(user_id: string, feature: 'chat' | 'goal_create' | 'schedule') {
  const supabase = createClient(...);
  
  // 1. Get Plan & Usage
  const { data: profile } = await supabase.from('profiles').select('plan_tier').eq('id', user_id).single();
  const { data: usage } = await supabase.from('user_usage_periods').select('*').match({user_id, is_active_period: true}).single();

  // 2. Define Limits (Hardcoded for V1)
  const LIMITS = {
    free: { goals: 1, tokens: 100000 },
    pro: { goals: 999, tokens: 1000000 }
  };
  
  const rules = LIMITS[profile.plan_tier];

  // 3. Goal Gate
  if (feature === 'goal_create') {
     const currentGoals = await supabase.from('goals').select('count', {count: 'exact'}).eq('status', 'active');
     if (currentGoals >= rules.goals) throw new Error("UPGRADE_REQUIRED_GOALS");
  }

  // 4. Token Gate
  if (feature === 'chat' && usage.token_usage > rules.tokens) {
     throw new Error("QUOTA_EXCEEDED_TOKENS");
  }
}
```

---

## 3. Usage Aggregation Logic
*Since we don't have a background job worker (no Cron), we must increment on write.*

*   **Option A (Database Trigger)**: Best for reliability.
    *   `AFTER INSERT ON chat_messages`: Increment `user_usage_periods.token_usage`.
*   **Option B (Edge Function)**: Easier to code, risk of drift.
    *   In `chat/index.ts`: After Gemini responds, run `rpc('increment_usage', { tokens: ... })`.

**Decision**: Use **Database Trigger** for Token counting (it's atomic). Use **Middleware Read** for enforcement.

---

## 4. API & Frontend Contract

### A. GET /api/usage
Frontend needs to show "X / Y Goals Used".
```json
{
  "plan": "free",
  "limits": { "goals": 1, "tokens": 100000 },
  "usage": { "goals": 1, "tokens": 4500 },
  "upgrade_url": "..."
}
```

### B. Handling "Upgrade Required" Errors
Standardize error codes so frontend shows the Modal.
*   `402 Payment Required`
*   Body: `{ "code": "LIMIT_REACHED", "resource": "goals", "message": "..." }`

---

## 5. UX Rules
1.  **Banner**: If token usage > 80% on Free, show persistent banner: "Running low on AI credits."
2.  **Gray-out**: If Free user, the "Sync to Calendar" toggle is visible but unclickable (shows tooltip/modal).
3.  **Empty State**: When creating 2nd goal, show the "Pro" teaser card instead of the form.
