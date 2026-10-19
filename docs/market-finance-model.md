# Market and financial planning model

This read-only analytics layer adds market context and forward financial statements. It reads the campaign's simulation version and never advances or converts a live campaign. Original `1.0.0` and cyclical `1.1.0` campaigns keep their twelve-month mandates. The `1.2.0` model supports a 36-month mandate with the [market-cycle model](market-cycles.md), continuing balances and projects across year boundaries. All figures are illustrative game assumptions, not reported CNH figures, a valuation of CNH, or a real equipment-market forecast.

## Scope and units

The **modeled addressable market** covers only the game's row-crop tractors, combine harvesters, and wheel loaders. It is not the global agricultural or construction equipment market. Money is USD millions unless noted. `referencePrice` is USD thousands per unit. Shares and changes are fractions: `0.20` means 20%, and `-0.05` means a 5% decline. Unavailable comparisons are `null`, never a fabricated zero.

Industry monthly units are calculated separately for each product family:

```
round(baseDemand / referenceUnitShare * publicCategoryOutlook)
```

The reference shares are tractors 20%, harvesters 18%, and loaders 16%. These assumptions scale the size of the opportunity; they do not establish the company's actual or expected share. In original `1.0.0` campaigns, the category outlook is the public agriculture or construction seasonal multiplier for each of months 1–12. In cyclical `1.1.0` and `1.2.0` campaigns, completed months use the observed category factors recorded in `report.marketContext.realized`; future months use the latest public outlook, which gradually returns observed deviations toward the initial scenario. In `1.2.0`, seasonality repeats by calendar month, while the declared longer-term cycle gradually returns toward the flat reference after the first year. Competitor pressure affects the company's demand but does not reduce the size of the industry market.

Monthly market value is monthly industry units multiplied by a fixed reference retail price: $145,000 per tractor, $360,000 per harvester, and $195,000 per loader. Annual units and value sum the twelve months of the current or upcoming decision year; the annual figure does not multiply a seasonal peak month by twelve or sum all three campaign years. At the close of months 12 and 24, the displayed annual reference switches to years 2 and 3. A completed 36-month campaign retains year 3 as its annual reference. The full timeline remains available for all 12 or 36 campaign months. For cyclical campaigns, that full-year estimate combines observed history with the remaining public forecast and can change as conditions become known. Prices, production decisions, marketing, and APR never change this industry denominator. A change in the player's prices may change expected demand and sales, but cannot mechanically inflate the estimated industry value.

Original campaigns keep the seed-independent industry denominator. New cyclical campaigns can differ because of their initial public scenario and subsequently observed market shocks. Given the same public scenario and observations, changing the hidden random seed does not change future public market projections: forecasts never inspect future shock draws. The historical denominator uses observed industry conditions, not the player's company sales.

## Market share and change comparisons

Actual estimated unit share is the latest completed month's customer retail sales divided by the same month's modeled industry units. It uses sales to customers, not wholesale deliveries into dealer inventory. Before the first month is committed, actual share is unavailable. Aggregate share is total retail units divided by total industry units across the three families; it is a volume measure, not a value share.

Next expected share uses the existing `forecast` function's expected customer retail sales, including stock constraints. Expected customer demand can exceed sales when the dealer network lacks available machines. This distinction preserves the difference between an opportunity, a customer request, a factory shipment, and a completed retail sale.

Market month-over-month change compares next month's industry units with the last completed month's industry units. Expected company demand change compares next month's expected customer requests with the latest actual customer requests (`report.products[].demand`). Expected retail-sales change compares expected retail sales with latest actual retail sales. These are different measures, so the interface should label each explicitly. Month 1 has no prior campaign month; all three changes are unavailable. A prior value of zero also produces `null` rather than infinite growth.

## Forward financial statements

`projectBusiness` runs the existing mean-outcome forecast sequentially. Each projected month carries forward its expected balance sheet, physical inventory, dealer stock, loan cohorts, capability changes, receivables, payables, and investment pipelines. It does not repeat the same opening state for each month and does not commit anything to the live campaign.

Current prices, production targets, recurring spending, overtime, component buffer, and financing APR continue unchanged across the projection. Corporate borrowing or repayment (`debtChange`) and factory capital spending (`capex`) apply **only in the first projected month**, then reset to zero. Other spending, including product engineering, recurs. These assumptions are visible in the API and should be visible beside projections.

The requested horizon defaults to three months and must be an integer from one through the campaign length: 12 for `1.0.0`/`1.1.0`, or 36 for `1.2.0`. A numeric horizon is an elapsed duration: `12` means twelve more months, even if that crosses a year boundary. The projection stops at its requested horizon, campaign end, or modeled financial distress, whichever comes first. Legacy campaigns do not extrapolate into a thirteenth month; three-year campaigns can carry operating and investment effects through month 36. In the Finance interface, “To year-end” converts the current/upcoming year end into a remaining-month duration; “To campaign end” uses all remaining campaign months. The UI selection value `12` for “To year-end” is therefore translated before calling this API. A completed or distressed campaign returns no future projection. These are expected scenarios, not probability ranges, commitments, or guaranteed results. Hidden future randomness is not read. Two otherwise identical states, including the same public market scenario and observations, that differ only in their random seed produce identical projections.

For the first projected month, revenue, company retail-sales, and customer-demand changes use the latest actual report as their comparator. Later projection months use the preceding projected report. `comparison.kind` and `comparison.month` identify that basis. No company comparison is available before the campaign has an actual result.

## Financial position and warnings

The financial position includes all original balance sheet lines, with three derived measures:

- Operating working capital = trade receivables + factory inventory − trade payables. It excludes customer loans and dealer-owned inventory.
- Corporate credit headroom = $160m credit limit − corporate debt. This is unused borrowing capacity, not cash or incremental equity.
- Net debt = corporate debt + customer-finance debt − cash. A cash overdraft therefore increases net debt. Customer-finance debt is also displayed separately because it supports the loan book.

No current ratio, debt maturity measure, or consolidated liquidity ratio is invented: the simulation does not contain the required current/non-current maturity split. Net debt does not offset the customer loan asset. The existing balance sheet displays that asset separately.

Each month's cash bridge copies the six reconciled original cash drivers. Their signed sum matches closing less opening cash, subject to rounding. Principal collections and financing borrowings are distinguished from operating revenue.

Warnings flag a projected cash overdraft, cash below an illustrative $20m watch level, an increase of more than $5m in operating working capital across the projection, unserved retail demand, and projected financial distress. These thresholds are game-planning prompts, not actual debt covenants. Each warning gives a month, explanation, and a player action to consider; it does not automatically change the plan.

## API contract

All exports are pure and return fresh analytics objects. They validate the supplied simulation state. Active financial projections require a valid numeric plan and throw descriptive `Error` messages otherwise. Market intelligence with a supplied non-null plan also validates it. Omitting the plan or passing `null` returns public market context: upcoming market month, units, value, and change remain available, while company projection fields are `null`. This supports showing the opportunity while a player corrects invalid inputs. Ended campaigns can return historical market context and an empty projection without a plan.

### `getMarketIntelligence(state, plan)`

- `scope`, `methodology`, `assumptions`: displayable strings and an array of assumptions.
- `annual`: `{ year, startMonth, endMonth, units, value }`, summed over the twelve months identified by the inclusive absolute-month bounds. `year` is 1, 2 or 3; for legacy campaigns it is always 1.
- `timeline`: 12 or 36 `{ month, units, value, marketChange, products }` entries, indexed by absolute campaign month. Historical observed denominators do not change when a new year begins. Each `products` entry contains `{ id, name, segment, units, value, marketChange }`.
- `current`: `{ month, marketUnits, marketValue, retailSales, unitShare }`, or `null` before the first actual month.
- `next`: `{ month, marketUnits, marketValue, marketChange, expectedDemand, expectedRetailSales, expectedUnitShare, retailSalesChange, demandChange }`, or `null` for a terminal campaign.
- `products`: `{ id, name, segment, referencePrice, baselineUnitShare, annualUnits, annualValue, current, next }` for each family. Product annual totals use the same year as aggregate `annual`. Product `current` and `next` have the same keys as their aggregate equivalents, scoped to that family.

### `getFinancialPosition(state)`

Returns all keys from `balanceSheet(state)`, plus `operatingWorkingCapital`, `corporateCreditHeadroom`, and `netDebt`.

### `projectBusiness(state, plan, horizon = 3)`

- `horizonRequested`: requested count; `horizonAvailable`: remaining calendar months, `campaignLength(state) - state.month`. Financial distress can make the returned horizon shorter.
- `assumptions`: displayable projection policy and interpretation.
- `current`, `ending`: financial positions. With no projection, both contain the current position.
- `months`: `{ month, status, report, openingBalanceSheet, balanceSheet, position, comparison, changes, cashBridge }` entries.
- `report`: the full existing expected simulation report, including income statement, cash flow, product flows, and reconciliations.
- `comparison`: `{ kind: 'actual' | 'projection' | 'none', month: number | null }`.
- `changes`: `{ revenue, retailSales, demand, market }`, each a fractional change or `null`.
- `cashBridge`: `{ label, value, detail }` entries, copied from the report's reconciled drivers.
- `stopReason`: `null` for a requested horizon ending before the campaign ends, `'year-end'` at the end of a legacy twelve-month campaign, `'campaign-end'` at month 36 in `1.2.0`, `'distress'` for projected financial distress, or `'campaign-ended'` for an already-ended input campaign.
- `warnings`: `{ id, severity, month, title, detail, action }` entries. `severity` is `'warning'` or `'danger'`.

Neither result contains the live state or a reference to its history. Existing saves need no migration; a new market model or longer mandate requires a new campaign rather than conversion of historical results. Display helpers label absolute months with their calendar month and year, such as month 14 as February · Year 2.
