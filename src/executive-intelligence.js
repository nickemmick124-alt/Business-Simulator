/** Monthly CEO conversations. Visits reveal decision support, never future draws. */
import { PRODUCTS, balanceSheet, forecast, getMarketOutlook, validatePlan, validateState } from './simulation.js';
import { campaignLength } from './campaign-calendar.js';
import { getMarketIntelligence } from './business-intelligence.js';
import { getReportEconomics } from './unit-economics.js';
import { getCompetitiveIntelligence } from './competitive-intelligence.js';

export const ADVISORS = Object.freeze([
  { id: 'cfo', name: 'Morgan Reed', role: 'Chief financial officer', location: 'headquarters', topic: 'Cash, funding and break-even', focus: 'cfo', teaser: 'What can we afford, and how much must we sell to cover our costs?' },
  { id: 'sales', name: 'Alex Rivera', role: 'Sales and dealer director', location: 'headquarters', topic: 'Demand, pricing and dealer stock', focus: 'sales', teaser: 'What are dealers seeing, and will more production actually sell?' },
  { id: 'strategy', name: 'Sam Patel', role: 'Strategy and engineering director', location: 'headquarters', topic: 'Competitors and technology', focus: 'strategy', teaser: 'Where are competitors ahead, and which investments can close the gap?' },
  { id: 'operations', name: 'Jordan Chen', role: 'Factory operations director', location: 'factory', topic: 'Capacity, skills and maintenance', focus: 'operations', teaser: 'Are we short of capacity, or failing to use the capacity we already own?' },
  { id: 'quality', name: 'Casey Brooks', role: 'Quality and customer reliability lead', location: 'factory', topic: 'Defects, rework and warranty', focus: 'quality', teaser: 'How do this month’s defects become tomorrow’s cost and reputation problem?' },
  { id: 'supply', name: 'Taylor Diaz', role: 'Supply and material flow lead', location: 'factory', topic: 'Components and working capital', focus: 'supply', teaser: 'Which missing parts could stop the line, and what would protection cost?' },
].map(Object.freeze));
const IDS = new Set(ADVISORS.map(advisor => advisor.id));
const sum = values => values.reduce((total, value) => total + value, 0);
const number = value => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'Unavailable';
const money = value => Number.isFinite(value) ? `$${value.toFixed(1)}m` : 'Unavailable';
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'Unavailable';
const index = value => Number.isFinite(value) ? value.toFixed(3) : 'Unavailable';
const mean = (state, key) => sum(PRODUCTS.map(product => state.products[product.id][key])) / PRODUCTS.length;
const finding = (label, value, detail, basis = 'Public plan forecast') => ({ label, value, detail, basis });
const lever = (key, label, cost, timing, detail) => ({ key, label, cost, timing, detail });

/** Journal rows are planning months. Completed months remain available for review. */
export function getConsultedAdvisorIds(state, month = state?.month + 1) {
  if (!Number.isInteger(month) || month < 1 || month > Math.min(campaignLength(state), state.month + 1)) return [];
  const found = new Set();
  for (const entry of Array.isArray(state?.ceoJournal) ? state.ceoJournal : []) {
    if (entry?.month !== month || !Array.isArray(entry.visited)) continue;
    for (const id of entry.visited) if (IDS.has(id)) found.add(id);
  }
  return ADVISORS.filter(advisor => found.has(advisor.id)).map(advisor => advisor.id);
}

/** The accessible visit button and world interaction call this same operation. */
export function visitAdvisor(state, id) {
  if (!IDS.has(id)) throw new Error('Choose a member of your executive team.');
  const checked = validateState(state);
  if (!checked.valid) throw new Error(`Invalid simulation state: ${checked.errors.join(' ')}`);
  if (state.status !== 'active' || state.month >= campaignLength(state)) throw new Error('This campaign has ended. Start a new campaign to meet the team.');
  const month = state.month + 1;
  if (state.ceoJournal !== undefined && (!Array.isArray(state.ceoJournal) || state.ceoJournal.some(entry => !entry || !Number.isInteger(entry.month) || entry.month < 1 || entry.month > month || !Array.isArray(entry.visited) || entry.visited.some(role => !IDS.has(role))))) throw new Error('Invalid monthly CEO journal.');
  const visited = new Set([...getConsultedAdvisorIds(state, month), id]);
  const journal = (state.ceoJournal ?? []).filter(entry => entry.month !== month).map(entry => ({ month: entry.month, visited: [...entry.visited] }));
  journal.push({ month, visited: ADVISORS.filter(advisor => visited.has(advisor.id)).map(advisor => advisor.id) });
  journal.sort((a, b) => a.month - b.month);
  return { ...structuredClone(state), ceoJournal: journal };
}

function conversations(state, plan, projected, market, competition, outlook) {
  const report = projected?.report ?? null;
  const flows = report?.products ?? [];
  const latest = state.history.filter(item => !item.isForecast && !item.forecast).at(-1) ?? null;
  const bs = balanceSheet(state);
  const economics = report ? getReportEconomics(report) : null;
  const horizon = campaignLength(state);
  const maturity = state.month + 4;
  const timing = maturity <= horizon ? `Available in month ${maturity}; three further rounds after commitment` : `Month ${maturity}, after this campaign ends`;
  const annualChange = outlook?.expectedAnnualChange;
  const totalCapacity = sum(flows.map(row => row.assemblyCapacity));
  const totalAssembled = sum(flows.map(row => row.assembled));
  const totalDefects = sum(flows.map(row => row.defects));
  const totalOrders = sum(flows.map(row => row.dealerOrders));
  const dealers = sum(PRODUCTS.map(product => state.products[product.id].dealerStock));
  const currentWip = sum(PRODUCTS.map(product => state.products[product.id].incomplete));
  const currentRework = sum(PRODUCTS.map(product => state.products[product.id].rework));
  const productionSpend = report ? report.cashFlow.supplierPayments + report.cashFlow.conversion : null;
  const commonUnknowns = ['Future demand and supplier shocks remain unknown. A forecast is a planning estimate, not a promise.'];
  const noForecast = 'Complete a valid operating plan to discuss its projected costs and consequences.';
  const base = { findings: [], levers: [], unknowns: commonUnknowns };
  return {
    cfo: {
      ...base, summary: report ? `The plan ends with ${money(report.balanceSheet.cash)} cash and ${money(report.metrics.profit)} profit. Cash and profit answer different questions.` : 'We can review the books now; plan-dependent guidance needs a valid active plan.',
      findings: [
        finding('Cash and undrawn corporate credit', `${money(bs.cash)} + ${money(Math.max(0, 160 - state.corporateDebt))}`, 'Borrowing adds cash and debt equally. It is not profit or created equity.', 'Observed balance sheet'),
        ...(report ? [
          finding('Expected closing cash', money(report.balanceSheet.cash), `The current plan changes cash by ${money(report.cashFlow.cashChange)}; supplier and assembly cash payments are ${money(productionSpend)}.`),
          finding('Pretax break-even dealer revenue', money(economics.company.pretaxBreakEvenRevenueM), economics.company.pretaxBreakEvenRevenueM === null ? 'No positive shipment contribution is available to calculate this threshold.' : `Planned dealer revenue is ${money(report.income.wholesaleRevenue)}. The threshold holds mix, pricing and this month’s common costs constant; demand may not support the required units.`),
          finding('Interest on new customer loans', `${plan.financingApr.toFixed(2)}% APR`, 'This is the customer rate, not our borrowing rate. Existing loans keep their contracted rate. Corporate debt costs 7.5%; financing debt costs 5.5% annually.'),
        ] : [finding('Plan review', 'Awaiting valid plan', noForecast, 'Planning requirement')]),
      ],
      levers: [
        lever('debtChange', 'Corporate borrowing or repayment', `${money(plan?.debtChange ?? 0)} proposed principal movement`, 'Cash now; interest on the opening balance in later rounds', 'Borrow for a credible return or a temporary cash gap; an unused credit line is also a liquidity buffer.'),
        lever('capex', 'Preserve cash versus invest', `${money(plan?.capex ?? 0)} capex paid now`, timing, 'Compare the whole cash runway with the arrival date of productive capacity. Book assets are not spare cash.'),
      ],
    },
    sales: {
      ...base, summary: outlook ? `${outlook.regimeLabel ?? 'Seasonal market'}: compare retail pull with dealer replenishment before choosing output.` : 'Compare completed retail sales with the market and dealer channel.',
      findings: [
        finding('Current year modeled TAM', `${number(market.annual.units)} units · ${money(market.annual.value)}`, 'Three campaign equipment families only; fixed reference retail prices value the market. This is not total global CNH TAM.', 'Public market outlook'),
        finding('Observed retail market share', market.current ? percent(market.current.unitShare) : 'No completed month yet', market.current ? `Your last completed month sold ${number(market.current.retailSales)} retail units out of ${number(market.current.marketUnits)} industry units.` : 'Opening dealer stock is known, but no current-campaign sales share has been earned.', 'Observed completed month'),
        ...(report ? [
          finding('Expected market direction', annualChange === undefined ? 'Seasonal outlook' : `${annualChange < 0 ? '' : '+'}${(annualChange * 100).toFixed(1)}% versus flat year`, `Next month’s public market estimate is ${number(market.next?.marketUnits)} units; the industry does not expand just because we lower our prices.`, 'Public market outlook'),
          finding('Dealer demand and stock', `${number(totalOrders)} orders · ${number(dealers)} opening dealer units`, `Expected customer retail sales are ${number(report.metrics.retailSales)} units. Dealer orders replenish channel stock; dealer shipments and retail sales are different transactions.`),
        ] : []),
      ],
      levers: [
        ...(state.version === '1.3.0' ? [lever('dealerSupport', 'Dealer service network', `${money(plan?.dealerSupport ?? 0)} monthly cash and expense`, 'Demand support now; reputation improves gradually', 'Each $1m adds 0.0015 to reputation within its bounds. Demand lift is 4.5% × log(1 + budget); spending cannot fulfill orders without dealer stock.')] : []),
        lever('marketing', 'Dealer demand support', `${money(plan?.marketing ?? 0)} monthly expense`, 'Customer requests respond this month with diminishing returns', 'Higher demand only becomes sales when dealers have equipment. Compare demand gained with contribution after the support cost.'),
        lever('tractorPrice', 'Product pricing', 'Dealers pay 86% of customer list price', 'Demand and unit contribution change this month', 'A discount may win volume but can reduce contribution below the level needed to cover common costs. Compare product prices and production together.'),
      ],
    },
    strategy: {
      ...base, summary: competition.gaps.technology < 0 ? 'Our technology index trails the weighted rival benchmark. Decide whether closing the gap can earn its cash cost.' : 'Our technology is competitive; protect the advantage without assuming every project earns a return.',
      findings: [
        finding('Technology comparison', `${index(competition.player.technology)} vs ${index(competition.benchmark.technology)}`, 'Your observed capability versus the weighted fictional rival benchmark. Engineering matures after a delay; rival progress continues each month.', 'Observed capability and fictional public benchmarks'),
        finding('Price and quality position', `${index(competition.player.priceIndex)} price · ${percent(competition.player.quality)} quality`, `Rival weighted benchmarks: ${index(competition.benchmark.priceIndex)} price and ${percent(competition.benchmark.quality)} process quality. A higher price needs a persuasive product and reliable availability.`, 'Observed capability and fictional public benchmarks'),
        finding('Funded engineering and capacity', `${money(sum(state.rdPipeline.map(item => item.amount)))} engineering · ${money(sum(state.capexPipeline.map(item => item.amount)))} capex`, 'These projects are already funded. Review their completion dates before committing another wave.', 'Observed project pipeline'),
      ],
      levers: [
        lever('rd', 'Product engineering', `${money(plan?.rd ?? 0)} cash and expense now`, timing, 'Each completed $1m adds 0.007 to technology, subject to bounds and monthly erosion. It supports customer demand, not lower standard unit cost.'),
        lever('capex', 'Capacity expansion', `${money(plan?.capex ?? 0)} capital paid now`, timing, 'Each completed $1m adds 0.4 percentage points to the shared capacity bonus, capped at 40%. Capacity alone cannot create orders or supply missing components.'),
      ],
      unknowns: [...commonUnknowns, 'Rival shares are an estimated allocation of the remaining modeled market; individual rival accounts and future decisions are not simulated.'],
    },
    operations: {
      ...base, summary: report ? `The plan assembles ${number(totalAssembled)} units using ${number(totalCapacity)} available assembly slots. Diagnose unused slots before buying more.` : 'Plant condition, workforce capability and installed capacity determine what the factory can support.',
      findings: [
        finding('Plant condition and workforce capability', `${index(mean(state, 'condition'))} condition · ${index(mean(state, 'skill'))} skill`, 'These synthetic capability indices accumulate wear and training effects. Skill is not a measured cross-training percentage.', 'Observed capability'),
        ...(report ? [finding('Planned assembly utilization', totalCapacity ? percent(totalAssembled / totalCapacity) : 'No assembly slots', `${number(sum(flows.map(row => row.shortage)))} units of requested output are constrained. Unfinished machines, missing parts, rework and customer demand matter alongside nominal capacity.`)] : []),
        finding('Installed capacity bonus', percent(state.capacityBonus), `There is ${money(sum(state.capexPipeline.map(item => item.amount)))} of additional funded capacity in the pipeline.`, 'Observed asset capability'),
      ],
      levers: [
        lever('training', 'Workforce training', `${money(plan?.training ?? 0)} monthly cash and expense`, 'Skill and first-pass quality improve this month; benefits accumulate', 'Training improves capability and rework recovery. It does not immediately change the model’s standard labor cost per tractor.'),
        lever('maintenance', 'Maintenance and overtime', `${money(plan?.maintenance ?? 0)} maintenance; ${plan?.overtime ?? 0}% overtime`, 'Available slots respond this month; wear carries forward', 'Overtime provides 0.65% extra capacity per overtime point, with premium cost, added wear and defect risk. Maintenance offsets wear.'),
      ],
    },
    quality: {
      ...base, summary: `There are ${number(currentRework)} machines awaiting quality release. Prevention and recovery compete with the cost of defects and warranty exposure.`,
      findings: [
        finding('Current process and installed-fleet reliability', `${percent(mean(state, 'quality'))} process · ${percent(mean(state, 'warrantyQuality'))} fleet`, 'New production quality changes before installed-fleet reliability does. Older machines continue to generate claims.', 'Observed capability'),
        ...(report ? [
          finding('Forecast first-pass defects', `${number(totalDefects)} of ${number(totalAssembled)} assembled`, `${number(sum(flows.map(row => row.reworkResolved)))} older units are recovered. Rework consumes labor and assembly slots; simply raising output can compound the queue.`),
          finding('Warranty provision and cash claims', `${money(report.income.warrantyAccrual)} provision · ${money(report.cashFlow.warrantyClaims)} claims`, 'Provision reduces profit and builds a reserve. Paying claims consumes cash and the reserve; they must not be counted twice as expense.'),
        ] : latest ? [finding('Latest warranty claims', money(latest.cashFlow.warrantyClaims), 'Cash paid against warranty obligations in the latest completed month.', 'Observed completed month')] : []),
      ],
      levers: [
        lever('quality', 'Quality and supplier development', `${money(plan?.quality ?? 0)} monthly cash and expense`, 'Prevention and rework recovery respond now; installed-fleet effects are gradual', 'Quality supports first-pass output, supplier fulfillment and future reputation. Compare avoidance of repeat failures with the cost of prevention.'),
        lever('overtime', 'Fatigue versus output', `${plan?.overtime ?? 0}% overtime requested`, 'More slots and higher defect risk this month', 'Overtime is a temporary capacity lever. If quality is deteriorating, more hours can increase rework as well as shipments.'),
      ],
    },
    supply: {
      ...base, summary: `There are ${number(currentWip)} incomplete machines tying up material and conversion cost. Protect completion before starting avoidable extra work.`,
      findings: [
        finding('Manufacturer inventory', money(state.inventoryValue), 'Unused kits, controllers, unfinished machines, rework and finished stock are manufacturer assets. Dealer-owned inventory is excluded.', 'Observed balance sheet'),
        ...(report ? [
          finding('Controller receipts versus orders', `${number(sum(flows.map(row => row.controllerReceipts)))} / ${number(sum(flows.map(row => row.controllerOrder)))}`, `The public supply factor is ${percent(outlook.controllerSupply)}. Supplier fulfillment, buffer stock and receipt ceilings affect what actually arrives.`),
          finding('Unfinished work at close', `${number(report.metrics.incomplete)} machines`, `Expected manufacturer inventory is ${money(report.balanceSheet.inventory)}. Paying for extra material can consume cash before it becomes a saleable tractor.`),
        ] : []),
      ],
      levers: [
        ...(state.version === '1.3.0' ? [lever('supplierSupport', 'Controller supplier recovery', `${money(plan?.supplierSupport ?? 0)} monthly cash and expense`, 'Controller fulfillment responds this month', 'Each $1m adds 4 percentage points to controller fulfillment, capped at 100%, while receipt ceilings still apply. Spending beyond the remaining supply gap has no extra fulfillment benefit.')] : []),
        lever('partsBuffer', 'Component safety stock', `${plan?.partsBuffer ?? 0}% above production target`, 'Orders and purchases respond this month; supplier ceilings still apply', 'Buffer stock can protect against disruptions but ties up working capital and carries monthly inventory expense. It is not guaranteed supply.'),
        lever('tractorProduction', 'Release work to the factory', `${number(plan?.tractorProduction ?? 0)} tractors requested`, 'Starts, component demand and cash change this month', 'Coordinate production releases with components, quality and dealer demand. A higher target can leave more incomplete machines without increasing deliveries.'),
      ],
    },
  };
}

/** Unconsulted cards expose the question, not the specialist's full analysis. */
export function getExecutiveBriefing(state, plan) {
  const checked = validateState(state);
  if (!checked.valid) throw new Error(`Invalid simulation state: ${checked.errors.join(' ')}`);
  const active = state.status === 'active' && state.month < campaignLength(state);
  const month = active ? state.month + 1 : state.month;
  const visitedIds = getConsultedAdvisorIds(state, month);
  const visited = new Set(visitedIds);
  const checkedPlan = active && plan ? validatePlan(plan, state) : null;
  const projected = checkedPlan?.valid ? forecast(state, checkedPlan.plan) : null;
  const market = getMarketIntelligence(state);
  const competition = getCompetitiveIntelligence(state, { market, projectedReport: projected?.report });
  const outlook = active ? getMarketOutlook(state) : null;
  const details = conversations(state, checkedPlan?.valid ? checkedPlan.plan : plan, projected, market, competition, outlook);
  const advisors = ADVISORS.map(advisor => ({
    ...advisor, consulted: visited.has(advisor.id),
    ...(visited.has(advisor.id) ? details[advisor.id] : { summary: advisor.teaser, findings: [], levers: [], unknowns: [] }),
  }));
  const count = visited.size;
  return {
    month, active, visitedIds, count, total: ADVISORS.length, coverage: count / ADVISORS.length,
    confidence: count === ADVISORS.length ? 'Broad briefing; outcomes still uncertain' : count >= 3 ? 'Partial briefing' : 'Limited briefing',
    advisors,
    unknowns: [
      ...ADVISORS.filter(advisor => !visited.has(advisor.id)).map(advisor => `${advisor.topic}: ${advisor.role} not yet consulted this month.`),
      'Future shocks remain unknown even after every conversation. Meeting attendance never adds points or improves factory performance by itself.',
    ],
    forecastError: checkedPlan && !checkedPlan.valid ? checkedPlan.errors.join(' ') : null,
    methodology: 'Visits unlock specialist explanations and strategy comparisons for this planning month. They neither alter the physical model nor reveal random future events. The same facts are available through walking, tapping a person, or the accessible team list. Conversations refresh every month and respond to the current uncommitted plan.',
  };
}
