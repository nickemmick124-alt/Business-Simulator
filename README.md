# CNH Executive — Business Simulator

A single-player CEO strategy game for desktop browsers. Set numerical operating plans, compare forecasts, explore a 3D headquarters and factory, and manage the consequences over a twelve-month campaign.

This is an independent, CNH-inspired game, not an official CNH product. Products, facilities, events, and operating and financial parameters are illustrative. The model does not predict CNH performance or reproduce an actual facility.

[Source repository](https://github.com/nickemmick124-alt/Business-Simulator) · [Learning guide](docs/learning-guide.md) · [Design brief](docs/design-brief.md) · [Simulation rules](docs/simulation-model.md) · [Market and financial planning model](docs/market-finance-model.md) · [Development roadmap](docs/roadmap.md)

[Hosted preview](https://cnh-executive-world.nickem.chatgpt.site) — owner-private access through ChatGPT. Running the static build yourself does not require an account.

## Run locally

Use Node.js 22 or newer and a current desktop browser. The 3D world requires WebGL 2; hardware acceleration should be enabled.

```sh
npm ci
npm run build
npm run dev
```

Open **http://localhost:4173**. The development server serves `dist/`; run `npm run build` again after changing source files. Set `PORT` to use a different port. The build is a static site with Three.js bundled locally and needs no application server, API key, or account to play.

## Play

1. Read **Briefing**, then inspect **Markets**, **Finance**, and **Operations**. You begin as CEO of an operating company with inventory, dealer stock, loans, debt, and existing equipment in service. The opening balance sheet is available before the first round.
2. Open **Decisions**. Set product prices and output, marketing, financing APR, quality, maintenance, training, overtime, component buffers, engineering, factory investment, and borrowing or repayment. Use **Unit economics & break-even** to check what each shipment earns. Inspect **Factory diagnostics** before adding output, and use the **Investment lab** to compare targeted spending with the working plan. Save named alternatives and use **Compare plans**. Check **Finance → Balance sheet & projections** to see how a policy affects future cash before committing.
3. Select **Commit round** or **Advance month**, review the forecast, and confirm. Only commitment advances business time. Most policies carry forward; factory investment and corporate borrowing or repayment reset each month.
4. Review actual results against the forecast, the **Decision quality** grade, and **What worked, what to change**. Inspect the financial statements and test the coach's explanation against your intent. Adjust the next plan to protect cash, delivery, quality, and future capability. Financial distress can end the mandate before December.

Price inputs use **USD thousands**; financial reports use **USD millions**. Forecasts use expected conditions, while committed rounds include seeded variation. The same initial state, model version, seed, and decisions reproduce the same results.

## Understand the market and the financial plan

**Markets → Explore market & share** shows the annual addressable market in units and reference retail value, a twelve-month market outlook, the latest estimated company unit share, and the next month's expected position. Changes distinguish the market's growth from the company's customer-demand and retail-sales growth. Share movement is shown in percentage points. Before the first completed month, actual share and month-over-month comparisons are unavailable.

Market size is a synthetic scenario assumption for the three modeled product families, not the global equipment market. Estimated company share uses customer retail sales divided by modeled market units. Dealer shipments, customer demand, and retail sales are separate measures; reference retail market value is not company wholesale revenue. The [market model](docs/market-finance-model.md) documents the assumptions and formulas.

**Finance → Balance sheet & projections** compares the current balance sheet with the next month's forecast, including the change in each balance. Select **Next 3 months** or **To year-end** to inspect the projected cash path, minimum cash within the view, period profit, corporate borrowing headroom, and monthly income and cash-flow statements. The latest actual month appears beside forecast months when available. Working-capital and cash-movement explanations connect the financial position to operating choices.

Projections carry expected inventory, loans, receivables, payables, and investment progress from one month to the next. Prices, production targets, and recurring budgets repeat; new capital spending and corporate borrowing or repayment apply once, then reset to zero. Projections stop at the chosen horizon, year-end, or financial distress. They are expected scenarios, not guaranteed outcomes, and do not advance the campaign or replace actual results.

## Learn from economics and monthly coaching

**Decisions → Unit economics & break-even** and **Finance → Unit economics & break-even** show list price, manufacturer revenue, standard costs, warranty provision, unit contribution, and company break-even. Dealers pay the manufacturer 86% of the customer list price. A product's variable-cost floor does not cover the whole company's bills. The company break-even calculation holds the displayed prices, shipment mix, and costs constant; it does not promise sufficient demand or capacity. Allocated product full cost is an explicit teaching allocation. See the [unit-economics definitions](docs/unit-economics.md) for formulas and limitations.

Every completed month displays a **Decision quality** score out of 100 and an A–F letter. Select **What worked, what to change** for the coaching detail. **Results** lets you reopen an earlier month's review or select its **Coach** link. Coaching separates the decision under the expected conditions available then from the realized outcome. It compares tested alternatives, shows what changed in their plans, and distinguishes the strongest expected plan from the strongest realized plan. **Best tested** is a bounded comparison, not a claim of a global optimum or the best possible campaign strategy. Reviews that cannot reproduce an imported history show that limitation instead of inventing a comparison.

New cyclical campaigns start with a **Soft market**, **Flat market**, or **Upswing market** outlook. Public forecasts adapt to observed conditions; actual demand turns can persist, and suppliers can suffer disruptions. Completed months use observed market conditions while future months use the latest public outlook, so the estimated full-year market can change as the year unfolds. The [cycle model](docs/market-cycles.md) describes these synthetic scenarios. They are not calibrated forecasts of CNH or the equipment industry.

The [learning guide](docs/learning-guide.md) connects these screens into a monthly planning routine and includes dated, sourced examples of equipment-industry cyclicality.

## Diagnose the business and choose investments

**Factory diagnostics** connects the production target to available assembly slots, component receipts, first-pass defects, recovered rework, and finished inventory for each product. It shows current and projected plant condition, workforce capability, quality, reputation, and technology. A controller shortage, a capacity limit, and insufficient dealer orders require different responses; extra capacity alone cannot resolve all three. Workforce capability is an aggregate skill index, not measured cross-training coverage or an employee skills matrix. See the [factory and cost definitions](docs/factory-diagnostics.md).

**Cost & quality ledger** breaks standard machine cost into component kits, controllers, and normal conversion. Inventory values reconcile to the balance sheet by stage: unused materials, incomplete machines, machines awaiting quality release, and finished equipment. Dealer-owned stock is shown separately. The quality ledger distinguishes current-period prevention and rework expense, warranty provisions, claims paid, and the warranty reserve. Inventory is an asset until released into cost of goods sold; paying a previously reserved warranty claim does not create the same expense a second time. These are illustrative game costs, not CNH bills of material or a detailed wage-and-energy cost model.

**Market position** separates actual retail unit share and its history from the working plan's next-month projection. It compares company sales growth with market growth and explains the modeled price, reputation, technology, financing, marketing, and availability factors. Field reliability is a smoothed installed-fleet index, distinct from the first-pass quality of this month's factory output. Indices describe the simulation, not customer surveys or measured competitor product ratings. See the [market-position definitions](docs/market-position.md).

**Investment lab** compares the working plan with additional workforce training, quality and supplier development, maintenance, factory capacity, or product engineering. Choose a projection horizon and inspect the incremental spending, expected financial effects, and capability timing. Every comparison holds other controls constant and uses the same elapsed months. If an option reaches distress early, the common comparison shortens. Recurring budgets repeat; new capex and borrowing apply once. A month 1 capacity or engineering commitment first affects operating capability in month 4. **Use in working plan** changes the editable plan; only a confirmed monthly commitment advances the campaign.

Higher capability can improve output or quality without increasing sales. Existing production targets, component supply, dealer demand, or capability limits may absorb the benefit. Standard material and normal conversion costs remain fixed in this version. The lab shows expected scenarios, not guaranteed returns or proven payback periods; its [investment definitions](docs/investments.md) document those limits.

## Controls

| Action | Control |
|---|---|
| Explore the scene | Drag in **Orbit** mode; scroll to zoom |
| Inspect a work area | Select its scene marker or an operations shortcut |
| Walk through a location | Choose **Walk**, use **W A S D**, and drag to look; **Shift** moves faster |
| Return to Orbit | **Escape** when no dialog is open |
| Change location | **Headquarters** or **Factory floor** buttons |
| Restore the camera | Reset camera button |
| Reduce animation | **Settings → Reduce animation** |

Direct section and location buttons provide access without walking. Planning and reports remain available if the 3D renderer cannot initialize.

## Saves

Valid changes autosave in this browser's local storage. A game link does not share your campaign, and there is no cloud synchronization.

Existing valid campaigns retain their original market mechanics and can use unit economics, monthly coaching, factory and cost diagnostics, market-position history, and investment comparisons without a restart. Cyclical market mechanics apply to new campaigns; an older campaign is not silently converted.

Use **Settings → Export save** to download a JSON backup, and **Import save** to restore it in another browser or on another device. Importing a valid save replaces the current campaign. **Settings → New campaign** also replaces local progress: choose **Random**, **Soft**, **Flat**, **Upswing**, or **Classic legacy** and a scenario seed. New campaigns default to a fresh random seed; **Repeat current scenario** copies the current seed and initial market outlook. Export first to retain the previous campaign. Invalid or unsupported saved data pauses automatic replacement until a valid import or deliberate restart.

## Current scope

The game models three representative product families: row-crop tractors, combine harvesters, and wheel loaders. Agriculture and Construction connect to aggregate dealer demand and simplified customer financing. Markets and competitor pressure are aggregate effects, rather than individual regions or autonomous rival companies. Training, maintenance, quality, capacity, and engineering budgets affect shared operating capabilities across product families; there is no separate facility-project selection, employee staffing roster, or rival product catalogue.

The headquarters and factory are representative 3D environments. Visible equipment and animations illustrate operating conditions; reports and inspection panels provide numerical counts. This version has twelve monthly rounds, a board scorecard, and single-player local campaigns. It does not include multiplayer, vehicle driving, or detailed replicas of CNH plants. Accounting and economic simplifications are documented in the [simulation model](docs/simulation-model.md).

## Checks

```sh
npm test
npm run check
```

The tests cover simulation invariants, accounting reconciliation, deterministic forecasts and replay, campaign endings, and save validation and round trips. Analytics checks cover market sizing and share denominators, sequential financial projections, one-time commitments, and preservation of live campaign state. Unit-economics checks cover contribution and break-even reconciliation, allocation assumptions, zero shipments, and cash-versus-profit distinctions. Coaching and cycle checks cover fair comparisons, forecast independence from future shocks, historical replay, and legacy compatibility. Operator-tool checks cover inventory and warranty reconciliation, factory-flow constraints, actual and forecast share, field-reliability distinctions, delayed investment effects, recurring versus one-time spending, and comparisons over common elapsed months. DOM integration tests exercise numerical edits, plan comparisons, market and financial planning views, the operator tools, monthly commitment, coaching, reports, statements, import recovery, and the missing-WebGL fallback. `npm run check` checks JavaScript syntax.

Automated simulation and save-state checks have passed. Browser-render QA remains unverified; these checks do not establish visual correctness or frame rate on a desktop browser.
