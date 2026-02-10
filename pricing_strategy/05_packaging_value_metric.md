# Packaging & Value Metric Strategy

> **Status**: Strategic Proposal (Draft)
> **Goal**: Define how we bundle features and what we charge for.

---

## 1. Pricing Objectives
1.  **Low Friction**: Remove barriers to the "Aha!" moment (Goal Blueprint generation).
2.  **Protect AI Margins**: Ensure heavy AI users (Chat/Scheduling) pay for their compute.
3.  **Encourage Commitment**: Incentivize users to move from "trying" to "relying" (Calendar Sync).

---

## 2. Monetization Motion: Freemium
*Recommended over Free Trial or Paid-Only.*

*   **Why**: dlulu is a PLG (Product-Led Growth) tool where value is realized *over time*. Users need to trust the system before paying. A hard time limit (Trial) cuts off the habit loop.
*   **The Hook**: "Draft your life for free, pay to execute it efficiently."

---

## 3. Primary Value Metric: Active Goals
**Selection: Active Goals** (Secondary: Monthly AI Tokens)

| Candidate | Assessment | Decision |
|:---|:---|:---|
| **Active Goals** | Strongly correlates with value. Easy to understand. | **PRIMARY** |
| **Monthly Tokens** | Correlates with cost. Hard for users to predict. | **SECONDARY (Fair Use)** |
| **AI Invocations** | Too abstract. Punishes exploration. | REJECT |
| **Schedules** | Good Pro metric, but discourages daily use. | REJECT |

---

## 4. Packaging Philosophy
*   **Trust Building (Free)**: Experience the core "AI Architect" magic. Generate blueprints, see the roadmap.
*   **Upgrade Gate (Pro)**: The "Execution Engine." Deep scheduling, calendar sync, unlimted goals.
*   **Cost Protection (Limits)**: Chat is expensive. Even Pro users have a "Fair Use" soft cap (e.g., 500 tasks/mo equivalent).

---

## 5. Proposed Tier Strategy

### Plan A: Free ("Dreamer")
*   **Who**: New users, casual planners.
*   **Core Promise**: "Turn one big dream into a clear plan."
*   **Includes**:
    *   1 Active Goal (`goals` table limit)
    *   Unlimited Blueprint generation (for that 1 goal)
    *   Basic Roadmap View
    *   *Limit*: No Calendar integration.
    *   *Limit*: Standard AI Chat (slower model if available).

### Plan B: Pro ("Achiever")
*   **Who**: Serious users, multiple-project executers.
*   **Core Promise**: "Engineer your entire life."
*   **Includes**:
    *   Unlimited Active Goals
    *   Intelligent Scheduling (Energy/Time-aware) -> The "Killer Feature"
    *   Calendar Sync (Google Cal) -> The "Sticky Feature"
    *   Advanced "Unstuck" Chat (Context-aware)
    *   Priority Support

### Annual Plan Policy
*   **Discount**: 2 months free (pay for 10, get 12).
*   **Perk**: Higher "Fair Use" token bucket for annual users (trust dividend).

---

## 6. Add-ons Strategy
*   *None for Launch.* Keep it simple.
*   *Future*: "Token Packs" if users hit the fair use limit frequently.

---

## 7. Competitive Psychology
*   **Avoid Surprises**: Don't charge for "editing" a goal. Start-stop actions should be free.
*   **The "Lock-in"**: Once a user Syncs to Google Calendar, churn drops significantly. Make that the Pro differentiator.

---

## 8. Tradeoffs & Risks

| Risk | Mitigation |
|:---|:---|
| **Free-riding**: Users deleting/creating goals to stay under limit. | Limit is on *Active* goals. Archiving preserves history but freezes editing. |
| **Token Cost Blowout**: Free users chatting endlessly. | strict daily token cap on Free tier. |
| **Perception**: "Why pay for a to-do list?" | Emphasize the *AI Intelligence* (Scheduling/Context), not the list storage. |
