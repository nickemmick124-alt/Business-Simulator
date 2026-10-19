# Monthly business coaching — decision-quality rubric 2.0

This is an educational comparison, using the same synthetic rules as the game. It is not an assessment of a real manager, a calibrated CNH performance measure, or a global optimization algorithm.

## Two separate questions

The **decision-quality grade** asks how the committed plan performs against operating standards given the public forecast and opening business position, with a limited deduction for avoidable shortfalls against tested alternatives. It uses only `forecast()` results. It cannot see the current month's random market, supplier, quality, or credit outcomes. A difficult opening position can produce a modest absolute grade even for the best policy tested; the comparison gap separates that issue from avoidable mistakes.

The **outcome grade** applies the same scoring standards to the realized result. Demand or supply surprises can change this grade without changing the decision grade. An unlucky result is not automatically evidence of a bad decision.

Both use 0–100 points and the same letter thresholds: A ≥90, B ≥80, C ≥70, D ≥60, F below 60. The component scores add to the displayed rounded total.

The **board assessment** is separate: it compares realized results with the board's published goals. It answers whether the company delivered its mandate, while coaching evaluates the decision under the information available when it was made. Neither score is an investment return or a valuation.

## Weighted dimensions

| Dimension | Points | What it evaluates |
| --- | ---: | --- |
| Earnings discipline | 25 | Operating earnings relative to a fixed reference revenue scale. Corporate borrowing cannot create earnings. |
| Cash & inventory discipline | 20 | Factory inventory relative to shipment cost, and the change in receivables plus inventory less supplier payables. |
| Serving customers | 20 | A 70% dealer-order fulfillment and 30% retail-demand fulfillment blend. A complete absence of demand and orders does not earn perfect service points. |
| Quality & future capability | 20 | First-pass quality and support for maintenance, workforce skill, quality preservation, and ongoing engineering. |
| Liquidity resilience | 15 | Available cash plus undrawn corporate credit, with penalties for negative cash or financial distress. |

Each dimension blends 75% of its absolute criterion score with 25% of that same score after a comparative deduction. Specifically, `percentage = 0.75 × absolute + 0.25 × max(0, absolute − 2 × gap)`, where `gap` is the positive difference between the dimension's strongest tested public-forecast criterion score and the chosen plan's score. The benchmark can only deduct points, and the deduction is limited to one quarter of the criterion score. Matching the best tested policy no longer creates an automatic perfect comparative component.

The reference scales and weights are teaching choices, not reported industry benchmarks. High scores reward a balance of outcomes; the best plan for one component may differ from the best combined plan. Component metadata includes `absoluteScore`, `benchmarkScore` and `opportunityPenalty` in weighted points. There is no random adjustment, forced grade distribution or artificial curve.

### The absolute standards

- Earnings: `clamp(50 + operatingProfit / referenceRevenue × 300, 0, 100)`. Reference revenue is the sum of each product's baseline demand times reference price and the 86% wholesale factor, with a $20m minimum. Break-even earns 50% of earnings points; operating profit at 5% of reference revenue earns 65%, 10% earns 80%, and 16⅔% earns 100%. This is a fixed reference return, not the company's current-month operating margin: using the fixed denominator prevents shrinking shipments from mechanically improving this measure.
- Inventory: `clamp(100 − max(0, inventory / max(8, COGS) − 0.65) × 45, 0, 100)`. This contributes 65% of the cash/inventory dimension. The other 35% is `clamp(85 − changeInOperatingWorkingCapital / referenceRevenue × 110, 0, 100)`.
- Service: 70% of dealer shipments divided by dealer orders, plus 30% of retail sales divided by retail demand. A zero denominator in one channel is treated as fully served if the other channel has activity; zero activity in both channels scores zero.
- Capability: 45% comes from quality, scaled from 86% to 98.5% first-pass quality. The other 55% reflects support for maintenance (35%), training (20%), quality (25%), and engineering (20%). Spending credit is capped at the model's maintenance, training and quality preservation requirements and $1m of monthly engineering; unlimited spending cannot buy unlimited points.
- Liquidity: cash plus unused corporate credit reaches full absolute credit at $35m. Negative ending cash caps the dimension at 45% and reduces it further with the deficit; financial distress scores zero.

Drawing an extra $40m of corporate debt increases cash and reduces undrawn credit by the same amount. It does not improve ordinary risk points, income, inventory or company value. Borrowing can legitimately remove the negative-cash penalty when it prevents an otherwise forecast liquidity emergency. Loan-funded cash is never presented as operating earnings.

## Why the rubric changed

Rubric 1.0 assigned 65% of each dimension to a comparison that awarded 100% when a policy matched the strongest tested value. Consequently, several similarly weak choices could receive high grades together. The previous earnings anchor also awarded 65% for operating break-even. Version 2.0 removes the comparative uplift and makes operating break-even the midpoint of the earnings scale. Grades can still be high when the economics, inventory, service, capability and liquidity standards are high.

For a reproducible illustration, the original 12-month model with seed `4821` and a demand-matched policy each month scored **90–96** under rubric 1.0 and **74–92** under rubric 2.0. The cyclical soft scenario with the same seed and policy changed from **90–96** to **71–90**. The standing default policy in the original scenario changed from **76–86** to **64–81**. These are calibration fixtures, not a reconstruction of any player's saved game. The engine, plans and financial results did not change between those comparisons.

The low initial demand-matched grades reflect forecast losses during the opening dealer-stock correction. Later grades improve when earnings and inventory discipline improve. An opening shutdown with no maintenance, quality, training or engineering earns 37/F in the legacy fixture. A profitable, well-served business can earn an A. These differences follow the stated standards; the grader does not target a particular proportion of A–F outcomes.

## Nine bounded comparison policies

1. The committed plan.
2. Output matched to expected dealer orders, using available finished goods and rework.
3. A smaller component buffer with deferred capacity investment.
4. Lower demand spending, no overtime or new capacity, and demand-matched output.
5. Stronger quality, maintenance and training support with a delivery cushion.
6. Prices roughly 4% higher, with output resized to that plan's demand forecast.
7. Prices roughly 4% lower, with output resized to that plan's demand forecast.
8. Reference prices and a steady operating policy that preserves capabilities.
9. A liquidity-focused variant that draws credit only if the projected cash balance needs a cushion.

All plans respect the control ranges, integer production targets and the available corporate facility. Some policies can converge to the same inputs at a boundary; the screen presents nine policy tests, not necessarily nine unique mathematical solutions.

Candidate construction and **forecast-best** selection finish before any actual result is computed. The selected opening state is then replayed for every candidate using the original seed and identical exogenous shocks. **Best in hindsight among tested plans** is the highest resulting combined outcome score in this small set. Ties prefer the earliest plan, with the committed plan first. Rounded ties do not justify claiming one choice was superior.

This is a one-month experiment. It does not discover a globally optimal plan, inspect all combinations of inputs, or calculate the complete long-term return on a factory investment. Engineering and operating capability receive explicit stewardship credit, but expansion decisions still need the financial projection and a multi-year business case. The hindsight plan is not automatically the right plan for the following month.

## Historical integrity

`getMonthlyCoaching(state, month)` recreates the initial campaign and replays the saved plans up to the requested month through `createReplayInitialState()`. The simulation model determines the historical rules and campaign length.

Before producing a lesson, it checks that generated numeric and physical records, decisions, identifiers and statuses match the saved reports. When reviewing the latest month, the current position must also match. Additional interface metadata such as a stored planning forecast does not affect replay. Changes to explanatory wording are ignored. A modified numeric record, unreproducible opening position, unsupported model, or history made from projections returns an unavailable explanation instead of invented alternatives.

Review does not alter cash, inventory, history, plans, saves or future random outcomes. Reviewing an earlier month after more months have been played returns the same lesson, because subsequent decisions and observations are not used.

Grades are derived read-only, rather than persisted in financial history. Opening an existing save recalculates past coaching grades with rubric 2.0, and the returned `methodologyVersion` plus the visible methodology disclose this change. Recorded profits, inventory, cash, market outcomes and committed decisions remain unchanged. The coaching methodology version is separate from the simulation model version.

`getPlanCoaching(state, plan)` exposes the public-forecast portion for an optional planning preview. It contains no actual results or hindsight comparisons.

## Verification

Automated tests cover historical replay, exact same-shock alternatives, score independence from unobserved seed outcomes, borrowing neutrality and legitimate liquidity repair, neglect and zero-activity behavior, bounds and debt feasibility, immutable repeatable history, component reconciliation, and refusal to score modified or projected histories. Calibration tests check that a uniformly loss-making comparison set cannot manufacture an A, that comparison only deducts a bounded amount, and that neglect, standing output, inventory discipline and profitable improvement produce meaningfully distinct grades.
