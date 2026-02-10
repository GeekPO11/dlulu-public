# Price Boundaries & Policy

> **Status**: Decision Framework
> **Purpose**: Translate minimal costs into maximum limits and price ranges.

---

## 1. Safe Token Budgets

Based on the Cost Model (`04_cost_model.md`), we set budgets to protect margins.

### Free Tier ("Dreamer")
*   **Target Cost Cap**: <$0.10 / user / month (variable)
*   **Recommended Budget**: **100,000 Tokens / mo**
*   **Impact**:
    *   Approx. 50-70 chat messages.
    *   Enough for: Onboarding + Refining 1 Goal + sporadic questions.
    *   *Risk*: Low. 100k tokens = $0.09.

### Pro Tier ("Achiever")
*   **Target Cost Cap**: <$2.00 / user / month (variable)
*   **Recommended Fair Use Limit**: **2,000,000 Tokens / mo**
*   **Impact**:
    *   Approx. 1,000+ chat messages (30/day).
    *   Enough for: Heavy daily usage.
    *   *Risk*: Managed. 2M tokens = $1.80. Even at this limit, a $10 price point holds 80% margin.

---

## 2. Pro Price Range Estimation
*Assumption: Target Margin >80%*

*   **Floor ($5/mo)**:
    *   Pros: High conversion, competitive with "Todoist".
    *   Cons: "Power User" scenario ($2.50 cost) kills margin (50%).
    *   *Verdict*: Too risky for an AI-heavy tool.

*   **Ceiling ($20/mo)**:
    *   Pros: Safe margins, premium positioning (Motion / Sunsama territory).
    *   Cons: High friction for B2C "checking it out".
    *   *Verdict*: Good anchor, maybe too high for current feature set.

*   **Recommended Range**: **$9 - $12 / mo**
    *   At $10/mo:
        *   Power User Cost ($2.50) -> 75% Margin.
        *   Typical User Cost ($0.73) -> 92% Margin.
    *   *Sweet Spot*: **$10 monthly / $100 annual**.

---

## 3. Fair Use Policy Design
*Goal: Prevent AI Arbitrage (using us as a cheap Gemini wrapper).*

**The "Soft Cap" Mechanism**:
1.  **Priority Lane (0 - 2M tokens)**: Full speed, Gemini 3 Flash.
2.  **Economy Lane (> 2M tokens)**:
    *   **Rate Limit**: Max 5 messages / hour.
    *   **Latency**: Artificially deprioritized or queued.
    *   **Messaging**: "You've exhausted your high-speed credits. You can continue chatting at reduced speed."
3.  **Hard Stop**: None (unless distinct abuse detected).

**What We Will NOT Do**:
*   Charge overages automatically.
*   Lock users out of their data/goals.
*   Degrade "Goal/Schedule" features (core promise). Limit assumes *Chat* is the token sink.

---

## 4. Annual Plan Economics
**Offer**: $100/year (2 months free).

*   **Cashflow**: +$100 upfront.
*   **Usage Impact**: Annual users churn less but use more.
*   **Policy**: Give Annual users **3M Tokens/mo** (50% bonus).
    *   *Cost impact*: Max risk rises to ~$2.70/mo.
    *   *Margin impact*: $100/12 = $8.33/mo revenue. Cost $2.70. Margin = 68% (worst case).
    *   *Verdict*: Acceptable trade for upfront cash and retention.
