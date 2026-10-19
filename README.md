# CNH Executive — Business Simulator

A single-player CEO strategy game for desktop browsers. Set numerical operating plans, compare forecasts, explore a 3D headquarters and factory, and manage the consequences over a one-year or three-year campaign. New campaigns default to 36 monthly rounds; existing saves retain their original length.

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

1. Read **Briefing** and the **Board review** to understand your mandate, monthly targets, and quarterly milestones. Then inspect **Markets**, **Finance**, and **Operations**. You begin as CEO of an operating company with inventory, dealer stock, loans, debt, and existing equipment in service. The opening balance sheet is available before the first round.
2. Open **Decisions**. Set product prices and output, marketing, financing APR, quality, maintenance, training, overtime, component buffers, engineering, factory investment, and borrowing or repayment. Use **Unit economics & break-even** to check what each shipment earns. Inspect **Factory diagnostics** before adding output, and use the **Investment lab** to compare targeted spending with the working plan. Save named alternatives and use **Compare plans**. Check **Finance → Balance sheet & projections** to see how a policy affects future cash before committing.
3. Select **Commit round** or **Advance month**, review the forecast, and confirm. Only commitment advances business time. Most policies carry forward; factory investment and corporate borrowing or repayment reset each month.
4. Review actual results against the forecast and the board's published goals. Use the separate **Decision quality** grade and **What worked, what to change** to examine the decision you made with the information available then. The monthly report includes the full balance sheet, income statement, and cash bridge. Adjust the next plan to protect cash, delivery, quality, and future capability. Financial distress can end the mandate before its scheduled final month.

Price inputs use **USD thousands**; financial reports use **USD millions**. Forecasts use expected conditions, while committed rounds include seeded variation. The same initial state, model version, seed, and decisions reproduce the same results.

## Understand the market and the financial plan

**Markets → Explore market & share** shows the annual addressable market in units and reference retail value, a campaign market outlook, the latest estimated company unit share, and the next month's expected position. Changes distinguish the market's growth from the company's customer-demand and retail-sales growth. Share movement is shown in percentage points. Before the first completed month, actual share and month-over-month comparisons are unavailable. Annual market totals cover the calendar year containing the next decision, while a three-year campaign also provides the longer monthly timeline.

Market size is a synthetic scenario assumption for the three modeled product families, not the global equipment market. Estimated company share uses customer retail sales divided by modeled market units. Dealer shipments, customer demand, and retail sales are separate measures; reference retail market value is not company wholesale revenue. The [market model](docs/market-finance-model.md) documents the assumptions and formulas.

**Finance → Balance sheet & projections** compares the current balance sheet with the next month's forecast, including the change in each balance. Select **Next 3 months**, **To year-end**, or, in a three-year campaign, **To campaign end** to inspect the projected cash path, minimum cash within the view, period profit, corporate borrowing headroom, and monthly income and cash-flow statements. The latest actual month appears beside forecast months when available. Working-capital and cash-movement explanations connect the financial position to operating choices.

Projections carry expected inventory, loans, receivables, payables, and investment progress from one month to the next. Prices, production targets, and recurring budgets repeat; new capital spending and corporate borrowing or repayment apply once, then reset to zero. Projections stop at the chosen horizon, campaign end, or financial distress. **To year-end** stops at the next calendar year-end; **To campaign end** can carry the policy through the remaining years. They are expected scenarios, not guaranteed outcomes, and do not advance the campaign or replace actual results.

Every completed month's report contains the **Full balance sheet**, with opening balance, closing balance, and movement for each asset, liability, and equity account. Green and red highlight cash/equity direction and the opposite debt direction; other movements stay neutral because an increase in inventory, receivables, or a warranty reserve is not automatically good or bad. The accompanying income statement and cash bridge explain the change. Borrowing can raise cash without earning profit.

**Customer financing** explains what the starting 7.25% APR does. It is the rate offered on new equipment-buyer loans, separate from the manufacturer's fixed 7.50% corporate borrowing rate and 5.50% matched finance funding rate. Existing loans keep their original APR. A rate change affects demand and new lending now; interest on those new loans begins the following month. The guide compares lower, current, and higher rates over the same projected period and shows lending, interest, cash, and credit-loss effects. See the [financing guide](docs/financing-guide.md).

## Work toward the board mandate

The opening Soft, Flat, or Upswing scenario selects a different mandate: protect the franchise, build profitable share, or capture growth without overextending. New campaigns disclose the full schedule of monthly targets, quarterly milestones, and annual commitments before the first decision. Targets stay fixed as plans and markets change; board commentary responds to the latest outlook. An older campaign that did not previously display these goals uses an explicitly labeled retrospective learning benchmark reconstructed from its opening scenario. It is not presented as a commitment the player had already agreed to meet, and saved results remain unchanged.

The **Board review** measures realized earned company value, cash plus available credit, inventory cover, dealer delivery, first-pass quality, and retail unit share. Meeting each exact target earns 75 of its 100 possible attainment points; stretch performance earns 100. The weighted total is **Meeting** at 70–84, **Beating** at 85 or above, and **Behind** below 70, with disclosed guardrails for distress and inadequate customer service. It is an absolute assessment against announced goals, not a ranking against weak alternatives. The [board mandate](docs/board-mandate.md) defines targets, weights, thresholds, and quarterly periods.

Earned company value uses risk-adjusted book equity after recorded obligations. It is not a sale price or discounted-cash-flow valuation. Capacity, technology, and funded projects indicate future capability; spending money is not itself a return and does not earn automatic board points.

## Learn from economics and monthly coaching

**Decisions → Unit economics & break-even** and **Finance → Unit economics & break-even** show list price, manufacturer revenue, standard costs, warranty provision, unit contribution, and company break-even. Dealers pay the manufacturer 86% of the customer list price. A product's variable-cost floor does not cover the whole company's bills. The company break-even calculation holds the displayed prices, shipment mix, and costs constant; it does not promise sufficient demand or capacity. Allocated product full cost is an explicit teaching allocation. See the [unit-economics definitions](docs/unit-economics.md) for formulas and limitations.

Every completed month also displays a separate **Decision quality** score out of 100 and an A–F letter. Select **What worked, what to change** for the coaching detail. **Results** lets you reopen an earlier month's review or select its **Coach** link. Coaching separates the decision under the expected conditions available then from the realized outcome and the board's actual target assessment. Rubric 2.0 starts from operating standards; comparison with better tested plans can only reduce points, so equally weak alternatives cannot create a high grade. It shows what changed in alternative plans and distinguishes the strongest expected plan from the strongest realized plan. Historical coaching grades are recalculated with this rubric; recorded business outcomes remain unchanged. **Best tested** is a bounded comparison, not a claim of a global optimum or the best possible campaign strategy. Reviews that cannot reproduce an imported history show that limitation instead of inventing a comparison.

New cyclical campaigns start with a **Soft market**, **Flat market**, or **Upswing market** outlook. Public forecasts adapt to observed conditions; actual demand turns can persist, and suppliers can suffer disruptions. Completed months use observed market conditions while future months use the latest public outlook, so the estimated full-year market can change as the year unfolds. The [cycle model](docs/market-cycles.md) describes these synthetic scenarios. They are not calibrated forecasts of CNH or the equipment industry.

The [learning guide](docs/learning-guide.md) connects these screens into a monthly planning routine and includes dated, sourced examples of equipment-industry cyclicality.

## Diagnose the business and choose investments

**Factory diagnostics** connects the production target to available assembly slots, component receipts, first-pass defects, recovered rework, and finished inventory for each product. It shows current and projected plant condition, workforce capability, quality, reputation, and technology. A controller shortage, a capacity limit, and insufficient dealer orders require different responses; extra capacity alone cannot resolve all three. Workforce capability is an aggregate skill index, not measured cross-training coverage or an employee skills matrix. See the [factory and cost definitions](docs/factory-diagnostics.md).

**Cost & quality ledger** breaks standard machine cost into component kits, controllers, and normal conversion. Inventory values reconcile to the balance sheet by stage: unused materials, incomplete machines, machines awaiting quality release, and finished equipment. Dealer-owned stock is shown separately. The quality ledger distinguishes current-period prevention and rework expense, warranty provisions, claims paid, and the warranty reserve. Inventory is an asset until released into cost of goods sold; paying a previously reserved warranty claim does not create the same expense a second time. These are illustrative game costs, not CNH bills of material or a detailed wage-and-energy cost model.

**Market position** separates actual retail unit share and its history from the working plan's next-month projection. It compares company sales growth with market growth and explains the modeled price, reputation, technology, financing, marketing, and availability factors. Field reliability is a smoothed installed-fleet index, distinct from the first-pass quality of this month's factory output. Indices describe the simulation, not customer surveys or measured competitor product ratings. See the [market-position definitions](docs/market-position.md).

**Investment lab** compares the working plan with additional workforce training, quality and supplier development, maintenance, factory capacity, or product engineering. Choose a projection horizon and inspect the incremental spending, expected financial effects, and capability timing. Every comparison holds other controls constant and uses the same elapsed months. If an option reaches distress early, the common comparison shortens. Recurring budgets repeat; new capex and borrowing apply once. A month 1 capacity or engineering commitment first affects operating capability in month 4. **Use in working plan** changes the editable plan; only a confirmed monthly commitment advances the campaign.

**Capacity & engineering explained** connects each budget to its operating effect, accounting, and completion date. Capacity adds usable slots after its delay; engineering improves the technology demand multiplier after its delay. Both need productive use to justify their cost.

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

Existing valid campaigns retain their original market mechanics and can use unit economics, monthly coaching, factory and cost diagnostics, market-position history, and investment comparisons without a restart. Version 1.0.0 and 1.1.0 saves remain twelve-month campaigns with their original deterministic operating rules. New three-year campaigns use version 1.2.0; an older campaign is not silently converted or extended. New board and financing views are read-only, and coaching rubric changes do not alter the recorded accounts.

Use **Settings → Export save** to download a JSON backup, and **Import save** to restore it in another browser or on another device. Importing a valid save replaces the current campaign. **Settings → New campaign** also replaces local progress: choose one or three years, **Random**, **Soft**, **Flat**, **Upswing**, or **Classic legacy**, and a scenario seed. New campaigns default to three years; Classic legacy remains one year. New campaigns default to a fresh random seed; **Repeat current scenario** copies the current seed, initial market outlook, and campaign length. Export first to retain the previous campaign. Invalid or unsupported saved data pauses automatic replacement until a valid import or deliberate restart.

## Carry the business into the next year

Three-year campaigns run continuously through month 36. Cash, loans, debt, stock, equipment, workforce capability, quality, technology, and projects carry across December with no reset or fresh funding. A factory investment committed in November first contributes capacity the following February. Market seasons repeat, while shocks use new absolute campaign months and can persist across year boundaries. The initial market scenario gradually moves toward its flat reference after the first year. These are explicit synthetic rules, documented in the [three-year campaign model](docs/multi-year.md).

## Current scope

The game models three representative product families: row-crop tractors, combine harvesters, and wheel loaders. Agriculture and Construction connect to aggregate dealer demand and simplified customer financing. Markets and competitor pressure are aggregate effects, rather than individual regions or autonomous rival companies. Training, maintenance, quality, capacity, and engineering budgets affect shared operating capabilities across product families; there is no separate facility-project selection, employee staffing roster, or rival product catalogue.

The headquarters and factory are representative 3D environments. Visible equipment and animations illustrate operating conditions; reports and inspection panels provide numerical counts. Current campaigns offer twelve or thirty-six monthly rounds, monthly board reviews, quarterly milestones, and single-player local saves. It does not include multiplayer, vehicle driving, or detailed replicas of CNH plants. Accounting and economic simplifications are documented in the [simulation model](docs/simulation-model.md).

## Checks

```sh
npm test
npm run check
```

The tests cover simulation invariants, accounting reconciliation, deterministic forecasts and replay, campaign endings, and save validation and round trips. Analytics checks cover market sizing and share denominators, sequential financial projections, one-time commitments, and preservation of live campaign state. Unit-economics checks cover contribution and break-even reconciliation, allocation assumptions, zero shipments, and cash-versus-profit distinctions. Coaching and cycle checks cover fair comparisons, forecast independence from future shocks, historical replay, and legacy compatibility. Multi-year checks cover continuous accounts and investment timing across year boundaries; board checks cover fixed targets, absolute attainment, and guardrails. Financing checks cover existing versus new loan cohorts, funding, and full monthly account movements. Operator-tool checks cover inventory and warranty reconciliation, factory-flow constraints, actual and forecast share, field-reliability distinctions, delayed investment effects, recurring versus one-time spending, and comparisons over common elapsed months. DOM integration tests exercise numerical edits, plan comparisons, market and financial planning views, the operator tools, monthly commitment, coaching, reports, statements, import recovery, and the missing-WebGL fallback. `npm run check` checks JavaScript syntax.

Automated simulation and save-state checks have passed. Browser-render QA remains unverified; these checks do not establish visual correctness or frame rate on a desktop browser.
