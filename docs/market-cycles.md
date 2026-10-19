# Market cycles and campaign replay

New cyclical campaigns use simulation rules `1.1.0`. Existing `1.0.0` campaigns retain their original demand, supply, finances, and replay results. Starting a new campaign is an explicit choice; loading a save never changes its rules.

These are **synthetic educational scenarios**, not calibrated CNH forecasts or a reconstruction of historical equipment cycles. They demonstrate why an operator should separate an opening forecast, management decisions, and conditions that became known later.

## Public information before a decision

The initial backdrop is **Soft market**, **Flat market**, or **Upswing market**. Random selection resolves a backdrop once when the campaign starts and saves that resolved choice. The player sees it before making a decision.

Each backdrop changes the original seasonal category demand curve. The soft agriculture scenario weakens into midyear and partially recovers; the upswing grows before moderating. Construction shares the direction with a smaller initial response. Before any surprises, annual industry units are approximately 10.7% below or 9.8% above the flat-scenario reference. Those percentages compare alternative game scenarios. They are **not year-over-year growth rates**: the game has no observed prior year.

The public outlook includes:

- The currently projected full-year market classification and percentage difference from the flat-scenario reference.
- Expected next-month industry demand change against the last observed month, when one exists.
- Known seasonality, competitive pressure, and expected controller availability.
- A revised expectation following observed economic changes or supplier disruption.

Forecasts do not read future random draws. A forecast assumes current observed demand conditions gradually return toward the public initial backdrop, with a persistence factor of 0.82 per month. Expected supplier disruption decays by a factor of 0.45 per month. Projections carry these expectations forward; they do not insert unknowable future surprise events.

The full-year market reference combines already observed industry months with the latest public expectations for remaining months. It can change after new evidence. The label can move from flat to soft, for example, even though the initial flat backdrop remains recorded for exact replay.

## What becomes known when a month closes

The seed determines a common demand path that carries across months. Small monthly innovations change the path, and occasional positive or negative turns produce a persistent replacement-demand wave or pullback. Agriculture and construction share the broad direction; construction also has a small independent variation. The common demand deviation is bounded at ±35% of the chosen scenario.

Each month has a 7.5% chance of a negative demand turn and a 7.5% chance of a positive turn. These percentages describe the game's random mechanism, not industry event probabilities. Suppliers independently have a 12% monthly chance of a new controller disruption; availability recovers gradually and cannot fall without bound. Existing product-specific demand, delivery, and quality variation also remains in the simulation.

Actual retail demand and dealer replenishment react to the realized category conditions. A sudden downturn can therefore reduce dealer orders immediately and leave the manufacturer holding inventory. A supplier disruption can constrain completed machines, while parts buffers and supplier development influence how much production is protected. Exogenous context is recorded separately from company results so the monthly review can discuss whether a poor result came from a surprise, a management choice, or both.

The `expectedDemand` product field retains the opening public estimate. Actual `demand` includes the realized category change and ordinary product-level variation. In cyclical campaigns, dealer orders use the revised category demand during the month. This distinction explains why actual wholesale shipments can differ from the opening forecast even without changing the production plan.

## Addressable market and share

Company retail sales are the market-share numerator. Industry demand is calculated from the same synthetic reference shares as before: tractors 20%, harvesters 18%, and loaders 16%, valued at fixed reference retail prices.

For completed cyclical months, the denominator uses the recorded **realized** category factors. Future months use the public outlook without inspecting the seed's future path. Changing company prices, budgets, financing rates, or output never changes industry demand. Later observations do not rewrite already observed industry months.

In original `1.0.0` campaigns, the denominator remains the original fixed public seasonal market, exactly as before.

## Reproducibility and hindsight

The exogenous path depends only on the seed, resolved initial backdrop, and month. It does not depend on management choices or how often the player opens a forecast. Alternate strategies tested from the same opening therefore face the same economic and supplier conditions. This is necessary for a fair retrospective comparison; it is not a claim that an alternate strategy was guaranteed to be best in advance.

`createInitialState(seed)` preserves the original `1.0.0` API. `createInitialState(seed, { marketRegime: 'soft' | 'flat' | 'upswing' | 'random' })` opts into `1.1.0`. The saved `marketCycle` contains the resolved `initialRegime`, `observedMonth`, and latest observed agriculture, construction, and supply indices. It stores no list of future outcomes.

`createReplayInitialState(state)` reconstructs the correct original version and backdrop. Applying the recorded monthly decisions recreates the campaign. For a cyclical campaign, each report adds `marketContext` with opening `expected` factors, closing `realized` factors, demand and supply surprise rates, and any new market events. In a forecast report the factors are equal, surprise rates are zero, and the market-event list is empty.

Save validation checks scenario identity, finite market observations, report context, and reconciliation of the latest observed market to its report. The regression tests also preserve exact hashes of the released legacy initial state, forecast, first committed month, and complete baseline campaign.

## Verification and boundaries

Tests cover hidden-seed independence of public forecasts, persistent conditions across months, occurrence of both demand directions and supplier shocks, identical exogenous events under different plans, exact replay, observed market-share denominators, financial reconciliation, and old-save compatibility. A demand-led policy completes the tested soft, flat, and upswing campaigns; repeating inherited production targets can fail in a downturn.

The current game does not model geography, individual competitors, farmer income accounts, tariffs, commodity prices, currencies, inflation in material costs, or a calibrated credit cycle. Those would need separate causal mechanisms and documentation. All accounting costs remain those of the original standard-cost model.
