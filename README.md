# CNH Executive — Business Simulator

A single-player CEO strategy game for desktop browsers. Set numerical operating plans, compare forecasts, explore a 3D headquarters and factory, and manage the consequences over a twelve-month campaign.

This is an independent, CNH-inspired game, not an official CNH product. Products, facilities, events, and operating and financial parameters are illustrative. The model does not predict CNH performance or reproduce an actual facility.

[Source repository](https://github.com/nickemmick124-alt/Business-Simulator) · [Design brief](docs/design-brief.md) · [Simulation rules and assumptions](docs/simulation-model.md)

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

1. Read **Briefing**, then inspect **Operations** and **Markets**. You begin as CEO of an operating company with inventory, dealer stock, loans, debt, and existing equipment in service.
2. Open **Decisions**. Set product prices and output, marketing, financing APR, quality, maintenance, training, overtime, component buffers, engineering, factory investment, and borrowing or repayment. Save named alternatives and use **Compare plans** before committing.
3. Select **Commit round** or **Advance month**, review the forecast, and confirm. Only commitment advances business time. Most policies carry forward; factory investment and corporate borrowing or repayment reset each month.
4. Review actual results against the forecast, follow operating explanations, and inspect the financial statements. Adjust the next plan to protect cash, delivery, quality, and future capability. Financial distress can end the mandate before December.

Price inputs use **USD thousands**; financial reports use **USD millions**. Forecasts use expected conditions, while committed rounds include seeded variation. The same initial state, model version, seed, and decisions reproduce the same results.

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

Use **Settings → Export save** to download a JSON backup, and **Import save** to restore it in another browser or on another device. Importing a valid save replaces the current campaign. **New campaign** also replaces local progress and lets you choose a scenario seed. Export first to retain the previous campaign. Invalid or unsupported saved data pauses automatic replacement until a valid import or deliberate restart.

## Current scope

The game models three representative product families: row-crop tractors, combine harvesters, and wheel loaders. Agriculture and Construction connect to aggregate dealer demand and simplified customer financing. Markets and competitor pressure are aggregate effects, rather than individual regions or autonomous rival companies.

The headquarters and factory are representative 3D environments. Visible equipment and animations illustrate operating conditions; reports and inspection panels provide numerical counts. This version has twelve monthly rounds, a board scorecard, and single-player local campaigns. It does not include multiplayer, vehicle driving, or detailed replicas of CNH plants. Accounting and economic simplifications are documented in the [simulation model](docs/simulation-model.md).

## Checks

```sh
npm test
npm run check
```

The tests cover simulation invariants, accounting reconciliation, deterministic forecasts and replay, campaign endings, and save validation and round trips. DOM integration tests exercise numerical edits, plan comparisons, monthly commitment, reports, statements, import recovery, and the missing-WebGL fallback. `npm run check` checks JavaScript syntax.

Automated simulation and save-state checks have passed. Browser-render QA remains unverified; these checks do not establish visual correctness or frame rate on a desktop browser.
