# Executive campaign rules · version 1.3

New campaigns default to 36 months and Medium difficulty. `createInitialState(seed, { difficulty: 'easy' | 'medium' | 'difficult', campaignMonths: 12 | 36, marketRegime: 'soft' | 'flat' | 'upswing' | 'random' })` selects the new rules. Existing 1.0, 1.1 and 1.2 campaigns retain their original outcomes, timing and difficulty. Starting a new campaign explicitly replaces the browser save; export first to retain a campaign.

## The monthly information loop

Six colleagues give different perspectives:

| Place | Colleague | Questions and levers |
|---|---|---|
| Headquarters | CFO | Break-even revenue, cash runway, borrowing, customer loans |
| Headquarters | Sales | Market size, dealer orders versus retail sales, prices, dealer service |
| Headquarters | Strategy and engineering | Technology gap, competitors, engineering lead time |
| Factory | Operations | Capacity versus utilization, training, maintenance, investment |
| Factory | Quality | Defects, rework, warranty accrual versus claims, fleet reliability |
| Factory | Supply | Controllers, incomplete machines, buffer stock, paid supplier support |

In Orbit, select a person. In Walk, approach and press E. Team → Consult gives the same information through ordinary accessible buttons, including when WebGL is unavailable. Find in 3D approaches a colleague without recording a consultation. Unread markers are blue; consulted markers show a green check.

The saved `ceoJournal` records month and visited roles. Each new month starts a fresh listening tour; earlier visits remain available for historical analysis. Meetings never change cash, factory output or grades. Public financial statements remain available throughout. Detailed briefings respond to the working plan and distinguish observed results from expected projections; no future random draw enters a briefing.

The practical value of a consultation is an explanation of current constraints plus a newly available family of prepared strategy experiments. Players may still enter every operating number directly. The commitment preview identifies missing perspectives without forcing attendance.

## Rival benchmarks

Northstar Equipment, Prairie Works and Ironvale Machinery are fictional. Their price, quality, technology, dealer reach and capacity benchmarks use visible synthetic rules. Technology, quality, reach and capacity progress over campaign months; these are not autonomous companies with their own financial statements.

The new engine multiplies demand by the reciprocal of weighted rival strength, bounded to 0.82–1.04. Strength uses technology, relative quality, price and dealer reach. This factor is distinct from the existing calendar competition factor, player reputation and product technology, and the selected difficulty factor.

Your latest share is retail sales divided by the modeled industry units. Rival shares allocate the remaining units according to benchmark weights, with the final rival receiving the rounding remainder. Only player retail sales are actual game transactions; rival allocations are estimates. Opening actual share is unavailable. Next-period projected share is displayed separately. Capacity compares company scale, not identical factories; copying a larger rival's capacity is not an investment recommendation.

## Two additional recurring levers

- **Supplier expediting and support:** $0–3m per month. Each $1m adds four percentage points to controller fulfillment above its baseline, capped at 100%. It does not bypass ordering or receipt limits. Full spending is an operating expense and cash cost in that month.
- **Dealer service support:** $0–3m per month. Demand multiplier is `1 + log(1 + spending) × 0.045`; closing reputation also improves by `spending × 0.0015` within existing bounds. The closing reputation benefit feeds later demand. Full spending is a current operating and cash expense.

These add to existing pricing, production, marketing, APR, quality, maintenance, training, overtime, buffers, engineering, factory investment and borrowing decisions. Engineering and factory projects still take three further rounds to mature. All costs reconcile through income, cash and the balance sheet; borrowing never creates profit.

## Difficulty and employment

| Mode | Demand factor | Surprise amplitude | Opening months without strikes | Unresolved strikes ending tenure |
|---|---:|---:|---:|---:|
| Easy | 1.04× | 0.7× | 3 | 5 |
| Medium | 0.97× | 1.0× | 2 | 4 |
| Difficult | 0.90× | 1.4× | 1 | 3 |

These factors are synthetic game parameters, not real industry forecasts. Difficulty is fixed at creation and preserved through saves/replay. Mean forecasts do not reveal seeded surprises.

A poor month means at least two failed minimum safeguards:

- Net profit below −$2m.
- Dealer delivery below 75% when there are orders.
- First-pass quality below 94%.
- Company inventory above 2.5 months of current cost of sales, using an $8m denominator floor.
- Cash plus unused corporate credit below $40m.

Negative cash or zero customer retail sales also each qualify a month as poor. After the protected opening period, each poor month adds one strike. Two consecutive months meeting every safeguard remove one strike. A strike produces a warning; one strike below dismissal is probation. Reaching the limit ends the mandate, even with positive cash. Financial distress can still end a campaign during the protected period. No further actual decision can be committed after either ending.

The tenure panel shows strikes and reasons, not another competing score. The board grade measures actual progress against the published goals; decision coaching evaluates expected results under the opening forecast. New campaigns use coaching rubric 3.0, while older campaigns keep 2.0. Exact board targets earn 75, and stretch performance is needed for an A. Difficult settings can make the same policy perform worse without changing a displayed target after the fact.

## Best tested with current information

The strategy adviser compares a bounded set of feasible policies over up to six expected months: current policy, steady policy, cash preservation, demand-matched output, pricing, dealer support, technology, capacity, quality, supply and a coordinated plan. Consultations unlock relevant families; objectives can emphasize balanced performance, growth or resilience.

The ranking uses adjusted value creation, minimum cash plus unused credit, weighted delivery, ending technology, ending retail share and quality. Weights and scales are disclosed. This is a priority index, not a new 0–100 grade. Cash shortfalls and projected dismissal or distress receive explicit penalties. Factory spending and borrowing apply once. Prices and recurring budgets repeat. Prepared demand-led alternatives recalculate output from each projected month’s public dealer forecast and available stock; the working and steady plans keep their submitted production targets. The UI discloses this policy, and future production changes must be reviewed manually when playing. New capex cannot earn a fabricated terminal return before its lead time finishes.

All displayed alternatives use a common elapsed window. If a case ends early, every numerical comparison is shortened to that date; later failures within the requested horizon remain warnings and ranking penalties. The tool uses the public expected market path. It does **not** quantify bull/bear stress distributions or prove a global optimum. A recommendation changes when the forecast, objective, working plan or available experiments change.

Applying an experiment copies only its first-month numbers into the editable plan. It never commits a month. Historical reviews replay the original opening state and use only that month's recorded consultations. They separate the reconstructed expected multi-month recommendation from one-month alternatives under the same realized shocks. A one-month hindsight winner is not evidence of the best six-month investment strategy.

## Verification and limits

Tests cover exact legacy replay, full-campaign financial reconciliation, difficulty, strike recovery/dismissal, seed-blind expected advice, journal persistence, historical information boundaries, comparison horizons, paid-lever costs, and DOM workflows. THREE scene-graph tests cover person markers, proximity, role identity, navigation and input handling. These tests do not replace visual WebGL/browser review or player assessment of enjoyment and balance.
