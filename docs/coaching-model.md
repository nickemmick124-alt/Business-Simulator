# Monthly business coaching — versioned decision standards

This is an educational comparison using the game's synthetic rules. It is not an assessment of a real manager, a calibrated CNH performance measure, or a global optimization algorithm.

New executive campaigns (`1.3.0`) use decision-quality rubric **3.0**. Existing `1.0.0`, `1.1.0` and `1.2.0` campaigns retain rubric **2.0**, including its exact scores. Opening a saved campaign does not upgrade its scoring or financial rules.

## Keep the questions distinct

**Board performance** asks whether realized results meet the company's published mandate. Its goals and employment consequences are separate from coaching.

**Decision quality** asks how the chosen plan performs against operating standards using the public forecast and opening position. It cannot see the next month's random demand, supply, quality or credit results. Visiting an advisor does not award points: the information helps the player choose a better plan. A weak opening business can produce a modest absolute grade even for the best policy tested. The comparison gap identifies avoidable shortcomings separately from that difficult starting position.

**Outcome score** applies the same coaching standards to realized results. Demand or supply surprises can change this score without changing decision quality. An unlucky result is not automatically evidence of a bad decision.

All scores use A ≥90, B ≥80, C ≥70, D ≥60, F <60. Weighted component scores reconcile to the rounded displayed total. Scores are not investment returns, valuations or probabilities of success.

## Rubric 3.0: earned operating results

| Dimension | Points | Standard |
| --- | ---: | --- |
| Earnings discipline | 30 | Operating earnings relative to a fixed reference revenue scale. Break-even earns 40%; a 10% reference return earns 70%; a 20% reference return earns 100%. |
| Cash & inventory discipline | 20 | Inventory coverage (65% of this dimension) and change in operating working capital (35%). |
| Serving customers | 20 | A combined dealer/retail fulfillment measure: 95% earns 75% of service points, while 99% earns 100%. |
| Quality & future capability | 20 | Achieved quality, plant condition, workforce skill and technology delivered by already-funded engineering. No points per dollar spent. |
| Liquidity resilience | 10 | Cash plus undrawn corporate credit relative to current operating expense and interest. Six months of this spending buffer earns 75%; twelve earns 100%. |

Meeting a defined standard generally earns 75% of its points; excellent scores require progress toward the stretch threshold. These are explicit teaching choices, not reported industry benchmarks. There is no random score adjustment, forced grade distribution, difficulty multiplier on scores, or arbitrary ceiling on good performance. Difficulty changes the business the player faces; the coaching standards stay the same.

### Exact criterion formulas

For most measures, `standard(value, floor, meets, stretch)` is a piecewise linear scale: zero at the floor, 75 at meets, and 100 at stretch, clamped to `[0, 100]`. Values below meets interpolate across floor–meets; values above meets interpolate across meets–stretch. Lower-is-better measures reverse the sign of their values and thresholds.

- **Earnings:** `clamp(40 + operatingProfit / referenceRevenue × 300, 0, 100)`. Reference revenue is the sum of product baseline demand × reference list price × 86% wholesale factor, with a $20m minimum. This fixed scale prevents shrinking shipments from mechanically improving a margin denominator. Borrowing is never earnings.
- **Inventory:** coverage is `inventory / max(8, COGS)`. Three months earns zero, 0.9 months earns 75, and 0.3 months earns 100. The COGS floor is $8m. Lean inventory must still be weighed against fulfillment: those outcomes are scored separately.
- **Cash conversion:** operating working capital is receivables + inventory − supplier payables. Increasing it by 35% of reference revenue earns zero, no change earns 75, and releasing 10% of reference revenue earns 100. Reducing inventory does not create accounting profit.
- **Service:** `70% × dealer shipments/dealer orders + 30% × retail sales/retail demand`. A zero denominator in one channel counts as fulfilled only if the other channel has activity. No activity in either channel earns zero. The combined measure earns zero at 50%, 75 at 95% and 100 at 99%. A 90% fulfillment rate is not an A when one in ten orders or purchases goes unfilled.
- **Capability:** 40% quality, 20% plant condition, 15% workforce skill and 25% funded technology. Quality blends 70% modeled process quality with 30% reported first-pass quality, preventing small production batches and integer defect rounding from overwhelming the measure. Quality thresholds are 90% / 97.5% / 99%; condition 70% / 95% / 100%; skill 75% / 100% / 108%; technology 0.85 / 1.03 / 1.15.
- **Funded technology:** start with ending technology and apply only engineering already in the pipeline, for up to three remaining campaign months. Each month adds `completedEngineering × 0.007`, subtracts `0.0025` obsolescence and applies the engine's 0.82–1.25 bounds. No unfunded future engineering is assumed. Projects maturing beyond the campaign do not earn pipeline credit. Capacity spending is not a quality or technology result; unused nameplate capacity earns no direct points. Its delivery and financial consequences appear in the relevant dimensions and the separate strategy comparison.
- **Liquidity:** resources are cash + `max(0, 160 − corporateDebt)`; monthly commitments are `max(6.25, operatingExpense + interestExpense)`. Resources divided by commitments earn zero / 75 / 100 at zero / six / twelve months. This is a spending buffer, not a forecast of time to bankruptcy: it excludes future sales receipts, supplier settlements, new loans and other future cash movements. Negative cash caps this dimension at `clamp(40 + 2 × cash, 0, 40)`; financial distress earns zero.

A forecast cash deficit caps the entire decision score at **59**; forecast financial distress caps it at **39**. Component points are reduced proportionally and disclose any additional `guardrailPenalty`, so their sum still reconciles. A draw that prevents an actual cash deficit can legitimately improve the score. An unnecessary corporate draw changes cash and undrawn credit by equal and opposite amounts, earning no extra points.

### Limited opportunity deduction

Every dimension is compared with the strongest value among nine feasible policy tests. The final percentage is:

`0.75 × absolute + 0.25 × max(0, absolute − 2 × gap)`

Here `gap` is the positive difference between the strongest tested criterion score and the chosen plan's criterion score. Comparison can only deduct points, by at most one quarter of the criterion score. Matching an equally weak alternative cannot manufacture a high grade. Component metadata includes `absoluteScore`, `benchmarkScore` and weighted `opportunityPenalty`. The best plan for one dimension can differ from the best combined plan.

## Reproducible calibration

The fixture below uses seed `4821`, Medium difficulty and the first twelve months of a new campaign. Policies stop if the company fails or the CEO is dismissed. These are model fixtures, not a reconstruction of the user's campaign.

| Policy | Soft | Flat | Upswing |
| --- | ---: | ---: | ---: |
| Demand-matched output, default budgets | 53–77 | 54–80 | 56–84 |
| Standing default production | 39–59 | 45–65 | 48–69 |
| No maintenance, training, quality or engineering | 39–63 | 49–69 | 43–70 |
| No production or operating development | 31–35 | 29–40 | 29–40 |
| Maximum input settings and available corporate draw | 36–37 | 36–37 | 36–37 |

The low opening demand-matched grade reflects the initial dealer-stock correction and forecast loss. A different plan cannot make that stock correction disappear. The comparison screen distinguishes its best tested choice from a high absolute business standard.

An A remains achievable. A separate 36-month Medium/Flat fixture uses prices 4% above reference, demand-matched output, quality $1.7m, training $1m, maintenance $1.1m and engineering $1.5m monthly. It completes the campaign and reaches **94/A** as funded capabilities and profitability improve. It does not earn an A merely by committing the budgets up front. This is an example of a feasible learning path, not a universally recommended policy or an optimal solution.

Automated calibration also compares all five policy families under the same seeds `17`, `4821`, and `9381` in Soft, Flat and Upswing markets. Assertions check economic relationships and failure behavior rather than forcing exact score distributions.

## Nine bounded comparison policies

1. The committed plan.
2. Output matched to expected dealer orders, using existing finished goods and recoverable rework.
3. A smaller component buffer with deferred capacity investment.
4. Lower demand spending, no overtime or new capacity, and demand-matched output.
5. Stronger quality, maintenance and training support with a delivery cushion.
6. Prices roughly 4% higher, with output resized to that forecast.
7. Prices roughly 4% lower, with output resized to that forecast.
8. Reference prices and a steady policy preserving capabilities.
9. A liquidity variant that draws credit only if expected cash needs a cushion.

All plans respect current-version controls, integer production and the available corporate facility. Executive supplier and dealer support controls survive candidate construction and appear in decision differences when changed. Some policies converge at control boundaries; these are nine policy tests, not necessarily nine unique mathematical solutions.

Candidate construction and **best tested before the round** selection finish before any actual result is computed. Each candidate is then replayed from the same opening state with the same realized exogenous shocks. **Best tested with hindsight** means highest outcome score within that limited set. Rounded ties prefer the earliest plan, with the committed plan first.

This comparison is primarily a one-month experiment, with explicit credit for already-funded near-term engineering. It is **not a global optimum**, an exhaustive search of controls, or a complete valuation of factory investment. The separate strategy comparison and financial projections examine a longer horizon. A hindsight plan is not automatically the right choice next month.

## Existing campaigns: rubric 2.0

Older campaigns retain their previous scores exactly. Rubric 2.0 uses earnings 25, working capital 20, service 20, capability 20 and liquidity 15 points, with the same bounded opportunity deduction and A–F thresholds.

Its earnings criterion is `clamp(50 + operatingProfit / referenceRevenue × 300, 0, 100)`. Inventory discipline is `clamp(100 − max(0, inventory/max(8, COGS) − 0.65) × 45, 0, 100)`; cash conversion is `clamp(85 − changeInWorkingCapital/referenceRevenue × 110, 0, 100)`. Working capital blends those 65%/35%. Service uses the raw 70%/30% fulfillment percentage. Capability blends 45% first-pass quality scaled from 86% to 98.5%, plus 55% capped budget support for maintenance, training, quality preservation and $1m of engineering. Liquidity reaches full credit at $35m cash plus undrawn credit, with the original negative-cash and distress penalties.

For seed `4821`, the old flat three-year model's first twelve demand-matched months score **74–93** under rubric 2.0. Scores clustered high because fulfillment percentages translated almost directly into points, the cash threshold was easily exceeded, and capability rewarded preservation budgets. Rubric 3.0 addresses those particular causes through explicit stretch standards and capability outcomes. It does not retroactively regrade the user's older campaign.

## Historical integrity

`getMonthlyCoaching(state, month)` recreates the campaign and replays saved plans through `createReplayInitialState()`. The simulation version determines financial rules, difficulty, campaign length and the appropriate coaching rubric.

Before producing a lesson, it checks generated numbers, physical flows, decisions, identifiers and statuses against saved reports. The latest current position must match too. Interface metadata such as the consultation journal and stored planning forecasts do not change financial replay. The journal is structurally validated by the engine; coaching neither invents past visits nor awards attendance points. Changes to explanatory wording are ignored. Modified numeric history, unreproducible starting conditions, unsupported data or a projected history returns an unavailable explanation instead of invented alternatives.

Review never changes cash, inventory, history, saves or future random outcomes. Reviewing an older month after subsequent choices returns the same lesson. `getPlanCoaching` contains only public-forecast comparisons; no realized shocks or hindsight are returned.

Tests cover exact legacy scoring, version selection, three-year replay, same-shock alternatives, seed-blind forecasting, consultation neutrality, new control preservation, borrowing neutrality and legitimate liquidity repair, capacity/spending behavior, earned A grades, broad same-seed policy calibration, component reconciliation and refusal to score modified or projected history.
