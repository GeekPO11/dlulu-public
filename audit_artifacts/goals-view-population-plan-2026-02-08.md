# Goals View Population Plan (Pre-Go-Live)

Date: 2026-02-08
Owner: Engineering Audit
Scope: `Behavior Plan`, `Critical Gaps`, `Risk Profile` not consistently populating in Goals View.

## P0 Objective
Ensure every goal always has deterministic, non-crashing render behavior for strategy/risk sections, with clear retry paths when AI output is partial.

## Field Mapping Matrix

| Product Field | Source | App Model Field | DB Column | UI Consumer | Purpose |
|---|---|---|---|---|---|
| Strategy Overview | AI overview function / manual edits | `goal.strategyOverview` | `goals.strategy_overview` | Overview card | High-level execution narrative |
| Critical Gaps | AI overview function / persisted fallback | `goal.criticalGaps: string[]` | `goals.critical_gaps` | Critical Gaps section + risk derivation | Surface blockers and failure points |
| Behavior Plan (SMART/WOOP/Intentions/Habit/Friction) | AI overview function / manual edits | `goal.behaviorPlan` | `goals.behavior_plan` | Behavior Plan section | Concrete behavior execution layer |
| Risk Level | Explicit AI/manual + derived from gaps | `goal.riskLevel` | `goals.risk_level` | Risk Profile chip | Safety/sensitivity signaling |
| Overview Generated | Completeness gate | `goal.overviewGenerated` | `goals.overview_generated` | Readiness state | Prevent false “ready” states |

## Root Causes Found

1. Overview state marked `ready` when strategy+gaps existed, even if behavior plan was missing.
2. DB-to-app transform accepted malformed `critical_gaps`/`behavior_plan` shapes without normalization.
3. Goals view rendered risk/gaps from raw payload and could be wrong or brittle for malformed data.
4. App update/create paths previously dropped some overview fields (fixed earlier in current branch).

## Implemented Fixes

1. Added strict completeness gate requiring strategy + gaps + behavior content.
2. Updated GoalLibrary status transitions to use completeness checks before setting `ready`.
3. Hardened DB transforms for `critical_gaps`, `behavior_plan`, `risk_level`, and `preferred_days`.
4. Normalized critical gaps before rendering in GoalDetailView and before risk calculations.
5. Expanded tests for goal overview utilities, field persistence mapping, and DB transform edge cases.

## Edge Cases Covered

1. `critical_gaps` arrives as newline string from legacy/incorrect writes.
2. `behavior_plan` arrives as JSON string.
3. `risk_level` is invalid enum value.
4. `preferred_days` contains mixed invalid types.
5. Strategy/gaps present but behavior plan empty -> no false `ready`.
6. Explicit low risk with medium/high derived risk from gaps -> higher risk wins.

## Test Checklist

1. `tests/goal-insights.test.ts`
2. `tests/goals-view-population.test.tsx`
3. `tests/goal-transformers.test.ts`
4. `npm run check:critical`
5. `npm run check:pregolive`

## Go-Live Guardrail

Before prod deploy, run `npm run check:pregolive` and confirm:
1. all 3 goal population test files pass
2. full suite passes
3. production build succeeds

