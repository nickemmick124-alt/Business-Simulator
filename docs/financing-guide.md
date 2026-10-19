# Customer financing, investment timing and monthly accounts

These are explanations of the game's synthetic rules, not lending terms, CNH accounting disclosures or an investment forecast. The views read the simulation and do not change a plan or advance a month.

## What the 7.25% control means

The customer APR applies to **new 24-month equipment loans**. It does not change the rate on existing customer loans, corporate borrowing or the matched funding used by the finance business.

| Rate | Balance to which it applies | Timing |
| --- | --- | --- |
| Customer APR chosen in Decisions | Each new customer-loan cohort keeps the rate at origination | The loan starts earning interest on the following turn |
| Corporate funding: 7.5% | Opening corporate debt | A draw or repayment changes next month's interest |
| Customer-finance funding: 5.5% | Opening finance debt | Matched debt resets to 80% of the closing customer loan book |

At 7.25%, the customer-financing demand multiplier is neutral, at 1.000. In percentage-point APR units:

```
demand multiplier = clamp(1 + (7.25 − APR) × 0.012, 0.9, 1.08)
share of retail sales financed = clamp(0.32 + (7.25 − APR) × 0.014, 0.2, 0.4)
new principal = retail units × retail list price × financed share × 80%
```

For example, a 6.25% APR produces a 1.012 demand multiplier and a 33.4% financed share, before other demand factors, unit rounding and equipment availability. Lower APR can support retail sales while increasing the amount of lending and cash committed. It does not guarantee more manufacturer shipments or better total profit.

An illustrative $100,000 opening customer-loan balance at 7.25% earns $604.17 interest at its first collection. Before credit losses, equal principal over 24 collections is about $4,166.67 per month. This is a declining-balance, equal-principal model, not a fixed-payment annuity. The engine calculates interest on the opening balance, then recognizes a credit loss and divides the surviving balance by remaining months for principal collection. New lending starts that cycle on the following turn.

Customer principal is a loan asset. Collecting principal reduces the loan book and adds cash; it is not revenue. Customer interest is revenue. The finance business borrows 80% of its closing loan book. The other 20% uses company funds. Its **net** monthly funding draw also reflects collections and credit losses on older loans, so it is not simply 80% of new originations. A positive spread between customer APR and the 5.5% matched funding rate is not a complete profit calculation: company funds, corporate interest and credit losses also matter.

## Rate comparison

`getFinancingInsights(state, plan)` compares the working APR with a rate one percentage point lower and one point higher, clamped to the allowed 2%–14% interval. Duplicate boundary options are removed. All other decisions remain the same.

The comparison calls the normal sequential public forecast for up to six months. Recurring budgets, production, prices and APR continue; new corporate borrowing and capital expenditure occur only in the first month. If an option reaches distress early, all alternatives are compared through that same earliest month. It also stops at campaign end.

Next-month customer-loan interest is identical across rate alternatives because the existing cohorts have fixed rates and new loans do not yet earn interest. Later differences come from new cohorts, sales, loans, cash requirements and credit exposure. The guide shows cumulative loan interest, credit losses, ending loan assets and funding, plus whole-company net profit and cash. Whole-company profit includes the manufacturing response and must not be presented as standalone financing profit. These are expected public scenarios; they do not inspect future random events.

## What capacity and engineering buy

Factory investment represents production equipment, tooling and facility capacity. Cash falls and fixed assets rise in the commitment month. The added asset enters the following month's depreciation base. Completed projects add 0.004 to the shared capacity bonus per $1m, or 0.4 percentage points, capped at a 40% total bonus. Plant condition, workforce skill, overtime and rework still affect available slots. Components, targets and customer demand still constrain how many additional units can be built or sold.

Engineering is a recurring operating expense, paid now and reducing current profit before tax effects. Each completed $1m adds 0.007 to each product's technology index before a 0.0025 monthly decay and the 1.25 upper limit. Technology supports expected demand. There is no capitalized R&D asset, explicit engineer headcount or named product-development program in the current model.

Both project types start benefiting operations three months after the spending month: spending in January first benefits April. Previously funded projects retain their scheduled completion across year boundaries. New factory spending defaults back to zero after a commitment; engineering remains a recurring policy unless the player changes it. The explanation shows the committed pipeline and warns if new benefits would occur after the selected campaign ends.

Neither investment automatically lowers standard manufacturing cost, improves factory first-pass quality or guarantees a return. Extra capacity can be idle when production targets, components or demand are the constraint. In a soft market, reliability, maintenance and liquidity may matter more. The investment lab compares those operational and financial effects using the actual model.

## Full monthly balance sheet

`getMonthlyBalanceSheet(state, month)` reads the **selected historical report's** opening and closing balance sheets, not today's balance. The statement includes all five asset categories; corporate and matched finance debt separately; payables; warranty reserve; total liabilities; equity; and the accounting totals. Debt is not counted a second time as an extra liability row.

Reports marked by either forecast flag are rejected by the actual-statement helper. A projected history cannot appear with an Actual label; the view asks for a completed live month instead.

```
assets = cash + receivables + inventory + fixed assets + customer loans
liabilities = corporate debt + finance debt + payables + warranty reserve
assets = liabilities + equity
closing equity = opening equity + net profit
```

Cash and equity increases are highlighted green, and decreases red. Debt movement uses the opposite colors. Asset categories such as inventory and receivables, and contextual liabilities such as payables and warranty reserve, remain neutral: increases can reflect useful investment, growth or a problem. Every movement has an Increased/Decreased/Unchanged label, so color alone does not convey its meaning. Context explains that borrowed cash is not profit, lower reserves do not prove better quality, and more inventory is not automatically bad.

The statement also shows the period income components and a cash bridge. The bridge separately shows operating cash flow, principal collections, new lending, capital expenditure, corporate borrowing and matched finance funding. Net cash movement and closing cash are totals, not extra cash-flow items to add again. Money is displayed in USD millions; underlying balances reconcile before display rounding.

## Implementation and verification

- `src/financial-learning.js`: pure account extraction, APR alternatives and investment timing.
- `src/financial-learning-views.js`: APR guide, investment guide and full monthly statement.
- `test/financial-learning.test.js`: checks engine reconciliation, fixed existing-loan rates, origination interest lag, loan/funding accounting, equal comparison periods, APR bounds, historical statement selection, borrowing/equity separation, project timing/caps, cross-year projection and read-only behavior.

Existing one-year saves and three-year campaigns use the same financial explanations. No save format migration is needed for the learning views.
