# Analytics Instrumentation Plan (Updated)

> **Status**: Ready for Implementation
> **Objective**: Track Billing, Limits, and Value Metric health.

## 1. Event Taxonomy

### A. Billing & Entitlements
| Event Name | Trigger Location | Payload | Purpose |
|:---|:---|:---|:---|
| `checkout_started` | Frontend (`PricingModal`) | `{ plan_id: 'pro_monthly', source: 'goal_limit' }` | Conversion funnel start |
| `checkout_completed` | Stripe Webhook / Frontend Success | `{ plan_id, revenue }` | Revenue tracking |
| `subscription_canceled` | Stripe Webhook | `{ reason }` | Churn analysis |
| `early_adopter_granted` | DB Trigger (via Edge Function log) | `{ user_id }` | Track program velocity |

### B. Limits & Gates
| Event Name | Trigger Location | Payload | Purpose |
|:---|:---|:---|:---|
| `limit_hit` | `GoalLibrary.tsx` / `chat/index.ts` | `{ limit_type: 'goals' \| 'tokens', limit_value: 1 }` | Upgrade demand signal |
| `feature_gated` | `GoalLibrary.tsx` (Cal Sync) | `{ feature: 'calendar_sync' }` | Feature upsell signal |
| `throttled` | `chat/index.ts` | `{ level: 'economy_lane' }` | Fair use monitoring |

### C. Value Metrics
| Event Name | Trigger Location | Payload | Purpose |
|:---|:---|:---|:---|
| `goal_created` | `chat/index.ts` (Tool Result) | `{ category }` | Core value delivery |
| `schedule_generated` | `generate-schedule/index.ts` | `{ sessions_count }` | Pro feature usage |

## 2. Implementation Guide

### Backend (Edge Functions)
Use a simple `fetch` to PostHog/Middleware API.
```typescript
// _shared/analytics.ts
export async function trackEvent(event: string, properties: any) {
  // Fire and forget
  fetch('https://api.posthog.com/capture', {
    method: 'POST',
    body: JSON.stringify({ event, properties, api_key: Deno.env.get('POSTHOG_KEY') })
  });
}
```

### Frontend
Use existing `logger` or analytics provider.
```typescript
// components/GoalLibrary.tsx
if (goals.length >= limit) {
  analytics.track('limit_hit', { limit_type: 'goals' });
  setShowUpgradeModal(true);
}
```
