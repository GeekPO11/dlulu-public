# Pricing Model (Final)

> **Status**: Ready for Launch
> **Effective Date**: 2026-02-03

---

## 1. Launch Tier Architecture

| Feature | **Free ("Dreamer")** | **Pro ("Achiever")** |
|:---|:---|:---|
| **Monthly Price** | **$0** | **$10** |
| **Annual Price** | - | **$100 / year** (Save 17%) |
| **Active Goals** | **1 Active Goal** | **Unlimited** |
| **Calendar Sync** | No | **2-Way Google Sync** |
| **Intelligent Scheduler**| Manual / Preview Only | **Automated (Energy-Aware)** |
| **AI Token Budget** | **100k / mo** (Hard Stop) | **2M / mo** (Fair Use soft cap) |
| **Blueprint Generation**| Unlimited (for the 1 goal) | Unlimited |
| **History Retention** | 30 Days | Unlimited |
| **Support** | Community | Priority Email |

---

## 2. Limits & UX Behavior

### A. Active Goals (The Wedge)
*   **Role**: The primary "Upgrade Trigger".
*   **Behavior (Free)**:
    *   User has 1 active goal.
    *   Clicks "Create Goal" -> Modal: "You've reached the limit of 1 active goal. Archive your current goal or upgrade to Pro to engineer your entire life."
    *   User CAN archive the old goal and create a new one (Start/Stop pattern allowed).

### B. AI Token Budgets (Fairness)

| Tier | Cap | Warning UX | At Limit Behavior |
|:---|:---|:---|:---|
| **Free** | 100k (~50 msgs) | 80%: "Running low on free credits." | **Hard Stop**: "You've used your free AI credits for this month. Upgrade for 20x capacity." |
| **Pro** | 2M (~1000 msgs) | 80%: "Whoa, you're on fire! Just a heads up on your fair usage." | **Throttle**: "Economy Lane" active. Responses delayed 2-5s. No lockout. |
| **Annual**| 3M (~1500 msgs) | same as Pro | same as Pro |

### C. Schedule Generation (The Hook)
*   **Free**: Can click "Generate Schedule". AI runs (low cost), but output is **blurred** or shown in a read-only modal "Preview".
*   **Pro**: Generates and **Syncs** to Google Calendar events block.

---

## 3. Annual Plan Rationale
*   **Offer**: Pay $100 upfront (equivalent to $8.33/mo).
*   **Incentive**:
    1.  **2 Months Free** (Standard cashflow driver).
    2.  **Higher Token Cap**: 3M tokens/mo vs 2M. (Trusts that committed users aren't bots).

---

## 4. Why No Overage Charges?
> "We believe in predictable billing. Users hate waking up to a $50 bill because they chatted too much. We prefer to 'throttle' speed rather than charge extra. This aligns incentives: we want efficiency, they want unlimited access. The 'Economy Lane' protects our margin without punishing their curiosity."
