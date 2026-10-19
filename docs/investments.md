# Investment experiments

The investment lab compares the working plan with five single-budget changes. It uses the existing simulation and the public expected market outlook. It does not draw future events, move the live campaign forward, or change its rules. Dollar values are synthetic USD millions; they are not CNH forecasts or project estimates.

| Experiment | Change from working plan | Earliest capability effect |
| --- | --- | --- |
| Workforce & cross-training | Add $0.6m training each projected month | Decision month; skill, quality and rework recovery accumulate |
| Quality & supplier development | Add $0.6m quality each projected month | Decision month; quality, rework recovery and supplier reliability |
| Facility upkeep & reliability | Add $0.5m maintenance each projected month | Decision month; plant condition and effective capacity |
| Factory capacity upgrade | Add $8m capex once | Decision month plus three; cash leaves immediately |
| Product engineering program | Add $1.5m engineering each projected month | Each expenditure month plus three; product technology supports demand |

Each increment is limited by the existing budget maximum. A budget already at its maximum disables its experiment. Applying an experiment copies its numeric plan into the working plan; the player still decides whether to commit the month. Application is not a project approval or simulation advance. The recurring projection assumes that the player continues that policy in later rounds; it does not lock future budgets.

Prices, requested output, financing terms, borrowing, overtime and unrelated spending are held constant. Capex and corporate borrowing/repayment apply in the first forecast month only; both reset to zero afterwards. Other controls repeat. No additional credit or automatic rescue is supplied. A technically feasible plan can still run out of cash.

## Reading the comparison

The lab reports incremental funding, cumulative earnings and revenue, customer sales, ending cash/debt/inventory, the lowest projected cash balance and its month, ending customer unit share, and operating capabilities. A positive capability effect does not ensure sales or profit: component availability, output targets, dealer inventory, demand and competition still matter. A capacity project cannot cure a controller shortage by itself. Engineering can stimulate demand that the existing output plan cannot fulfill.

Profit and cash are different measures. Training, quality, maintenance and engineering are expenses when spent. Factory investment increases fixed assets and consumes cash in the decision month; depreciation attributable to the addition starts in the following month, before the additional capacity arrives. Asset balances are book values, not project returns. Fixed unit standard costs do not automatically fall when a capacity upgrade completes. The model has aggregate workforce skill and plant condition; it has no per-station cross-training matrix, individual employees or detailed automation engineering.

First benefit is an earliest modeled capability date, not a promised financial payoff. Saturation, rounding and other constraints can suppress a visible improvement. The API also reports the first capability improvement actually present in the common comparison window. Existing funded projects appear separately with maturity at current month plus remaining delay. A new project decided in month 1 reaches operating capability in month 4. Projects maturing after month 12 have no modeled campaign operating benefit.

All displayed deltas use a common number of elapsed months across enabled options. If any case ends in financial distress, every difference stops at the earliest such month. The complete per-option path is retained separately, but its longer cumulative profit cannot be compared with a shorter path as if they covered the same period. This is a planning experiment, not an optimized investment recommendation, ROI calculation, or proven payback period. Future shocks may change the result.

Quality is weighted by assembled units over the comparison period, and service by dealer orders. If no units are assembled, quality falls back to average projected quality; if no dealer orders exist, service is 100% by the simulation convention. Capacity and skill/condition/technology/reputation are ending capabilities. Market share is ending monthly customer retail sales divided by that month's modeled industry demand; it is not factory shipments or annual revenue share.

## API

`getInvestmentOptions(state, plan, horizon = 6)` accepts an integer from 1 to 12 or `'year-end'`. It validates its input, returns `available: false` for a finished campaign, and never mutates its inputs. A live campaign with an invalid plan throws a descriptive error.

The result contains `decisionMonth`, `horizonRequested`, `horizonAvailable`, `horizonModeled`, `comparisonMonths`, `comparisonEndMonth`, `truncated`, `comparisonNote`, `pipeline`, `warnings`, `assumptions`, and `options`. Option IDs are `baseline`, `training`, `quality`, `maintenance`, `capacity` and `engineering`. Warnings identify financial distress even if it occurs exactly at the requested endpoint.

Each option contains its `plan`, `planChanges`, `enabled`/`canApply`, `disabledReason`, `costCommitment`, `timing`, `warnings`, full `months`, full-run `summary`, and common-horizon `comparison`. Disabled options have no summary or comparison. Option warnings identify negative projected cash and delayed capability benefits beyond the comparison window. `costCommitment` distinguishes the planned incremental expenditure over the available requested horizon, the expenditure modeled before the option stops, and the expenditure inside the common comparison window. These are budget differences, not the total company cash effect.

Use `option.comparison.selected` and `.baseline` for side-by-side totals and `.delta` for like-for-like differences. `.monthly` gives the same baseline/selected/delta structure for each matched month. Use `.summary` only when explicitly describing that option's full run. Summary fields include `revenue`, `profit`, `deliveries`, `retailSales`, `production`, `endingCash`, `endingDebt`, `endingCorporateDebt`, `endingInventory`, `minimumCash`, `minimumCashMonth`, `endingUnitShare`, `qualityRate`, `serviceLevel`, `capacity`, `capacityBonus`, `skill`, `condition`, `technology`, `reputation` and `qualityCapability`.
