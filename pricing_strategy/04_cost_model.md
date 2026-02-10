# Cost Model (Unit Economics)

> **Status**: Parametric Model (Draft)
> **Last Updated**: 2026-02-03
> **Purpose**: Establish safety margins for pricing.

---

## 1. Constants & Assumptions

| Variable | Value | Source | Unit |
|:---|:---|:---|:---|
| **$C_{in}$** | **$0.0005** | User Provided | Cost per 1K Input Tokens |
| **$C_{out}$** | **$0.0030** | User Provided | Cost per 1K Output Tokens |
| **$R_{io}$** | **15%** | Assumption A10 | Output tokens as % of Total |
| **$C_{blended}$** | **$0.000875**| Calculated | Weighted avg cost per 1K Total |
| **$C_{base}$** | **$0.50** | Assumption A11 | Fixed ops cost/user (DB storage, Auth) |

**Blended Cost Calculation**:
$$ C_{blended} = 0.85 \times C_{in} + 0.15 \times C_{out} $$
$$ C_{blended} = 0.85(0.0005) + 0.15(0.0030) = 0.000425 + 0.00045 = 0.000875 $$
*(Rounded to $0.0009 / 1K tokens for safety)*

---

## 2. Cost Drivers

| Driver | Description | Cost Type | Pricing Impact |
|:---|:---|:---|:---|
| **Chat Interaction** | The "Chat" feature. High variance. | Variable ($C_{blended}$) | **Primary Risk** |
| **Blueprint Gen** | One-off large prompt (2k in / 1k out). | Variable (Event) | Approx $0.004 / event |
| **Schedule Gen** | Complex constraint solving (5k in / 2k out). | Variable (Event) | Approx $0.009 / event |
| **Storage (DB)** | Goals, History logs. | Fixed (Step) | Negligible until scale |
| **Calendar Sync** | Google API calls. | Variable | TBD (Assume $0 for now) |

---

## 3. Per-User Monthly Cost Formula

$$ Cost_{user} = C_{base} + \left( \frac{T_{chat}}{1000} \times C_{blended} \right) + (N_{blueprints} \times \$0.004) + (N_{schedules} \times \$0.009) $$

---

## 4. Scenarios & Margin Analysis

### Scenario A: "Browser" (Free Tier Typical)
*   **Behavior**: Creates 1 goal, chats 10 times, no schedule.
*   **Usage**:
    *   1 Blueprint ($0.004)
    *   10 Chats (Avg 2k tokens total = 20k tokens -> $0.018)
    *   0 Schedules
*   **Variable Cost**: $0.022
*   **Total Cost**: $0.52 (with base)
*   **Verdict**: **Safe**. Loss leader is minimal.

### Scenario B: "Planner" (Pro Tier Moderate)
*   **Behavior**: 3 active goals, daily planning chat, weekly resync.
*   **Usage**:
    *   3 Blueprints ($0.012)
    *   100 Chats (200k tokens -> $0.18)
    *   4 Schedules ($0.036)
*   **Variable Cost**: $0.23
*   **Total Cost**: $0.73
*   **Verdict**: **Highly Profitable** at any price >$3.

### Scenario C: "Power User" (Pro Tier Heavy - The Risk)
*   **Behavior**: Uses "Chat" as search engine, constantly refining.
*   **Usage**:
    *   5 Blueprints ($0.02)
    *   1,000 Chats (2M tokens -> $1.80)
    *   20 Schedules (Daily re-roll -> $0.18)
*   **Variable Cost**: $2.00
*   **Total Cost**: $2.50
*   **Verdict**: **Margin Threat**. If priced at $5, margin is 50% (below target).

---

## 5. Gross Margin Targets
**Target**: **80%+** purely on COGS.
*   *Implication*: If price is $10, Max COGS = $2.00.
*   *Max Token Budget*: ~2 Million tokens/month allows $1.80 spend.

---

## 6. Instrumentation Plan (What to measure next)
1.  **Run this query**: `SELECT avg(tokens_input), avg(tokens_output) FROM chat_messages` (Validate $R_{io}$ 15% assumption).
2.  **Monitor**: `user_usage_periods.token_usage` distribution deciles.
