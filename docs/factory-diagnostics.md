# Factory diagnostics and cost ledger

These views explain the game’s existing operational and accounting rules. They do not modify simulation mechanics, saves, random outcomes or the player’s plan. Every amount is a synthetic game assumption, not a CNH cost estimate. Company amounts use USD millions; machine costs use USD thousands; rates are fractions.

## What goes into a tractor

The standard row-crop tractor cost is $88,000:

| Component | Standard cost | Share of standard cost |
| --- | ---: | ---: |
| Component kit | $58,500 | 66.5% |
| Controller | $16,500 | 18.8% |
| Normal conversion | $13,000 | 14.8% |
| Total | $88,000 | 100% before display rounding |

The engine splits the $75,000 material cost 78%/22% between kit and controller. Normal conversion is a pooled assembly cost; the game does not have a separate wage, energy, engine, transmission or tire bill of material. Increasing productivity or capability does not lower these fixed standard costs in this version.

Overtime premiums, rework premiums, factory and corporate base expenses, chosen operating and engineering budgets, depreciation, inventory carrying and warranties are recorded separately. The existing Unit economics view shows contribution and an explicitly allocated estimate of full product cost. Do not add that full allocated cost back into standard inventory values.

## Inventory is an asset until it ships

`getCostLedger(state, plan)` values each product’s physical stocks with the engine’s exact rules:

| Stage | Unit carrying value |
| --- | --- |
| Unused kits | 78% of material cost |
| Unused controllers | 22% of material cost |
| Incomplete machines | Kit plus 60% of normal conversion |
| Rework awaiting quality release | Full standard material and conversion |
| Finished machines at factory | Full standard material and conversion |
| Independent dealer stock | Excluded from manufacturer inventory |

Current and forecast stage totals reconcile to the respective manufacturer balance-sheet inventory. The forecast bridge is:

`closing inventory = opening inventory + received materials + capitalized normal conversion − cost of shipped machines`

Purchasing materials and paying suppliers can occur in different periods. Shipment creates dealer revenue and releases standard cost of goods sold; collecting the invoice is another event. Dealer retail inventory remains visible for operating decisions, but it is not a manufacturer-owned asset.

The monthly inventory carrying expense is 0.4% of opening manufacturer inventory. It is separate from the inventory asset balance.

## Quality expense, warranty reserves and cash

The ledger presents the latest actual period separately from the next-month forecast. A new campaign has no actual monthly quality expense yet; the view returns `null`, not an invented opening expense.

The displayed quality expense subtotal is:

`quality prevention + rework premiums + warranty provision + unreserved warranty shortfall`

The displayed quality cash subtotal is:

`quality prevention + rework premiums + paid warranty claims`

Training, maintenance and engineering remain separately shown because they have broader purposes; no arbitrary percentage of these budgets is allocated to quality. Inventory carrying is also shown separately. First-pass defects and recovered rework are operational counts, not additional expenses to add on top of the recorded ledger.

Warranty accounting reconciles as:

`closing reserve = opening reserve + provision + shortfall expense − claims paid`

A provision reduces profit and creates a liability. A claim reduces cash and uses that liability. Only claims exceeding the available reserve and current provision create additional shortfall expense. Counting the full provision and full claims as current expenses would double-count.

The game’s rework premium is expensed when old rework is recovered. Defective machines retain standard cost in inventory while awaiting quality release. There is no separate scrap/write-off mechanic in this version. First-pass yield is unavailable when no new machines are assembled; recovered rework can still add good output in that month.

## What constrains the factory

`getFactoryDiagnostics(state, plan)` presents current and projected condition, workforce capability, quality, reputation and technology. The workforce skill index is a pooled capability proxy, not the percentage of cross-trained operators and not an employee skills matrix.

The physical flow separates:

- Base nominal capacity.
- Capacity after condition, skill, matured capital projects and overtime.
- Assembly capacity after slots used by rework.
- Opening incomplete machines completed, new starts, assembled machines and first-pass defects.
- Good new output versus older rework recovered.
- Kit/controller orders, receipts and opening stocks.
- Factory finished stock, dealer orders and shipments.

Completion utilization is assembled machines divided by assembly capacity. Work-slot utilization additionally counts starts left incomplete. Neither metric is a labor OEE measure. Both remain at or below 100% for valid game flows.

Constraint messages are derived from these flows rather than treating every missed target as a capacity shortage. The same plan can have several constraints:

- Controllers constrain completion when available controllers are exhausted before the physically possible target.
- Kits constrain starts when available kits cannot supply starts permitted by the target and assembly slots.
- Capacity constrains the requested maximum when the target exceeds assembly slots, even if components also limit realized output.
- Defects create a quality queue; recovering earlier rework consumes cash and assembly slots.
- Projected condition or skill declines identify maintenance or training that does not offset modeled deterioration.
- Finished-stock growth identifies production above current shipments. A buffer may be intentional; the diagnostic does not declare every increase bad.
- Unfilled dealer orders prompt a combined check of component availability, quality, production requests and capacity.

The first constraint is a displayed diagnostic priority, not a proven economically optimal intervention. These are mean-forecast explanations; unexpected market and supply changes remain possible.

## Investment effects and timing

| Lever | Existing modeled effect | Accounting and timing |
| --- | --- | --- |
| Training | Builds skill, improves first-pass quality and rework recovery | Current expense and cash; initial effects this month, skill persists |
| Quality and supplier development | Better first-pass quality, rework recovery and controller fulfillment | Current expense and cash; reliability affects warranty and reputation over time |
| Maintenance | Offsets wear and preserves available capacity | Current expense and cash; overtime increases wear |
| Factory capex | Each $1m completed adds 0.4 percentage points to shared capacity bonus, capped at 40% | Cash and fixed assets now; capacity after three further rounds; depreciation over time |
| Product engineering | Each $1m completed adds 0.007 technology index, subject to decay and bounds; supports demand | Current expense and cash; technology after three further rounds |

A project committed in month 1 becomes available in month 4. For a project already in the saved pipeline, availability is `current month + remaining rounds`. Late projects may mature after the twelve-month mandate. The view lists that date without promising benefits within the current campaign.

Factory capex does not independently improve quality or lower standard unit cost. Engineering is not a factory process-improvement project. This version has no separately selectable automation, tooling, facility-layout, engineering cost-reduction or workforce cross-training projects.

## API and graceful fallback

Both public functions return `status`, `month`, `forecastMonth` and `errors`:

- `forecast`: current context plus a valid next-month mean forecast.
- `invalid-plan`: current context remains available, with validation errors and no forecast.
- `current-only`: the campaign has ended; current context and separately labeled latest actual flow remain available.
- `invalid-state`: errors and empty product views; no fabricated diagnostics.

No future state or forecast is substituted for an ended campaign. Readers do not mutate their arguments. Tests cover accounting reconciliation, warranty shortfalls, physical constraints, no-assembly denominators, capability semantics, investment timing, legacy and cyclical campaigns, terminal/invalid inputs and immutability.
