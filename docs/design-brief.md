# CNH Executive — Design brief

The game puts the player in the CEO seat immediately. Its purpose is an engaging strategy experience grounded in the relationships between customers, dealers, manufacturing, quality, investment, financing, and cash. The central promise is to run the company and see the consequences throughout the business.

The platform is a desktop web browser. A shareable game link opens the experience without installation. The presentation combines a real-time 3D headquarters and factory with readable numerical planning and reports. The Business Strategy Game provides a reference for entering plans, comparing projections, and resolving rounds; Farming Simulator provides a reference for machinery and physical atmosphere. The operating rules and game content are specific to this independent simulation.

## Player experience

The player starts with an operating equipment manufacturer, including existing inventory, dealer stock, outstanding customer loans, debt, and machines already in service. Agriculture and Construction face different demand patterns. Financing can support purchases while creating funding needs and credit exposure.

Each month follows a complete decision loop:

1. Read the business brief and identify the pressures that need attention.
2. Inspect the market outlook, financial position, and factory conditions.
3. Enter numerical plans with explicit units, limits, and explanations.
4. Save alternatives and compare their forecasts under the same expected conditions.
5. Commit a plan and advance one month.
6. Review actual results, investigate the differences, and revise the next plan.

The player sets enterprise policies and resource allocations. Factory inspections explain consequences; advancing the campaign does not require scheduling individual workers or operating machinery. Walking and camera movement do not advance business time or alter a plan.

Useful decisions create connected tradeoffs. Higher output can consume cash while missing components leave machines unfinished. Lower financing rates can support demand while reducing loan interest income. More overtime can raise capacity while increasing costs and defects. Engineering and factory investment consume resources before their benefits arrive.

## Implemented campaign boundary

The campaign is single-player, with a choice of twelve or thirty-six monthly rounds and an earlier ending for financial distress. New games default to three years; existing one-year saves keep their original duration. A public board mandate supplies monthly targets, quarterly milestones and outcome reviews, while decision coaching separately evaluates the choices available before each round. Its three representative product families are row-crop tractors, combine harvesters, and wheel loaders. Commercial, production, operational, investment, and finance controls connect these products to dealer orders, retail sales, material flow, quality, warranty, customer loans, and financial statements.

Markets and dealers are aggregated. Competition influences demand through published market pressure and seeded variation; independent rival businesses and geographic markets are not simulated. Investment policies are shared across the product families. The accounting uses a simplified consolidated company and a single currency.

The 3D world contains a headquarters and one representative factory, with inspection areas for supply, assembly, quality, and dispatch. Equipment geometry and movement establish the setting. Some visuals respond to operating state, while exact quantities remain in reports and inspection panels. The scenes do not represent the physical layout or capacity of an actual CNH site.

The board evaluates the condition of the company at the campaign ending, including financial value after obligations, delivery, quality, and future capability. Manufacturing additional inventory or borrowing money must not create profit by itself. The scoring and distress rules are defined in the [simulation model](simulation-model.md).

## Interaction requirements

Numerical plans remain the main way to run the business. The interface must make the difference between a draft, a forecast, a committed decision, and an actual result clear. Prices, budgets, quantities, and rates need visible units. Comparing plans must not consume future random events or change company state.

3D inspection should support understanding without obstructing decisions. Orbit and walk modes coexist with direct navigation to locations, reports, and controls. Reduced animation is available. Business controls remain usable when the 3D renderer is unavailable.

Campaigns save locally, including the company state, working plan, named drafts, and settings. JSON export and import support backups and transfers between devices. Sharing the game URL does not share a player's save.

## Model integrity and accuracy

The simulation runs separately from its interface and rendering. Identical starting state, model version, seed, and committed decisions must produce identical outcomes. The system distinguishes production from shipments, wholesale sales from dealer retail sales, and accounting income from cash collections. Components, inventory, loans, and financial balances must reconcile.

All operational parameters and events are synthetic gameplay assumptions. CNH's public business context informs the setting; it does not establish the simulated capacities, costs, demand, facilities, or future results. This is an independent, CNH-inspired game, not an official CNH product, forecast, valuation, or digital twin.

Automated checks cover physical and accounting consistency, forecast independence, reproducible outcomes, campaign boundaries, and save handling. Browser-render QA remains outstanding. Playtesting must assess whether the numerical choices are understandable, the physical setting explains consequences, and another round feels worth playing.

See the [simulation model](simulation-model.md) for the implemented equations, accounting conventions, and limitations, and the [README](../README.md) for running the game and its controls.
