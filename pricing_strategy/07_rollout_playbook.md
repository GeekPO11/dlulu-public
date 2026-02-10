# Rollout Playbook & KPIs

> **Status**: Execution Plan
> **Phases**: Soft Launch -> Hard Enforcement

---

## Phase 0: Observation (Now - Week 1)
*   **Action**: Deploy `user_usage_periods` table and tracking triggers (`95_ENFORCEMENT...`).
*   **Goal**: Collect baseline usage data without blocking users.
*   **User Impact**: None. Invisible counting.

## Phase 1: Soft Limits (Week 2)
*   **Action**: Show the UI counters (Progress bars) in Settings.
*   **Goal**: Calibrate user psychology. Do they panic?
*   **User Impact**: "You have used 45% of your free credits." (No actual stop).

## Phase 2: Free Hard-Stop (Week 3 - Launch)
*   **Action**: Enable the `checkLimits` middleware for Free tier `100k` tokens and `1 Goal`.
*   **Feature**: Enable the "Upgrade" modal.
*   **Migration**:
    *   **Existing Users**: Grandfathered for 30 days. "As an early beta user, you get Pro features free until [Date]."
    *   **New Users**: Immediate limits.

## Phase 3: Pro Throttle (Month 2)
*   **Action**: Enable the "Economy Lane" delay for Pro users > 2M tokens.
*   **Goal**: Protect margin from bots/abuse.

---

## Success KPIs

### Conversion
*   **Free-to-Pro Conversion**: Target > 3% by Day 30.
*   **Paywall Click-Through**: % of users who click "Upgrade" when hitting the Goal Limit.

### Activation
*   **First Blueprint**: % of signups who generate 1 full plan (The "Aha").
*   **Calendar Sync**: % of Pro users who connect Google Calendar (The "Hook").

### Retention
*   **Weeks 1-4 Retention**: Target > 40%.
*   **Pro Churn**: Target < 5% / month.

### Unit Economics
*   **Avg Tokens/User**: Monitor if Free users stay under 100k.
*   **Margin**: Monitor if Pro users stay under $2.00 cost.

---

## Risk Register

| Risk | Probability | Mitigation |
|:---|:---|:---|
| **Limit Backlash** | Med | Generous "Early Bird" grandfathering. Clear "Fair Use" messaging. |
| **App Fatigue** | High | Lean heavily on "We replace Todoist AND Motion" value prop ($40 value for $10). |
| **Google API Quota** | Low | We have 1M queries/day. Monitor `console.cloud.google.com` usage alerts. |
