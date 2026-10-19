# Board mandate and monthly review

The board gives the player a public operating objective before a new campaign starts, then evaluates business outcomes against that objective each month. Quarterly reviews appear after months 3, 6, 9 and 12 of each year. These are synthetic educational objectives, not CNH guidance or measured industry targets.

`src/board-mandate.js` is a read-only layer. It does not alter the engine, saved financial statements, committed plans or future market events. Its exports are `getBoardMandate(state)`, `getBoardReview(state, month)` and `getBoardDashboard(state, plan)`.

## Fixed goals and honest history

The opening public scenario selects one of three mandates:

| Opening market | Board emphasis | Year 1 earned-value goal | Year 1 retail-share goal | Cash plus undrawn credit goal |
| --- | --- | ---: | ---: | ---: |
| Soft | Protect cash, quality and delivery; avoid idle expansion | $0m cumulative gain | 17.0% | $175m |
| Flat | Profitable share growth and productive working capital | $18m cumulative gain | 18.0% | $165m |
| Upswing | Capture profitable demand while funding useful capacity | $36m cumulative gain | 18.5% | $150m |

All monthly, quarterly and annual goals are disclosed together. Targets never depend on a hidden future draw, the chosen plan, or later market outcomes. A new public outlook changes the board's commentary, not its score thresholds. This deliberately makes a downturn a strategic problem rather than quietly relaxing the objective.

Three-year campaigns announce the whole path at opening. Cumulative earned-value milestones are $0m/$12m/$30m in the soft mandate, $18m/$50m/$90m in flat, and $36m/$90m/$160m in upswing. Retail-share milestones are 17.0%/17.5%/18.0%, 18.0%/18.5%/19.0%, and 18.5%/19.5%/20.5%, respectively. Intermediate months interpolate between annual endpoints. Year 1 starts with an $8m earnings-transition allowance; this is a target assumption, not an extra opening accounting balance. No capital spending is mandatory.

Version 1.0 and 1.1 saves keep their original twelve-month duration. When an older campaign had no board mandate on screen, its newly available assessment is explicitly a **retrospective learning benchmark**, not a target the player previously agreed to meet. The UI may set `boardMandateVersion: '1.0.0'` only when starting a fresh campaign; it must never add this marker on load or import. A marked new one-year campaign and an unmarked older one have identical numeric target paths, with different historical disclosure. Version 1.2 introduces the preannounced three-year mandate.

## Six measures

| Measure | Weight | Actual measure | Target and stretch |
| --- | ---: | --- | --- |
| Earned company value | 30 | Cumulative gain in risk-adjusted book equity | Monthly mandate path; stretch is target + $10m + $0.7m per elapsed month |
| Cash and available credit | 15 | Cash + max(0, $160m − corporate debt) | Regime-specific target; stretch is target + $80m |
| Factory inventory cover | 10 | All factory inventory / recent monthly COGS | 1.25, 1.10 and 0.95 months in months 1–3, then 0.80; stretch 0.15 |
| Dealer delivery | 20 | Deliveries / replenishment orders | 90%, 92% and 94% in months 1–3, then 95%; stretch 100% |
| First-pass quality | 10 | (Assemblies − first-pass defects) / assemblies | 95.5% + 0.06 percentage points per month, capped at 97.6%; stretch 99.2% |
| Retail unit market share | 15 | Retail units / same-period modeled industry units | Monthly mandate path; stretch is target + 2.5 percentage points |

Inventory cover uses average COGS across the latest three months, or the available months, with an $8m denominator floor. Stock includes components, work in progress, rework and finished machines. Dealer-owned stock is not a company inventory asset. The inventory measure is deliberately paired with delivery and retail share so starving the factory cannot win through a low inventory ratio alone.

Earned value uses the same realization discounts as the engine's adjusted-equity measure: 20% of finished goods and rework standard cost, 35% of incomplete equipment standard cost, 3.5% of receivables and 2.5% of customer loan assets. Recorded debt, payables and warranty reserves are already in book equity; none is deducted twice. The change compares the ending adjusted equity with the reconstructed opening adjusted equity.

Corporate borrowing raises cash and debt equally. It neither creates book equity nor increases cash plus undrawn credit. Customer-finance debt remains matched to customer-loan assets through the engine. Financed principal is not company revenue.

Monthly reviews use that month's delivery, quality and share flows. Quarterly reviews sum the quarter's numerators and denominators, while value, liquidity and inventory are measured at quarter end. A quarter-end forecast is clearly identified as a mixed actual-to-date plus expected final month, rather than a completed quarter. No assembly yields an unmeasured quality result and zero quality points. If there are no dealer orders but customers are still buying available stock, dealer delivery is treated as fulfilled; with no orders and no retail activity it is zero.

## Scoring and interpretation

Each measure has an explicit floor, target and stretch threshold. The floor earns 0/100, the exact target earns 75/100, and stretch earns 100/100, with linear interpolation and clamping between anchors. The weighted component points add to the board score. No comparison group, best-of-nine uplift, forced grade distribution or bonus for spending enters this score.

The component zero-point floors are target minus `$14m + $0.8m × month` for earned value, $25m liquidity, 3.5 months inventory, 45% dealer delivery, 90% quality and 55% of the share target. Inventory is the sole lower-is-better measure.

The composite reads **Beating** at 85 or more, **Meeting** at 70–84, and **Behind** below 70. Letters remain A ≥90, B ≥80, C ≥70, D ≥60, F below 60. A solid plan that meets its goals should score around 75; an A requires performance toward stretch, not merely choosing a reasonable plan.

Individual metric statuses allow a small measurement tolerance: $2m earned value, $5m liquidity, 0.10 inventory-cover months, 2 percentage points delivery, 0.3 percentage points quality, and 0.2 percentage points share. Better than target plus tolerance is Beating; within tolerance is Meeting; below it is Behind. These tolerances affect the wording, not the numeric score. An absent quality measurement reads Unmeasured.

Financial distress caps the board score at 39. Negative closing cash caps it at 59; undrawn credit must actually be drawn to pay a bill. Dealer delivery below 50%, share below half its target, or no retail sales also caps the total at 59. If a cap binds, component points scale proportionally and the uncapped score and guardrail remain available. Thus displayed points still reconcile to the final score.

Actual board outcomes and decision coaching answer different questions. The board asks whether the business met its published goals, including the effects of real surprises. Decision coaching assesses whether the chosen plan used the information available before those surprises. Neither should be presented as the other.

## Future value and investment

The board separately shows current plant condition, workforce capability, technology, reputation, fleet reliability, capacity utilization and funded project completion dates. New factory investment and engineering first benefit operations three subsequent rounds after the funding month. Pipeline maturity is the ending month plus the project's remaining lead time.

These are indicators of future earning potential, not a fictional discounted-cash-flow valuation. Factory capex is already recorded in fixed assets; its pipeline budget is not added again. Engineering is expensed on funding; the pipeline is not invented as an accounting asset. Neither spending amount receives score points. A larger factory must turn useful capacity into profitable sales to build earned value. Book earnings can precede collection, with receivables carrying their realization discount; cash payback requires the invoices to be collected. Engineering changes technology and demand after its lead time, with a current earnings and cash cost.

## Validation

Historical review reconstructs the initial state under the original model version and replays the recorded plans. It rejects projections masquerading as actual results, edited financial reports, altered seeds and current positions that cannot be reproduced. Explanatory text and extra UI metadata do not invalidate otherwise identical numerical history. A per-state replay cache checks a serialized fingerprint, so a subsequently mutated object cannot reuse stale results.

Tests cover opening disclosure, seed-independent goals and forecasts, stable historical reviews, three-year and quarter boundaries, preservation of older campaigns, accounting/share reconciliation, weighted quarter flows, borrow-neutral scoring, investment lead times without value bonuses, idle-operation and distress guardrails, invalid plans and forged history. Reference demand-matched policies show a broad range of board results rather than automatic 89–95 scores; the calibration does not force a distribution.
