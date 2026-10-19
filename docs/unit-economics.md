# Understanding unit economics

These numbers come from the game's existing accounts. They are synthetic teaching assumptions, not CNH product costs or financial guidance. `src/unit-economics.js` exports `getUnitEconomics(state, plan)` for the expected next month and `getReportEconomics(report)` for a recorded month. It does not alter the simulation, choose a price for the player, or use future outcomes.

## Start with the money earned on a shipment

The price control is the customer's list price in **USD thousands per machine**. The manufacturer earns **86%** of that list price when it ships to a dealer. Retail sales to the end customer are a separate physical flow; production alone does not earn revenue. Collection of dealer invoices also occurs separately from revenue recognition.

For the opening tractor price of $145,000:

| Item | USD per tractor |
| --- | ---: |
| Customer list price | 145,000 |
| Manufacturer's dealer invoice | 124,700 |
| Standard materials | 75,000 |
| Normal conversion labor | 13,000 |
| Standard gross margin | 36,700 |

The warranty provision then reduces that gross margin. Overtime premiums, rework, and carrying inventory appear in common monthly expenses, so this teaching contribution should not be described as every marginal cash cost.

The **variable-cost floor** is standard materials plus conversion divided by 86%. For this tractor it is about **$102,326 of list price**. The warranty-adjusted floor divides instead by `86% × (1 − warranty provision rate)`. These floors do not pay for the rest of the company. A price above the floor can still lose money overall, and cutting price can change both demand and dealer ordering.

For a projected product with no shipments, the forecast still knows its underlying modeled quality and warranty provision rate. In a historical report with no shipments, the realized report does not identify that rate. The latter view therefore shows warranty-adjusted per-unit results as unavailable instead of inventing an observation.

## What pays for the company?

All company values below are **USD millions**. The view reconciles exactly, apart from the engine's rounding, to the monthly accounts:

```
wholesale contribution = wholesale revenue − cost of shipped machines − warranty accrual
common costs = operating expense + depreciation + warranty shortfall + credit losses
operating profit = wholesale contribution − common costs + loan interest income
pretax profit = operating profit − borrowing interest expense
```

Operating expense already includes factory and corporate expenses, marketing, quality, maintenance, training, engineering, overtime, rework, and inventory carrying. None of these is subtracted twice. Warranty accrual is deducted in contribution; only an additional unreserved claims shortfall remains in common costs. Normal conversion cost sits in inventory until a machine ships, when it is charged through cost of goods sold.

Contribution margin is wholesale contribution divided by wholesale revenue. Under the current shipment mix:

```
operating break-even wholesale revenue
  = max(0, common costs − loan interest income) / contribution margin

pretax break-even wholesale revenue
  = max(0, common costs + borrowing interest − loan interest income) / contribution margin

break-even shipment units
  = costs to cover / current shipment-weighted contribution per unit

margin of safety
  = current wholesale revenue − pretax break-even wholesale revenue
```

Revenue uses wholesale invoices, not total reported revenue, which also includes loan interest. A negative margin of safety shows the current shortfall. Equivalent shipment units can be fractional because the calculation preserves a multi-product mix; they are not a promise that that exact combination can be sold or built.

These calculations hold the current month's selling prices, shipment mix, standard costs, warranty rates, common spending, loan interest income, and borrowing interest constant. Some common expenses vary with production or conditions; they are fixed only for this sensitivity calculation. Break-even is not a demand forecast. A required shipment volume might exceed demand, supplies, or factory capacity. With no shipments or nonpositive total contribution, no positive break-even threshold can be inferred from this mix, so the thresholds are `null`.

## An indicative full product cost

The view also allocates common costs to products by their current share of wholesale revenue, then divides by units shipped. This is an explicit teaching allocation, not a uniquely correct product cost. It includes the common operating costs above but neither credits loan interest income nor allocates borrowing interest. It should not by itself determine which product to abandon.

```
allocated common cost = company common costs × product wholesale revenue share
indicative full cost per unit = standard cost + warranty provision per unit
                             + allocated common cost per shipped unit
indicative break-even list price = (standard cost + allocated common cost per unit)
                                / [86% × (1 − warranty provision rate)]
```

The price sensitivity freezes the current allocation and warranty rate. Changing price in Decisions recalculates demand, shipments, mix, and allocation in the actual forecast. An unshipped product cannot have an allocated cost per unit. This distinction is why a positive gross margin and an allocated accounting loss can both be true.

## Profit is different from available cash

The view also shows ending cash and cash change, but does not subtract cash flows again from accounting contribution. Capex consumes cash immediately and is depreciated over time. Borrowing or repaying debt principal changes cash and liabilities, not current operating expense. Supplier payments, receivables, customer loan principal, and unsold production also separate cash from profit. A business can meet accounting break-even while running out of cash.

The tests cover dealer receipts, unit conversion, warranty and common-cost bridges, allocation assumptions, mixed positive and negative margins, zero shipments, break-even equations, capex versus principal, report validation, and immutability.
