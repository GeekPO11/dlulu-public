# Metering & Limits Specification

> **Status**: Technical Spec (Draft)
> **Purpose**: Define how to measure usage and enforce limits for pricing.

---

## 1. Canonical Usage Units
We will standardize on the following units for metering:

1.  **`ai_tokens`**: The most granular cost driver.
    *   **Source**: `tokens_input` + `tokens_output` from `chat_messages` table.
    *   **Application**: Fair use limits on "Unlimted Chat" or specific credit packs.
2.  **`ai_requests`**: Count of high-value AI operations.
    *   **Source**: Invocations of specific Edge Functions (`generate-schedule`, `generate-blueprint`).
    *   **Application**: Tier limits (e.g., "5 Blueprints / month").
3.  **`active_goals`**: The primary value unit.
    *   **Source**: `SELECT count(*) FROM goals WHERE status = 'active' AND user_id = ?`.
    *   **Application**: Freemium gate (e.g., "1 Active Goal Free").

---

## 2. Proposed Counters & Storage

### Storage Location
We need a new table `user_usage_periods` to track monthly usage cycles:

```sql
CREATE TABLE public.user_usage_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  token_usage integer DEFAULT 0,
  blueprint_count integer DEFAULT 0,
  schedule_generations integer DEFAULT 0,
  UNIQUE(user_id, period_start)
);
```

### Aggregation Logic
*   **Tokens**: Trigger on `chat_messages` INSERT to increment `user_usage_periods.token_usage`.
*   **Blueprints**: Trigger on `goals` INSERT (where `overview_generated` becomes true) OR direct logging from Edge Function.

---

## 3. Enforcement Points

### A. Edge Function Middleware (Primary)
Before executing expensive logic in `serve.ts` (or equivalent entry point):

```typescript
// Pseudo-code for middleware
async function checkLimits(user: User, action: 'chat' | 'blueprint') {
  const usage = await getUsage(user.id);
  const plan = await getPlan(user.id);
  
  if (action === 'blueprint' && usage.blueprint_count >= plan.limits.blueprints) {
    throw new Error("PLAN_LIMIT_EXCEEDED: Upgrade to create more goals.");
  }
}
```

### B. RLS Policies (Secondary / Hard Enforcement)
Prevent `INSERT` on `goals` if limit reached:
```sql
CREATE POLICY "limit_goals_based_on_plan" ON goals
FOR INSERT WITH CHECK (
  (SELECT count(*) FROM goals WHERE user_id = auth.uid()) < 
  (SELECT goal_limit FROM plans WHERE id = auth.uid()) -- conceptual
);
```
*Note: RLS allows for secure "hard stops" even if the API client is tampered with.*

### C. Frontend UI (UX Only)
*   Disable "Create Goal" button if limit reached.
*   Show progress bar for token usage in Chat.

---

## 4. Overage Behavior Options

| Metric | Behavior | User Message |
|:---|:---|:---|
| **Goals** | **Hard Stop** | "You've reached the limit of 3 goals on the Free plan. Archive one or Upgrade." |
| **Chat/Tokens** | **Degraded Mode** | "You've used your high-speed AI credits. Chat may be slower or limited to simple queries." |
| **Scheduling** | **Hard Stop** | "Upgrade to generate unlimited schedules." |

---

## 5. Auditability & Instrumentation

### Required Before Pricing Launch
1.  **Usage Dashboard**: `settings/billing` page showing current usage vs limit.
2.  **Admin View**: Ability for support to reset a user's usage cycle.
3.  **Logs**: Ensure `chat_messages` always records token usage (already exists, verify reliability).

### Risks & Edge Cases
*   **Failed Calls**: Ensure we don't count tokens/requests for 500 errors.
    *   *Mitigation*: Only increment counters on successful 200 OK response, or handle refund logic.
*   **Streaming**: Token counts are only available *after* stream finishes.
    *   *Mitigation*: Update DB record asynchronously after stream close.
*   **Null Token Counts**: If Gemini fails to report tokens.
    *   *Mitigation*: Fallback heuristic (1 char ~ 0.25 tokens) to estimate.

---

## 6. Implementation Priorities
1.  Verify `chat_messages` token columns are populating correctly.
2.  Create `user_usage_periods` table.
3.  Implement `checkLimits` function in `_shared` code for Edge Functions.
