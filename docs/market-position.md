# Market position and product perception

`getMarketPosition(state, plan)` in `src/market-position.js` is a read-only explanation layer. It uses the existing simulator and the market denominators from `getMarketIntelligence`. It does not change demand, accounting, saved campaigns, or future random events.

## Are we gaining or losing share?

Actual monthly unit share is customer retail sales divided by that month’s modeled industry units. Dealer shipments and wholesale revenue are not the numerator. Tractor, harvester, and loader shares use each family’s industry units; aggregate share uses the sum of all three families.

The history contains completed actual months only. Before month 1 there is no observed share. Before month 2 there is no observed change. A change from 18% to 19% is **+1 percentage point**, not 1% sales growth. The API expresses this as `changePP: 0.01`; multiply by 100 when displaying percentage points. Shares and growth rates are also fractions.

Each history row separates industry unit growth from company retail unit growth. Their difference provides context for relative performance. A growing market can coexist with falling company share, and share can improve while both the company and the market shrink. These comparisons describe results; they do not establish which decision caused them.

The `next` result is a separate projection for the selected operating plan. It never appears in actual history. Annual market value remains a reference-price estimate for the campaign’s three product families, not total global equipment demand or company revenue. With cyclical campaigns, observed industry denominators stay fixed while future public estimates can change. In a 36-month `1.2.0` campaign, annual TAM covers the current/upcoming twelve-month decision year, while actual share history continues across all completed campaign months. The annual reference switches to year 2 after month 12 and year 3 after month 24; a completed campaign retains year 3. Changing that displayed annual reference does not alter historical monthly denominators, shares or growth calculations. Legacy `1.0.0`/`1.1.0` campaigns keep their twelve-month span. Calendar labels distinguish January · Year 1 from January · Year 2; the share chart fits all 36 points and uses fewer axis labels as history grows.

## How is the product viewed?

The product panel exposes the actual model inputs, not invented customer surveys or competitor satisfaction scores:

| Measure | Meaning |
| --- | --- |
| Price relative to reference | List price divided by the fixed product reference price. This is a price comparison, not a measure of customer value. |
| Reputation index | A synthetic demand multiplier. Quality, dealer fulfillment, and unserved customer requests gradually change it. A value of 1.00 is the neutral model reference. |
| Technology index | Product capability relative to the model reference of 1.00. Engineering projects improve it after their development delay; capability erodes slightly each month. It is not a measured competitor average. |
| Fleet reliability index | The smoothed installed-fleet quality state used to estimate warranty claims. It is neither customer survey data nor observed uptime. |
| First-pass quality | Good units divided by units assembled in the completed month, before rework recovery. No assembly gives an unavailable observed rate. |
| Retail availability | Customer retail requests filled divided by customer requests. |
| Dealer fulfillment | Factory deliveries divided by dealer replenishment orders. This is a different stage from retail sales. |

Current reputation and technology values are closing capability states. The selected next-month demand explanation uses **opening reputation**, since reputation changes after sales, and **technology after completed engineering arrives**, since technology changes before demand. Projected closing reputation is shown separately.

Expected requests multiply baseline demand by public category conditions, relative price response, marketing, financing response, reputation, technology, and public competitive pressure, then round to whole units. `perception.next.demandFactors` exposes these exact multipliers. Supply and factory capacity constrain the ability to serve those requests; they do not themselves create demand. The engine’s public competitive-pressure factor is not a competitor rating or share estimate.

## Linking investments to outcomes

- Quality and training support first-pass yield; better quality and reliable delivery can gradually support reputation.
- Product engineering improves capability after its lead time. Current expense and cash must be weighed against later demand potential.
- Price, marketing, and financing can change customer requests immediately, with consequences for margin and financing income.
- More capacity only helps if a real operating constraint prevents profitable sales. Inspect dealer inventory, component availability, rework, and production targets first.

Unmet customer requests and dealer order fulfillment are exposed alongside share. They help distinguish an inability to serve demand from a lack of demand. A single share movement does not prove causation; compare plans under the same public conditions to investigate a hypothesis.

## Data contract and safeguards

The aggregate `annual` object contains `{ year, startMonth, endMonth, units, value }`, with inclusive absolute-month bounds for its twelve-month reference. Each product’s `annual` contains `{ units, value }` for that same year. The result contains `annual`, `aggregate`, `products`, `publicOutlook`, `forecastError`, `levers`, and `caveats`. Aggregate and per-product series contain `current`, `previous`, `changePP`, `marketGrowth`, `retailGrowth`, `growthGap`, `history`, and `next`. Actual rows use `retailSales` and `unitShare`; projected rows use `expectedRetailSales` and `expectedUnitShare`.

Invalid plans retain current observed results and public market context, with no selected-plan forecast and an explanatory `forecastError`. An absent plan produces no forecast without being an error. Active three-year campaigns continue next-month forecasts after months 12 and 24. Terminal campaigns retain all actual history and skip future forecasts; completion is month 12 for legacy models or month 36 for `1.2.0`. A zero denominator yields an unavailable ratio, not infinity or an invented perfect-service result. No state or plan is mutated, and the diagnostics never inspect future hidden random draws.
