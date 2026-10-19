# Monthly business coaching

This is an educational comparison, using the same synthetic rules as the game. It is not an assessment of a real manager, a calibrated CNH performance measure, or a global optimization algorithm.

## Two separate questions

The **decision grade** asks whether the committed plan was sensible given the public forecast and opening business position. It uses only `forecast()` results. It cannot see the current month's random market, supplier, quality, or credit outcomes.

The **outcome grade** applies the same scoring standards to the realized result. Demand or supply surprises can change this grade without changing the decision grade. An unlucky result is not automatically evidence of a bad decision.

Both use 0–100 points and the same letter thresholds: A ≥90, B ≥80, C ≥70, D ≥60, F below 60. The component scores add to the displayed rounded total.

## Weighted dimensions

| Dimension | Points | What it evaluates |
| --- | ---: | --- |
| Earnings discipline | 25 | Operating earnings relative to a fixed reference revenue scale. Corporate borrowing cannot create earnings. |
| Cash & inventory discipline | 20 | Factory inventory relative to shipment cost, and the change in receivables plus inventory less supplier payables. |
| Serving customers | 20 | A 70% dealer-order fulfillment and 30% retail-demand fulfillment blend. A complete absence of demand and orders does not earn perfect service points. |
| Quality & future capability | 20 | First-pass quality and support for maintenance, workforce skill, quality preservation, and ongoing engineering. |
| Liquidity resilience | 15 | Available cash plus undrawn corporate credit, with penalties for negative cash or financial distress. |

Each dimension blends an absolute operating standard (35%) with comparison against the strongest result for that dimension among the tested public-forecast plans (65%). The comparative percentage is `max(0, 100 − 2 × gap)`, where `gap` is the difference in the dimension's absolute 0–100 score. This helps separate inherited conditions from avoidable mistakes. A company starting a difficult month need not fail merely because all feasible choices earn less than they would in an upswing.

The reference scales and weights are teaching choices, not reported industry benchmarks. High scores reward a balance of outcomes; the best plan for one component may differ from the best combined plan. The absolute standards remain visible as metadata, so a comparison with weak alternatives does not completely conceal poor operations.

### The absolute standards

- Earnings: `clamp(65 + operatingProfit / referenceRevenue × 210, 0, 100)`. Reference revenue is the sum of each product's baseline demand times reference price and the 86% wholesale factor, with a $20m minimum.
- Inventory: `clamp(100 − max(0, inventory / max(8, COGS) − 0.65) × 45, 0, 100)`. This contributes 65% of the cash/inventory dimension. The other 35% is `clamp(85 − changeInOperatingWorkingCapital / referenceRevenue × 110, 0, 100)`.
- Service: 70% of dealer shipments divided by dealer orders, plus 30% of retail sales divided by retail demand. A zero denominator in one channel is treated as fully served if the other channel has activity; zero activity in both channels scores zero.
- Capability: 45% comes from quality, scaled from 86% to 98.5% first-pass quality. The other 55% reflects support for maintenance (35%), training (20%), quality (25%), and engineering (20%). Spending credit is capped at the model's maintenance, training and quality preservation requirements and $1m of monthly engineering; unlimited spending cannot buy unlimited points.
- Liquidity: cash plus unused corporate credit reaches full absolute credit at $35m. Negative ending cash caps the dimension at 45% and reduces it further with the deficit; financial distress scores zero.

Drawing an extra $40m of corporate debt increases cash and reduces undrawn credit by the same amount. It does not improve ordinary risk points, income, inventory or company value. Borrowing can legitimately remove the negative-cash penalty when it prevents an otherwise forecast liquidity emergency. Loan-funded cash is never presented as operating earnings.

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

`getMonthlyCoaching(state, month)` recreates the initial campaign and replays the saved plans up to the requested month. This supports both the original 1.0 campaign and the optional 1.1 cyclical campaign through `createReplayInitialState()`.

Before producing a lesson, it checks that generated numeric and physical records, decisions, identifiers and statuses match the saved reports. When reviewing the latest month, the current position must also match. Additional interface metadata such as a stored planning forecast does not affect replay. Changes to explanatory wording are ignored. A modified numeric record, unreproducible opening position, unsupported model, or history made from projections returns an unavailable explanation instead of invented alternatives.

Review does not alter cash, inventory, history, plans, saves or future random outcomes. Reviewing an earlier month after more months have been played returns the same lesson, because subsequent decisions and observations are not used.

`getPlanCoaching(state, plan)` exposes the public-forecast portion for an optional planning preview. It contains no actual results or hindsight comparisons.

## Verification

Automated tests cover both campaign versions, exact same-shock alternatives, score independence from unobserved seed outcomes, borrowing neutrality and legitimate liquidity repair, neglect and zero-activity behavior, bounds and debt feasibility, immutable repeatable history, component reconciliation, and refusal to score modified or projected histories.
