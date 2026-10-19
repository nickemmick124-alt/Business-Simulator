# Simulation model 1.0

This is an original educational simulation with **synthetic operational and financial parameters**. It is not a CNH valuation, forecast or digital twin. Products and representative plants illustrate relationships; no actual plant output, capacity, unit cost or credit portfolio is asserted.

## Campaign and units

Twelve monthly decisions begin with an operating company: raw kits and critical controllers, incomplete equipment, quality rework, factory and dealer stock, installed equipment, receivables, supplier payables, customer loans, fixed assets, debt and warranty reserves. Monetary state and reports use USD millions. Price controls use USD thousands. Quantity fields are whole machines/components, rates are percentages in controls and fractions in reports.

The engine exports `PRODUCTS`, `PLAN_FIELDS`, `createInitialState`, `defaultPlan`, `validatePlan`, `forecast`, `advanceMonth`, `validateState`, `getCampaignOutcome`, `balanceSheet`, `getMarketOutlook` and `MODEL_VERSION`. Forecast and commit return `{state, report}` without changing their arguments. The seed and model version reproduce commits. Forecast uses public seasonality and mean uncertainty; it does not call future random draws. Forecast histories are projections, not committed progress.

Rate fields in reports (`serviceLevel`, `qualityRate`) are fractions from 0 to 1. Multiply by 100 for a percentage display. `production` means good units released from assembly/quality, including recovered prior rework; `assembled` means units that consumed their final controller this month. Incomplete stock therefore reconciles with `assembled`, not `production`.

## Starting challenge and a playable benchmark

The inherited production targets are deliberately high relative to soft agricultural retail demand. With $125m opening cash, repeating the inherited plan for twelve months completes the baseline campaign but consumes most available cash. It should be presented as an existing policy to reconsider, not a recommended strategy.

A useful "Protect cash" policy sets component buffers to 5%, no capital expenditure or corporate debt change, and resets each production target from a public forecast: `(dealer orders + 0.15 × expected retail demand − opening finished goods − min(opening rework, 5)) / 0.96`, rounded up and bounded by the published control limits. The 0.96 factor allows for quality loss. This is an understandable starting policy, not an optimizer; the player still chooses prices, financing, investment and risk appetite.

Verification across seeds 0–99 found all inherited-plan campaigns completed, with ending cash of $6.7m–$29.2m. All "Protect cash" benchmark campaigns also completed, with minimum ending cash $138.8m. These are model test results, not business forecasts.

## Operating sequence

1. Existing engineering and factory projects mature after a three-month lead time. New projects enter their queues.
2. Maintenance, training, overtime and accumulated investment change capability. Product engineering improves demand after its delay.
3. Production targets and buffer policy generate kit/controller orders. Actual receipts respect supply capacity. Controller supply is visibly constrained in early months; actual availability varies around the known outlook.
4. Existing quality rework is recovered using capacity. Incomplete machines finish first, then new kits enter assembly. Each finished assembly consumes exactly one kit and controller. Missing controllers leave work in process. Defects enter a separate rework queue.
5. Dealer orders restore approximately 1.45 months of expected ending retail stock. Finished equipment ships against those orders. Customer demand removes units from dealer stock. Wholesale shipments and retail sales are separate quantities.
6. Customer loans originate only against actual retail sales. Existing cohorts amortize and incur losses; principal reduces the loan asset while interest is revenue. Matched debt funds 80% of the loan book.
7. Cash collections, supplier payments, costs, financing, investment, taxes and provisions resolve into reconciled statements.

Demand responds to price elasticity, seasonality, marketing with diminishing returns, financing rates, product technology, competitive pressure and accumulated reputation. The first release represents competition as a published market pressure and seeded demand variation, not autonomous competing companies. Retail demand and dealer orders are modeled in aggregate, not by geography.

## Accounting

Assets = cash + receivables + physical inventory at fixed standard unit cost + net fixed assets + retail loan book. Liabilities = corporate debt + matched finance debt + supplier payables + warranty reserve. Equity changes only by net profit.

Purchased kits/controllers create inventory and payables. Assembly labor is capitalized into incomplete or completed equipment. Shipping reduces inventory at standard cost and creates wholesale revenue and receivables. Dealer-owned stock is not a manufacturer asset. Supplier payments settle payables; invoice collections settle receivables. They do not create a second expense or revenue.

Marketing, engineering, quality, maintenance, training, overhead, overtime premiums, rework and inventory carrying costs are expensed. Factory investment becomes fixed assets and depreciates; it produces additional capacity after its delay. Product engineering is expensed when funded. Warranty provisions reduce profit and create a liability; claims consume the provision and cash, with any insufficiency expensed. Taxes apply to positive monthly pretax profit, without tax-loss carryforwards. Monetary values are carried to nine decimal places in millions; checks allow floating-point tolerance.

Cash-flow classification groups customer-lending principal under investing for this educational consolidated view. It is a game reporting convention, not a claim to reproduce CNH's statutory presentation. The balance sheet has one consolidated currency; no FX, intercompany eliminations, deferred tax or lease accounting is modeled.

## Failure and ending value

Negative cash is displayed as an emergency overdraft and remains a negative asset in every statement. It is not forgiven or concealed as revenue. A second consecutive negative-cash month, or nonpositive equity, ends the mandate. The first negative month gives the player one round to restore liquidity. Corporate borrowing is capped at $160m; matched finance debt is separate.

Ending value uses equity after all debt, payables and warranty reserves, with realization discounts for finished inventory, incomplete work, receivables and loans. Cash borrowed in the last month is offset by debt. Manufacturing inventory does not produce profit until a dealer orders and accepts it. Dealer orders are bounded by expected retail needs. Delivery, quality and future capability also affect the score. This is a transparent game score, not a financial valuation.

## Important simplifications

- Three representative product families share aggregate investment policies; no claim is made about CNH's actual footprint.
- Standard costs are fixed; no commodity-price hedges, FX, economies of scale pricing or dealer bankruptcy are modeled yet.
- Financed equipment uses 80% loan-to-value and 24-month straight-line principal repayment; the opening book has multiple maturities. These are gameplay assumptions.
- Supplier development partly improves controller availability immediately; longer qualification projects would be a future extension.
- Warranty claims follow a slowly changing reliability measure and installed base, rather than serial-number cohorts.
- A 12-month horizon exposes working capital, reliability and capital allocation. A later multi-year campaign can represent full product development and major plant construction more realistically.
