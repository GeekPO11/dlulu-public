# Pricing Strategy — Continuation Plan

This document outlines the step-by-step process to develop a complete pricing strategy for dlulu. Each step specifies its objective, required inputs, outputs, and completion criteria.

---

## Step 1: Workspace Setup ✅
**Objective**: Create the pricing_strategy folder and foundational files.  
**Inputs**: Repository codebase  
**Outputs**: `00_README.md`, `00_PLAN_NEXT_PROMPTS.md`, `93_REPO_MAP.md`, `01_context_brief.md` (template), `90_assumptions_log.md`, `91_questions_blockers.md`  
**Done when**: All files exist, 93_REPO_MAP contains evidence-based findings.

---

## Step 2: Context Brief
**Objective**: Complete the product context brief with market positioning, user personas, and business goals.  
**Inputs**: 
- `00_README.md` (rules)
- `93_REPO_MAP.md` (repo evidence)
- `01_context_brief.md` (template)
- User input on business goals, target market, pricing philosophy
**Outputs**: 
- `01_context_brief.md` (completed)
- `90_assumptions_log.md` (updated if assumptions made)
**Done when**: Context brief is complete with user-validated business goals and target personas.

---

## Step 3: Product Map
**Objective**: Create a comprehensive feature inventory showing what the product does, with notes on constraints and pricing implications.  
**Inputs**: 
- `00_README.md`
- `93_REPO_MAP.md`
- `01_context_brief.md`
- Repo exploration (components, Edge Functions, types)
**Outputs**: 
- `02_product_map.md`
- `90_assumptions_log.md` (updated)
**Done when**: All major features are catalogued with repo evidence, constraints noted.

---

## Step 4: Metering & Cost Drivers
**Objective**: Identify where usage can be metered and what drives costs (AI calls, storage, compute).  
**Inputs**: 
- `93_REPO_MAP.md` (pricing-relevant hotspots)
- `02_product_map.md`
- Repo analysis of Edge Functions, API calls
**Outputs**: 
- `03_metering_cost_drivers.md`
- `91_questions_blockers.md` (updated with data needs)
**Done when**: Metering opportunities listed, cost drivers identified with code evidence.

---

## Step 5: Cost Model
**Objective**: Build a unit economics model showing COGS per user/action.  
**Inputs**: 
- `03_metering_cost_drivers.md`
- User-provided data: Supabase costs, Gemini API costs, hosting costs
- `91_questions_blockers.md` (data needs section)
**Outputs**: 
- `04_cost_model.md`
- `90_assumptions_log.md` (cost assumptions)
**Done when**: Unit costs estimated for key actions (AI call, event creation, storage).

---

## Step 6: Market & Competitors
**Objective**: Analyze competitive landscape and market benchmarks.  
**Inputs**: 
- `01_context_brief.md`
- User-provided competitor list or web research (if available)
- Pricing pages of similar products
**Outputs**: 
- `05_market_competitors.md`
- `91_questions_blockers.md` (if competitor data missing)
**Done when**: 3-5 competitors analyzed with pricing models and positioning.

---

## Step 7: Packaging & Value Metric
**Objective**: Define tier structure and select the value metric that aligns with customer value.  
**Inputs**: 
- `02_product_map.md`
- `03_metering_cost_drivers.md`
- `05_market_competitors.md`
- `01_context_brief.md`
**Outputs**: 
- `06_packaging_value_metric.md`
- `90_assumptions_log.md` (updated)
**Done when**: Tiers defined with feature gates, value metric selected with rationale.

---

## Step 8: Pricing Model
**Objective**: Propose specific price points with justification.  
**Inputs**: 
- `04_cost_model.md`
- `05_market_competitors.md`
- `06_packaging_value_metric.md`
- User feedback on willingness-to-pay research (if available)
**Outputs**: 
- `07_pricing_model.md`
- `91_questions_blockers.md` (validation needs)
**Done when**: Price points proposed with margin analysis and competitive positioning.

---

## Step 9: Rollout Playbook
**Objective**: Create implementation plan for pricing launch.  
**Inputs**: 
- `07_pricing_model.md`
- `93_REPO_MAP.md` (plan gating feasibility)
- Technical requirements for billing integration
**Outputs**: 
- `08_rollout_playbook.md`
**Done when**: Timeline, migration plan, communication templates, and technical requirements documented.

---

## Quick Reference

| Step | Name | Key Output | Depends On |
|------|------|------------|------------|
| 1 | Workspace Setup | 93_REPO_MAP.md | — |
| 2 | Context Brief | 01_context_brief.md | Step 1 |
| 3 | Product Map | 02_product_map.md | Steps 1, 2 |
| 4 | Metering & Cost Drivers | 03_metering_cost_drivers.md | Steps 1, 3 |
| 5 | Cost Model | 04_cost_model.md | Step 4 |
| 6 | Market & Competitors | 05_market_competitors.md | Step 2 |
| 7 | Packaging & Value Metric | 06_packaging_value_metric.md | Steps 3, 4, 6 |
| 8 | Pricing Model | 07_pricing_model.md | Steps 5, 6, 7 |
| 9 | Rollout Playbook | 08_rollout_playbook.md | Step 8 |
