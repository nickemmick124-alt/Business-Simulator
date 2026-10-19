# Three-year campaigns

New three-year campaigns use simulation rules version `1.2.0` and store `campaignMonths: 36`. The engine API is `createInitialState(seed, { campaignMonths: 36, marketRegime: 'soft' | 'flat' | 'upswing' | 'random' })`. Omitting the regime for a three-year campaign selects `random`, resolved once from the seed. Lengths other than 12 and 36 are rejected.

Existing version `1.0.0` and `1.1.0` campaigns retain their original twelve months and exact deterministic results. A completed campaign does not become a new year automatically. Export/import keeps the selected duration and all history; replay recreates the original version, initial public regime, and length.

## What carries into the next year

The calendar advances continuously from month 1 to 36. Cash, debt, receivables, payables, inventory, assets, retained earnings, dealer stocks, customer loans, workforce capability, reliability, technology and investment pipelines all carry forward. There is no annual cash injection, debt forgiveness, factory reset or inventory liquidation. Ordinary depreciation, loan collections, quality effects and operating expenses continue each month.

Factory investment committed in month 11 begins contributing capacity in month 14, the following February. Product engineering follows the same three-month maturation delay. A project committed in December matures in March. Investment cash is paid on commitment; availability of additional operating capacity does not guarantee enough demand, components, or production targets to use it.

The campaign completes after month 36 or ends earlier under the existing distress rule: nonpositive equity or two consecutive negative-cash closes. Annual boundaries do not end an otherwise active mandate. The original accounting-based campaign outcome scales its financial contribution by campaign length; the separate board mandate provides the primary goal-based assessment.

## Public outlook and surprises

Seasonal agricultural and construction demand repeat each calendar year. First-year supplier startup restrictions occur only at the opening of the campaign, and competitor pressure established during the first year remains in force. The declared first-year scenario gradually returns toward the flat reference after month 12, with its remaining deviation multiplied by `0.94` each month. This is a synthetic planning assumption, not a forecast of CNH or the equipment industry.

Observed demand and supplier shocks retain their existing momentum rules across year boundaries. Random draws use absolute campaign months: January of year two does not replay January of year one. Alternate decisions face the same exogenous path, while forecasts use only the public scenario and observations already available. Changing an unseen future seed cannot change the displayed forecast.

Annual outlook figures cover the calendar year containing the next decision. After December of year one, they describe January–December of year two. Completed monthly industry denominators use their stored actual factors and are never rewritten by later observations. Annual change remains relative to the flat-scenario reference, not prior-year actual growth.

## Shared calendar

`src/campaign-calendar.js` has no simulation import. It exports `campaignLength(state)`, `calendarMonth(month)`, `campaignYear(month)`, `monthLabel(month, { short, includeYear })`, `campaignYearEnd(state)`, and `isCyclicalState(state)`. Month zero labels the opening position. An active state at month 12 has an upcoming year-end of month 24; an ended state is still bounded by its campaign length.
