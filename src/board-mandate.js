/**
 * Announced board objectives and absolute outcome assessment. Read-only; USD m,
 * ratios as fractions. Targets depend on the opening public mandate, never on
 * future shocks or the player's later plan. This is not a company valuation.
 */
import {
  PRODUCTS, advanceMonth, createReplayInitialState, forecast, getMarketOutlook,
  validatePlan, validateState,
} from './simulation.js';
import { campaignLength, campaignYear, calendarMonth } from './campaign-calendar.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const round = (value, digits = 6) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
const clone = value => JSON.parse(JSON.stringify(value));
const mean = values => sum(values) / Math.max(1, values.length);
const letter = score => score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
const overallStatus = score => score >= 85 ? 'Beating' : score >= 70 ? 'Meeting' : 'Behind';
const BASELINE_SHARES = { tractor: 0.20, harvester: 0.18, loader: 0.16 };
const replayCache = new WeakMap();

const METRICS = Object.freeze([
  { id: 'value', label: 'Earned company value', unit: '$m', weight: 30, direction: 'higher', tolerance: 2,
    definition: 'Cumulative change in book equity after inventory, receivable and customer-loan realization discounts. All recorded debt and obligations are already deducted; capital spending is not itself value created.' },
  { id: 'liquidity', label: 'Cash and available credit', unit: '$m', weight: 15, direction: 'higher', tolerance: 5,
    definition: 'Ending cash plus unused corporate credit within the $160m facility. A draw exchanges available credit for cash and cannot increase this measure; customer-finance funding is matched to its loan assets.' },
  { id: 'inventory', label: 'Factory inventory cover', unit: 'months', weight: 10, direction: 'lower', tolerance: 0.10,
    definition: 'All factory inventory at standard cost divided by average monthly cost of goods sold over the latest three completed months, or the months available. A $8m denominator floor prevents division by zero; lower inventory must still support delivery.' },
  { id: 'delivery', label: 'Dealer delivery', unit: '%', weight: 20, direction: 'higher', tolerance: 0.02,
    definition: 'Factory deliveries divided by dealer replenishment orders in the review period. Quarterly reviews weight all orders, rather than averaging monthly percentages.' },
  { id: 'quality', label: 'First-pass quality', unit: '%', weight: 10, direction: 'higher', tolerance: 0.003,
    definition: 'Good first-pass assemblies divided by all assemblies in the review period. No assembly means no measured first-pass result and earns no quality points.' },
  { id: 'share', label: 'Retail unit market share', unit: '%', weight: 15, direction: 'higher', tolerance: 0.002,
    definition: 'Customer retail units divided by the modeled addressable industry units in the same period. Dealer shipments and customer financing do not inflate this share.' },
].map(Object.freeze));

const PROFILES = {
  soft: {
    title: 'Protect the franchise through a soft market',
    directive: 'Preserve liquidity, control unsold equipment, and keep quality and dealer delivery dependable. Approve capacity only where expected orders exceed usable capacity; protect product capability for the recovery.',
    annualValue: [0, 12, 30], annualShare: [0.17, 0.175, 0.18], liquidity: 175,
  },
  flat: {
    title: 'Build profitable share and a stronger business',
    directive: 'Grow retail share while earning a return and controlling working capital. Improve the actual factory bottleneck, maintain dependable delivery, and fund engineering without exhausting the cash cushion.',
    annualValue: [18, 50, 90], annualShare: [0.18, 0.185, 0.19], liquidity: 165,
  },
  upswing: {
    title: 'Capture the upswing without overextending',
    directive: 'Capture profitable demand and improve share while protecting delivery and quality. Prepare useful capacity before orders arrive, but fund it against the outlook and preserve room for a reversal.',
    annualValue: [36, 90, 160], annualShare: [0.185, 0.195, 0.205], liquidity: 150,
  },
};

function assertState(state) {
  const checked = validateState(state);
  if (!checked.valid) throw new Error(`Invalid campaign: ${checked.errors.join(' ')}`);
}

function monthGoal(month, profile) {
  const year = campaignYear(month);
  const progress = calendarMonth(month) / 12;
  const previousValue = year === 1 ? -8 : profile.annualValue[year - 2];
  const previousShare = year === 1 ? 0.17 : profile.annualShare[year - 2];
  const targets = {
    value: round(previousValue + (profile.annualValue[year - 1] - previousValue) * progress),
    liquidity: profile.liquidity,
    inventory: round(month < 4 ? 1.4 - month * 0.15 : 0.8),
    delivery: round(month < 4 ? 0.88 + month * 0.02 : 0.95),
    quality: round(Math.min(0.976, 0.955 + month * 0.0006)),
    share: round(previousShare + (profile.annualShare[year - 1] - previousShare) * progress),
  };
  const thresholds = {
    value: { floor: round(targets.value - 14 - month * 0.8), target: targets.value, stretch: round(targets.value + 10 + month * 0.7) },
    liquidity: { floor: 25, target: targets.liquidity, stretch: targets.liquidity + 80 },
    inventory: { floor: 3.5, target: targets.inventory, stretch: 0.15 },
    delivery: { floor: 0.45, target: targets.delivery, stretch: 1 },
    quality: { floor: 0.90, target: targets.quality, stretch: 0.992 },
    share: { floor: round(targets.share * 0.55), target: targets.share, stretch: round(targets.share + 0.025) },
  };
  return { month, year, quarter: Math.ceil(calendarMonth(month) / 3), campaignQuarter: Math.ceil(month / 3), quarterEnd: month % 3 === 0, targets, thresholds };
}

/** All goals are disclosed on opening and reconstructed without looking ahead. */
export function getBoardMandate(state) {
  assertState(state);
  const regime = state.marketCycle?.initialRegime ?? 'flat';
  const profile = PROFILES[regime];
  const horizonMonths = campaignLength(state);
  // The UI marks only newly started campaigns. Existing saves are never tagged
  // on load, so introducing goals cannot imply that older players saw them.
  const retrospective = !['1.2.0', '1.3.0'].includes(state.version) && state.boardMandateVersion !== '1.0.0';
  const monthlyGoals = Array.from({ length: horizonMonths }, (_, index) => monthGoal(index + 1, profile));
  return {
    available: true, regime, title: profile.title, directive: profile.directive, horizonMonths, retrospective,
    targetBasis: retrospective
      ? 'Retrospective learning benchmark for this older campaign. The fixed opening-regime goals were not shown when its original decisions were made; they do not rewrite those decisions or their outcomes.'
      : 'Fixed opening mandate. Every monthly, quarterly and annual target is announced before the first decision and remains unchanged when plans or market conditions change.',
    metrics: METRICS.map(metric => ({ ...metric })), monthlyGoals,
    quarterlyGoals: monthlyGoals.filter(goal => goal.quarterEnd),
    annualGoals: monthlyGoals.filter(goal => goal.month % 12 === 0),
    scoringMethodology: 'Absolute target attainment: the disclosed floor earns 0, meeting the exact target earns 75, and stretch earns 100 for each weighted measure. Scores interpolate between those anchors and are capped at 0–100. No ranking against other players or automatic bonus for spending. The composite is Beating at 85+, Meeting at 70–84, and Behind below 70; metric status uses its disclosed tolerance around the target.',
    guardrails: [
      'Financial distress caps the total at 39. A negative closing cash balance caps it at 59, even if unused credit remains.',
      'Dealer delivery below 50%, retail share below half its target, or no retail sales caps the total at 59. Idle cash and an empty factory cannot earn an A.',
      'When a cap applies, earned component points reduce proportionally so the displayed components still add to the total. The original uncapped score remains visible.',
    ],
    notes: [
      'Goals are synthetic learning objectives, not actual CNH guidance. The initial soft, flat or upswing backdrop selects the mandate; the latest outlook informs board commentary but does not move the goalposts.',
      'The first three months allow for opening inventory, controller constraints and an initial earnings adjustment. Later goals require stronger quality, delivery and productive use of capital.',
      'Share goals are combined unit share across the three modeled equipment families. A higher share purchased through unprofitable pricing can still miss the value goal.',
      'Longer campaigns disclose all three years from the start. Annual milestones are commitments, not forecasts of the market; a later downturn can make them harder to reach.',
    ],
  };
}

function valuePosition(state) {
  let finished = 0;
  let incomplete = 0;
  for (const product of PRODUCTS) {
    const stock = state.products[product.id];
    finished += (stock.finishedGoods + stock.rework) * (product.materialCost + product.conversionCost);
    incomplete += stock.incomplete * (product.materialCost * 0.78 + product.conversionCost * 0.6);
  }
  const discounts = { finishedAndRework: finished * 0.20, incomplete: incomplete * 0.35,
    receivables: state.receivables * 0.035, customerLoans: state.loanBook * 0.025 };
  const realizationDiscount = sum(Object.values(discounts));
  return { bookEquity: state.equity, adjustedEquity: round(state.equity - realizationDiscount, 9),
    realizationDiscount: round(realizationDiscount, 9), discounts: Object.fromEntries(Object.entries(discounts).map(([key, value]) => [key, round(value, 9)])) };
}

function industryUnits(report) {
  const factors = report.marketContext?.realized ?? report.outlook;
  return sum(PRODUCTS.map(product => Math.round(product.baseDemand / BASELINE_SHARES[product.id]
    * (product.segment === 'Agriculture' ? factors.agriculture : factors.construction))));
}

function periodFacts(ending, reports, initial) {
  const products = reports.flatMap(report => report.products);
  const orders = sum(products.map(product => product.dealerOrders));
  const deliveries = sum(products.map(product => product.deliveries));
  const retail = sum(products.map(product => product.retailSales));
  const assemblies = sum(products.map(product => product.assembled));
  const defects = sum(products.map(product => product.defects));
  const costs = ending.history.slice(-3).map(report => report.income.cogs);
  return {
    value: round(valuePosition(ending).adjustedEquity - valuePosition(initial).adjustedEquity, 9),
    liquidity: round(ending.cash + Math.max(0, 160 - ending.corporateDebt), 9),
    inventory: ending.inventoryValue / Math.max(8, mean(costs)),
    delivery: orders > 0 ? deliveries / orders : retail > 0 ? 1 : 0,
    quality: assemblies > 0 ? (assemblies - defects) / assemblies : null,
    share: retail / Math.max(1, sum(reports.map(industryUnits))),
    cash: ending.cash, retail, status: ending.status, assemblies,
  };
}

function attainment(actual, thresholds, direction) {
  if (actual == null || !Number.isFinite(actual)) return 0;
  const sign = direction === 'lower' ? -1 : 1;
  const value = actual * sign;
  const floor = thresholds.floor * sign;
  const target = thresholds.target * sign;
  const stretch = thresholds.stretch * sign;
  return clamp(value <= target ? 75 * (value - floor) / (target - floor)
    : 75 + 25 * (value - target) / (stretch - target), 0, 100);
}

function assess(facts, goal) {
  const components = METRICS.map(metric => {
    const actual = facts[metric.id];
    const target = goal.targets[metric.id];
    const gap = actual == null ? null : actual - target;
    const favorableGap = gap == null ? null : gap * (metric.direction === 'lower' ? -1 : 1);
    const percentage = attainment(actual, goal.thresholds[metric.id], metric.direction);
    return { ...metric, actual, target, gap, favorableGap,
      status: actual == null ? 'Unmeasured' : favorableGap > metric.tolerance ? 'Beating' : favorableGap >= -metric.tolerance ? 'Meeting' : 'Behind',
      score: round(percentage * metric.weight / 100, 2), maximum: metric.weight,
      attainmentScore: round(percentage, 2), thresholds: { ...goal.thresholds[metric.id] } };
  });
  const uncappedScore = round(sum(components.map(component => component.score)), 2);
  let guardrail = null;
  if (facts.status === 'distressed') guardrail = { id: 'distress', ceiling: 39, message: 'Financial distress ends the mandate and caps the board score at 39.' };
  else if (facts.cash < 0) guardrail = { id: 'negative-cash', ceiling: 59, message: 'Closing cash is negative. Available credit must be drawn before it can pay bills; the board score is capped at 59.' };
  else if (facts.retail === 0 || facts.delivery < 0.5 || facts.share < goal.targets.share * 0.5) guardrail = { id: 'unserved-market', ceiling: 59, message: 'The business is not adequately serving its customers or dealers; the board score is capped at 59.' };
  if (guardrail && uncappedScore > guardrail.ceiling) {
    for (const component of components) {
      component.scoreBeforeGuardrail = component.score;
      component.score = round(component.score * guardrail.ceiling / uncappedScore, 2);
    }
  }
  const score = Math.round(sum(components.map(component => component.score)));
  return { score, grade: letter(score), status: overallStatus(score), components, uncappedScore, guardrail };
}

function futureValue(ending, initial) {
  const position = valuePosition(ending);
  const report = ending.history.at(-1);
  const capacity = report ? sum(report.products.map(product => product.capacity)) : null;
  const assembled = report ? sum(report.products.map(product => product.assembled)) : null;
  const pipeline = [
    ...ending.capexPipeline.map(project => ({ type: 'capacity', amount: project.amount, maturesMonth: ending.month + project.remaining,
      effect: 'Adds operating capacity when completed; fixed assets already include the cash investment.' })),
    ...ending.rdPipeline.map(project => ({ type: 'engineering', amount: project.amount, maturesMonth: ending.month + project.remaining,
      effect: 'Improves product technology when completed; engineering was expensed when funded.' })),
  ].map(project => ({ ...project, withinCampaign: project.maturesMonth <= campaignLength(ending) }));
  return {
    ...position, valueCreated: round(position.adjustedEquity - valuePosition(initial).adjustedEquity, 9),
    initialAdjustedEquity: valuePosition(initial).adjustedEquity,
    capability: {
      capacityBonus: ending.capacityBonus, condition: mean(PRODUCTS.map(product => ending.products[product.id].condition)),
      workforce: mean(PRODUCTS.map(product => ending.products[product.id].skill)),
      technology: mean(PRODUCTS.map(product => ending.products[product.id].technology)),
      reputation: mean(PRODUCTS.map(product => ending.products[product.id].reputation)),
      fleetReliability: mean(PRODUCTS.map(product => ending.products[product.id].warrantyQuality)),
      latestCapacity: capacity, latestAssemblies: assembled, utilization: capacity ? assembled / capacity : null,
    },
    pipeline, fundedCapacityPipeline: sum(ending.capexPipeline.map(project => project.amount)),
    fundedEngineeringPipeline: sum(ending.rdPipeline.map(project => project.amount)),
    explanation: 'Earned value is risk-adjusted book equity, not a sale price or discounted-cash-flow valuation. Capability and funded projects describe future earning potential; their budgets are not added to company value or awarded points. Capacity pays back only when useful output becomes profitable, collected sales. Engineering improves product technology and expected customer demand after its lead time, while spending reduces current earnings.',
  };
}

function outlookComment(ending, mandate) {
  const outlook = getMarketOutlook(ending);
  const regime = outlook.regime ?? 'flat';
  const recommendation = regime === 'soft'
    ? 'The current public outlook calls for cash discipline: defend quality and dealer service, resize output to orders, and question capacity that would sit idle.'
    : regime === 'upswing'
      ? 'The current public outlook supports growth: test whether production, components or product appeal limits profitable sales, and fund the specific constraint before demand arrives.'
      : 'The current public outlook is broadly flat: improve product appeal and conversion of inventory into collected sales, with selective investment where a measurable bottleneck exists.';
  return { regime, regimeLabel: outlook.regimeLabel ?? 'Original seasonal market',
    changedFromMandate: regime !== mandate.regime, detail: `${recommendation} The original targets remain in force.` };
}

const ACTIONS = {
  value: 'Compare contribution after dealer discount with overhead, warranty and financing costs; invest only when the expected operating benefit justifies its cost.',
  liquidity: 'Review the cash projection, release avoidable inventory and preserve credit capacity. Draw approved credit if cash would otherwise fall below zero.',
  inventory: 'Resize production and component purchases to dealer replenishment; reduce unsold stock without creating delivery gaps.',
  delivery: 'Inspect missing controllers, assembly workload, first-pass defects and dealer stock before choosing overtime or factory expansion.',
  quality: 'Protect process quality through the right mix of training, maintenance and supplier work; a larger plant does not fix defects.',
  share: 'Compare pricing, financing, technology, reputation and retail availability. Grow share with a profitable offer, not volume at any cost.',
};

function reviewFor(ending, initial, mandate, startMonth = ending.month, kind = 'actual') {
  const month = ending.month;
  const goal = mandate.monthlyGoals[month - 1];
  const reports = ending.history.slice(startMonth - 1, month);
  const assessment = assess(periodFacts(ending, reports, initial), goal);
  const ordered = [...assessment.components].sort((a, b) => b.attainmentScore - a.attainmentScore);
  const strengths = ordered.filter(component => component.status === 'Beating' || component.status === 'Meeting').slice(0, 2)
    .map(component => ({ id: component.id, title: component.label, detail: `${component.status} the announced target.`, status: component.status }));
  const priorities = [...ordered].reverse().filter(component => component.status === 'Behind' || component.status === 'Unmeasured').slice(0, 3)
    .map(component => ({ id: component.id, title: component.label, detail: ACTIONS[component.id], status: component.status }));
  if (!priorities.length) priorities.push({ id: 'resilience', title: 'Protect the lead', detail: 'Stress-test the next plan against weaker demand and a supplier disruption before using the remaining cash cushion.', status: 'Meeting' });
  const quarterly = startMonth !== month || month % 3 === 0;
  const message = ending.status === 'dismissed'
    ? kind === 'forecast'
      ? 'This plan is projected to reach the dismissal threshold. Review the failed employment guardrails before committing; this forecast has not added any actual strikes.'
      : 'The board has ended your tenure after repeated operating failures. This final score records the business outcome; use the monthly history to identify where a different plan could have protected the mandate.'
    : assessment.status === 'Beating' ? 'The business is ahead of the mandate. Sustain profitable delivery and protect liquidity before committing the next investment.'
    : assessment.status === 'Meeting' ? 'The business is broadly meeting the mandate. Address the gaps below; meeting the plan is a solid result, while an A requires sustained stretch performance.'
      : 'The business is behind the mandate. Focus the next plan on the largest missed objectives and protect cash before adding commitments.';
  return {
    available: true, kind, month, year: goal.year, quarter: goal.quarter, startMonth,
    period: quarterly && startMonth !== month ? 'quarter' : 'month', ...assessment,
    goal: clone(goal), message: assessment.guardrail ? `${assessment.guardrail.message} ${message}` : message,
    strengths, priorities, futureValue: futureValue(ending, initial), currentOutlook: outlookComment(ending, mandate),
    interpretation: kind === 'forecast' ? startMonth < month
      ? 'Quarter preview combines completed actual months with the expected final month, against the fixed quarter-end targets. It is not a completed quarter; actual results may differ.'
      : 'Expected next-month performance against already announced targets; the plan and public outlook can change and actual results may differ.'
      : mandate.retrospective
        ? 'Actual outcomes against a retrospective fixed learning benchmark. These goals were not displayed when the older campaign was played. Decision coaching separately assesses choices using information available before the month.'
        : 'Actual business outcomes against targets announced at campaign opening. Decision coaching separately assesses choices using information available before the month.',
  };
}

// Do not fabricate historical lessons from structurally valid but edited reports.
const narrativeKeys = new Set(['title', 'detail', 'explanation', 'summary', 'name', 'segment', 'label', 'cycleSummary', 'regimeLabel']);
function matches(saved, generated, key = '') {
  // Consultations record what the CEO read, not a change to the company's
  // financial position. Engine validation separately checks this journal.
  if (key === 'ceoJournal') return true;
  if (narrativeKeys.has(key)) return true;
  if (typeof generated === 'number') return typeof saved === 'number' && Number.isFinite(saved) && Math.abs(saved - generated) < 1e-7;
  if (generated === null || typeof generated !== 'object') return saved === generated;
  if (Array.isArray(generated)) return Array.isArray(saved) && saved.length === generated.length && generated.every((item, index) => matches(saved[index], item));
  return saved && typeof saved === 'object' && Object.keys(generated).every(child => matches(saved[child], generated[child], child));
}

function replay(state) {
  assertState(state);
  const fingerprint = JSON.stringify(state);
  const cached = replayCache.get(state);
  if (cached?.fingerprint === fingerprint) return cached;
  const initial = createReplayInitialState(state);
  const states = [initial];
  for (const saved of state.history) {
    if (saved.isForecast || saved.forecast) throw new Error('A planning projection cannot be reviewed as an actual committed month.');
    const result = advanceMonth(states.at(-1), saved.plan);
    if (!matches(saved, result.report)) throw new Error(`Month ${saved.month} cannot be reproduced from the recorded campaign.`);
    states.push(result.state);
  }
  if (!matches(state, states.at(-1))) throw new Error('The current position differs from the recorded campaign replay.');
  const result = { fingerprint, initial, states };
  replayCache.set(state, result);
  return result;
}

function unavailable(month, reason) {
  return { available: false, kind: 'actual', month, reason, score: null, grade: null, status: null, components: [], quarterReview: null };
}

/** Historical months remain stable as subsequent periods and plans change. */
export function getBoardReview(state, month = state?.month) {
  if (!Number.isInteger(month) || month < 1 || month > state?.month) return unavailable(month, 'Choose a completed month to review.');
  try {
    const data = replay(state);
    const mandate = getBoardMandate(state);
    const review = reviewFor(data.states[month], data.initial, mandate);
    review.quarterReview = month % 3 === 0 ? reviewFor(data.states[month], data.initial, mandate, month - 2) : null;
    return review;
  } catch (error) { return unavailable(month, error.message); }
}

/** Public target schedule, actual review, and a distinct selected-plan preview. */
export function getBoardDashboard(state, plan) {
  const mandate = getBoardMandate(state);
  let data;
  try { data = replay(state); }
  catch (error) {
    return { mandate, current: state.month ? unavailable(state.month, error.message) : null, next: null,
      nextQuarter: null, history: [], forecastError: error.message };
  }
  const history = data.states.slice(1).map(ending => {
    const review = reviewFor(ending, data.initial, mandate);
    review.quarterReview = ending.month % 3 === 0 ? reviewFor(ending, data.initial, mandate, ending.month - 2) : null;
    return review;
  });
  let next = null;
  let forecastError = null;
  if (state.status === 'active' && state.month < campaignLength(state) && plan != null) {
    const checked = validatePlan(plan, state);
    if (!checked.valid) forecastError = checked.errors.join(' ');
    else {
      const expected = forecast(state, checked.plan);
      next = reviewFor(expected.state, data.initial, mandate, expected.state.month, 'forecast');
      next.quarterReview = expected.state.month % 3 === 0
        ? reviewFor(expected.state, data.initial, mandate, expected.state.month - 2, 'forecast') : null;
    }
  }
  return { mandate, current: history.at(-1) ?? null, next,
    nextQuarter: state.status === 'active' ? clone(mandate.quarterlyGoals.find(goal => goal.month > state.month) ?? null) : null,
    history, forecastError };
}
