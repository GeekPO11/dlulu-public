# Pricing Strategy Workspace

> **Source of Truth**: This `/pricing_strategy/` folder is the canonical source for all pricing decisions, research, and rationale. Future AI prompts and team members MUST read these docs before proposing changes.

---

## Rules of Engagement

1. **Pricing docs are the source of truth** — Any pricing-related claim must be traceable to these files.
2. **Every step must read these docs first** — Before editing, always read: `00_README.md`, `00_PLAN_NEXT_PROMPTS.md`, and any relevant context files.
3. **Edit only what the prompt specifies** — Each prompt designates which files may be edited; do NOT modify others.
4. **No invented facts** — If a claim cannot be grounded in code, docs, or external research, it must be logged as an assumption in `90_assumptions_log.md`.
5. **Log unknowns/questions** — Any blockers or questions must go into `91_questions_blockers.md`.
6. **Cite evidence properly** — Use `[code_path]` or `[doc_path > section]` format. Keep quotes ≤25 words.

---

## File Index

| File | Purpose |
|------|---------|
| `00_README.md` | This file. Rules of engagement, index, and workspace overview. |
| `00_PLAN_NEXT_PROMPTS.md` | Continuation plan with numbered steps, inputs, outputs, and "done when" criteria. |
| `01_context_brief.md` | Product context, market positioning, and repo evidence pointers (template for Step 2). |
| `02_product_map.md` | *(Step 3)* Feature inventory with constraints and pricing implications. |
| `03_metering_cost_drivers.md` | *(Step 4)* Metering opportunities and cost drivers analysis. |
| `04_cost_model.md` | *(Step 5)* Unit economics and COGS breakdown. |
| `05_market_competitors.md` | *(Step 6)* Competitive landscape (requires user input if no web access). |
| `06_packaging_value_metric.md` | *(Step 7)* Tier structure and value metric selection. |
| `07_pricing_model.md` | *(Step 8)* Final pricing model with rationale. |
| `08_rollout_playbook.md` | *(Step 9)* Launch plan, migration, and communication strategy. |
| `90_assumptions_log.md` | All assumptions logged with confidence, impact, and validation path. |
| `91_questions_blockers.md` | Open questions, blockers, and data needs. |
| `93_REPO_MAP.md` | Evidence-based repo analysis: tech stack, cost drivers, metering hotspots. |

---

## How to Use This Workspace

1. **Start here** — Read this file to understand the rules.
2. **Check the plan** — Read `00_PLAN_NEXT_PROMPTS.md` to see what step comes next.
3. **Run the next prompt** — Copy the exact prompt from the plan and execute it.
4. **Iterate** — Each step builds on previous outputs. Do not skip steps.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1 | 2026-02-03 | AI (Claude) | Initial workspace setup with repo analysis |
