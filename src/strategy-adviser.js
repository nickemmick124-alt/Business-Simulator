/** Public-information strategy experiments. No future random draw informs a recommendation. */
import * as simulation from './simulation.js';
import { getMarketIntelligence } from './business-intelligence.js';
import { campaignLength } from './campaign-calendar.js';
import { getConsultedAdvisorIds } from './executive-intelligence.js';

const { PRODUCTS, PLAN_FIELDS, advanceMonth, createReplayInitialState, defaultPlan, forecast, getCampaignOutcome, getMarketOutlook, validatePlan, validateState } = simulation;
const sum = values => values.reduce((a, b) => a + b, 0);
const mean = values => sum(values) / Math.max(1, values.length);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value * 1e8) / 1e8;
const copy = value => JSON.parse(JSON.stringify(value));
const fields = state => simulation.getPlanFields?.(state) ?? PLAN_FIELDS;
const active = state => state.status === 'active' && state.month < campaignLength(state);
const advisorNames = { cfo: 'CFO', sales: 'Sales director', strategy: 'Strategy director', operations: 'Plant manager', quality: 'Quality lead', supply: 'Supply lead' };

export const STRATEGY_OBJECTIVES = Object.freeze([
  { id: 'balanced', name: 'Balanced business', description: 'Balance value, liquidity, delivery, technology and competitive position.', weights: { value: .45, liquidity: .15, service: .15, technology: .1, share: .1, quality: .05 } },
  { id: 'growth', name: 'Build future growth', description: 'Give more weight to market share and technology, while still penalizing financial failure.', weights: { value: .3, liquidity: .05, service: .1, technology: .2, share: .3, quality: .05 } },
  { id: 'resilience', name: 'Protect the business', description: 'Favor financial runway, dependable delivery and quality through a difficult market.', weights: { value: .3, liquidity: .3, service: .2, technology: .025, share: .025, quality: .15 } },
].map(item => Object.freeze({ ...item, weights: Object.freeze(item.weights) })));

function visited(state, month = state.month + 1) {
  return getConsultedAdvisorIds(state, month);
}

function feasible(state, input) {
  const defaults = defaultPlan(state);
  const result = {};
  for (const field of fields(state)) {
    result[field.key] = clamp(Number.isFinite(input[field.key]) ? input[field.key] : defaults[field.key], field.min, field.max);
    if (field.key.endsWith('Production')) result[field.key] = Math.round(result[field.key]);
    else result[field.key] = round(result[field.key]);
  }
  result.debtChange = clamp(result.debtChange, -Math.min(40, state.corporateDebt), Math.min(40, 160 - state.corporateDebt));
  return result;
}

function matchDemand(state, input, cushion = .08) {
  const plan = feasible(state, input);
  const report = forecast(state, plan).report;
  for (const flow of report.products) {
    const required = Math.max(0, flow.dealerOrders + flow.expectedDemand * cushion - flow.opening.finishedGoods - flow.reworkResolved);
    plan[`${flow.id}Production`] = Math.ceil(required / Math.max(.85, flow.qualityRate));
  }
  return feasible(state, plan);
}

function candidates(state, plan, consulted) {
  const list = [];
  const add = (id, name, proposed, reasoning, family = null) => list.push({ id, name, plan: feasible(state, proposed), reasoning, family,
    productionPolicy: ['chosen', 'steady'].includes(id) ? 'fixed-targets' : 'monthly-demand-match' });
  add('chosen', 'Your working plan', plan, 'Keep every number in the working plan, then repeat recurring policies.');
  add('steady', 'Hold the course', { ...defaultPlan(state), capex: 0, debtChange: 0 }, 'Continue last month’s operating policy without new factory spending or corporate borrowing.');
  if (consulted.includes('cfo')) {
    const lean = matchDemand(state, { ...plan, capex: 0, partsBuffer: 5, overtime: 0, marketing: Math.min(plan.marketing, 1.2) }, 0);
    add('protect-cash', 'Protect cash', lean, 'Use existing finished stock, order a lean component buffer and defer new factory capacity. Keep quality, maintenance and engineering intact.', 'cfo');
    const liquid = { ...lean };
    const cash = forecast(state, liquid).report.metrics.cash;
    if (cash < 20) liquid.debtChange += Math.ceil(20 - cash);
    add('liquidity', 'Protect a cash cushion', liquid, 'Use the cash-protection policy and test a visible first-month credit draw if forecast cash is below $20m. Available credit is bounded; borrowed cash is offset by debt.', 'cfo');
  }
  if (consulted.includes('sales')) {
    add('match-demand', 'Match output to dealer demand', matchDemand(state, plan), 'Use each month’s public dealer-order forecast and available finished stock to reset assembly targets, including a small service cushion.', 'sales');
    const pricing = { ...plan };
    for (const product of PRODUCTS) pricing[`${product.id}Price`] = Math.round(plan[`${product.id}Price`] * 1.04);
    add('margin', 'Test price discipline', matchDemand(state, pricing, .05), 'Test 4% higher customer prices and reschedule output for the resulting demand. Higher unit margin may cost market share.', 'sales');
    if (fields(state).some(field => field.key === 'dealerSupport')) add('dealer-growth', 'Strengthen the dealer network', matchDemand(state, { ...plan, dealerSupport: Math.max(plan.dealerSupport ?? 0, 1), marketing: Math.max(plan.marketing, 2.4) }, .12), 'Fund at least $1m of recurring dealer support and $2.4m of marketing. This improves customer access and reputation, but generates value only when margins and product availability support the added demand.', 'sales');
  }
  if (consulted.includes('strategy')) add('technology', 'Catch up in product technology', matchDemand(state, { ...plan, rd: Math.max(plan.rd, 3), capex: 0 }), 'Raise recurring engineering to at least $3m a month. Each month’s spending improves technology three months later; better products still need dealer stock and profitable pricing.', 'strategy');
  if (consulted.includes('operations')) add('capacity', 'Build capacity now', matchDemand(state, { ...plan, capex: Math.max(plan.capex, 10), maintenance: Math.max(plan.maintenance, 1.2) }, .2), 'Fund at least $10m of one-time factory capacity and support plant condition. The new capacity arrives three months later and helps only if demand, components and production targets use it.', 'operations');
  if (consulted.includes('quality')) add('quality-delivery', 'Rebuild quality and delivery', matchDemand(state, { ...plan, quality: Math.max(plan.quality, 2), training: Math.max(plan.training, 1), maintenance: Math.max(plan.maintenance, 1.2), overtime: Math.min(plan.overtime, 10) }, .1), 'Increase quality, cross-training and upkeep while limiting overtime. Defects and fatigue can improve before fleet reputation and warranty experience catch up.', 'quality');
  if (consulted.includes('supply')) {
    const reliable = { ...plan, partsBuffer: Math.max(plan.partsBuffer, 25), quality: Math.max(plan.quality, 1.6) };
    // Newer campaigns may include a paid supply lever. Older plans remain exact.
    if (fields(state).some(field => field.key === 'supplierSupport')) reliable.supplierSupport = Math.max(plan.supplierSupport ?? 0, 1);
    add('reliable-flow', 'Protect component flow', matchDemand(state, reliable, .1), 'Test a larger component buffer and supplier-development budget. This consumes working capital and cannot guarantee delivery during a supply shock.', 'supply');
  }
  if (consulted.includes('cfo') && consulted.includes('sales') && consulted.includes('operations')) add('balanced', 'Coordinate a balanced plan', matchDemand(state, { ...plan, partsBuffer: 10, maintenance: Math.max(plan.maintenance, 1), training: Math.max(plan.training, .6), capex: 0, overtime: Math.min(plan.overtime, 10) }), 'Combine the CFO, sales and plant briefings: match output, trim idle buffers and maintain the workforce before adding capacity.', 'cross-functional');
  return list;
}

function project(state, candidate, count) {
  const plan = candidate.plan;
  let current = state;
  const months = [];
  for (let index = 0; index < count && active(current); index += 1) {
    let recurring = index ? { ...plan, capex: 0, debtChange: 0 } : plan;
    if (index && candidate.productionPolicy === 'monthly-demand-match') recurring = matchDemand(current, recurring, candidate.id === 'protect-cash' || candidate.id === 'liquidity' ? 0 : candidate.id === 'capacity' ? .2 : .08);
    const result = forecast(current, recurring);
    current = result.state;
    months.push({ state: current, report: result.report });
  }
  return months;
}

function summarize(opening, months, market) {
  const ending = months.at(-1).state;
  const report = months.at(-1).report;
  const flows = months.flatMap(item => item.report.products);
  const orders = sum(flows.map(flow => flow.dealerOrders));
  const assemblies = sum(flows.map(flow => flow.assembled));
  const positions = [opening, ...months.map(item => item.state)];
  return {
    months: months.length, endingMonth: ending.month, status: ending.status,
    valueCreated: round(getCampaignOutcome(ending).adjustedEquity - getCampaignOutcome(opening).adjustedEquity),
    profit: round(sum(months.map(item => item.report.income.profit))),
    endingCash: ending.cash, endingCorporateDebt: ending.corporateDebt,
    minimumCash: Math.min(...positions.map(item => item.cash)),
    minimumLiquidity: Math.min(...positions.map(item => item.cash + Math.max(0, 160 - item.corporateDebt))),
    service: orders ? sum(flows.map(flow => flow.deliveries)) / orders : 0,
    quality: assemblies ? 1 - sum(flows.map(flow => flow.defects)) / assemblies : 0,
    technology: mean(PRODUCTS.map(product => ending.products[product.id].technology)),
    share: report.metrics.retailSales / market[ending.month - 1].units,
    capacity: sum(report.products.map(product => product.capacity)),
    capacityBonus: ending.capacityBonus,
  };
}

function rank(summary, objective, terminal) {
  const basis = { value: summary.valueCreated / 10, liquidity: summary.minimumLiquidity / 50,
    service: summary.service / .1, technology: (summary.technology - 1) / .05,
    share: summary.share / .02, quality: summary.quality / .02 };
  const weighted = sum(Object.entries(objective.weights).map(([key, weight]) => basis[key] * weight));
  return round(weighted - (summary.minimumCash < 0 ? 10 + Math.abs(summary.minimumCash) / 10 : 0) - (terminal ? 1000 : 0));
}

function changeList(state, plan, base) {
  return fields(state).filter(field => Math.abs(plan[field.key] - base[field.key]) > 1e-8)
    .map(field => ({ key: field.key, label: field.label, from: base[field.key], to: plan[field.key], unit: field.unit }));
}

/** Exhaustive only over the listed experiments, never over all possible plans. */
export function getStrategyAdviser(state, inputPlan, options = {}) {
  const objective = STRATEGY_OBJECTIVES.find(item => item.id === (options.objective ?? 'balanced'));
  if (!objective) throw new Error('Strategy objective must be balanced, growth, or resilience.');
  const checked = validateState(state);
  if (!checked.valid) throw new Error(`Invalid simulation state: ${checked.errors.join(' ')}`);
  const consulted = visited(state);
  const result = {
    available: active(state), reason: active(state) ? null : 'The campaign has ended. Review a completed month to see the information available then.',
    title: 'Best tested with current information', decisionMonth: active(state) ? state.month + 1 : null,
    objective: copy(objective), consulted, lockedFamilies: Object.entries(advisorNames).filter(([id]) => !consulted.includes(id)).map(([id, name]) => ({ id, name })),
    horizonRequested: 6, horizonModeled: Math.min(6, Math.max(0, campaignLength(state) - state.month)),
    comparisonMonths: 0, comparisonEndMonth: null, comparisonNote: '', bestId: null, bestName: null, candidates: [], warnings: [],
    publicOutlook: active(state) ? copy(getMarketOutlook(state)) : null,
    methodology: [
      'Only the listed, feasible strategies are tested. Best tested is not a global optimum, a board grade or a guaranteed result.',
      'The expected path uses the public market outlook and mean operating conditions. No future random draws or realized events enter candidate construction or ranking.',
      'Consultations unlock prepared strategy experiments; they do not award points or change the financial model. You can still set every operating number yourself.',
      'Your working plan and Hold the course repeat their production targets. Other strategies recalculate targets each projected month from that month’s public dealer-order forecast and available stock. Prices and recurring budgets repeat in all strategies. New factory spending and corporate borrowing or repayment occur only in the first month; no automatic rescue financing is assumed.',
      'Compare equal elapsed months. If any strategy reaches an early terminal state, displayed comparison metrics stop at that shared month; a failed strategy is always penalized in the ranking.',
      'The priority index uses value created per $10m, liquidity per $50m, delivery per 10 percentage points, technology per 0.05, share per 2 percentage points and quality per 2 percentage points, weighted by the selected objective. It is not a 0–100 performance score.',
      'These are expected forecasts, not quantified bull/bear stress tests. A softer market can strand inventory or capacity; stronger demand can reward earlier engineering and capacity, while supplier shocks can prevent production. Revisit the choice as evidence changes.',
    ],
  };
  if (!active(state)) return result;
  const valid = validatePlan(inputPlan, state);
  if (!valid.valid) throw new Error(`Invalid operating plan: ${valid.errors.join(' ')}`);
  const plan = valid.plan;
  const market = getMarketIntelligence(state).timeline;
  const experiments = candidates(state, plan, consulted).map(candidate => ({ ...candidate, months: project(state, candidate, result.horizonModeled) }));
  const common = Math.min(...experiments.map(candidate => candidate.months.length));
  result.comparisonMonths = common;
  result.comparisonEndMonth = state.month + common;
  result.comparisonNote = `Compare the same ${common} month${common === 1 ? '' : 's'}, from month ${state.month + 1} through ${state.month + common}.`;
  if (common < result.horizonModeled) result.comparisonNote += ' At least one strategy ends early, so later values are excluded from every numerical comparison.';
  for (const candidate of experiments) {
    const summary = summarize(state, candidate.months.slice(0, common), market);
    const last = candidate.months.at(-1).state;
    const failed = ['distressed', 'dismissed'].includes(last.status);
    const warnings = [];
    if (failed) warnings.push(`This expected path reaches ${last.status === 'dismissed' ? 'dismissal' : 'financial distress'} in month ${last.month}.`);
    if (summary.minimumCash < 0) warnings.push('Cash falls below zero. Available credit is not cash until explicitly drawn.');
    if (candidate.plan.capex > 0 && common < 4) warnings.push(`The new capacity first arrives in month ${state.month + 4}, after this comparison window.`);
    if (candidate.plan.rd > 0 && common < 4) warnings.push('New engineering spending has no technology effect within this shortened comparison.');
    result.candidates.push({ id: candidate.id, name: candidate.name, plan: copy(candidate.plan), reasoning: candidate.reasoning, family: candidate.family,
      changes: changeList(state, candidate.plan, plan), summary, score: rank(summary, objective, failed), warnings,
      failed, stopMonth: last.month, stopStatus: last.status, canApply: candidate.id !== 'chosen', productionPolicy: candidate.productionPolicy,
      path: candidate.months.map(item => ({ month: item.state.month, plan: copy(item.report.plan), cash: item.state.cash, status: item.state.status })) });
  }
  const best = result.candidates.reduce((winner, candidate) => candidate.score > winner.score ? candidate : winner);
  result.bestId = best.id;
  result.bestName = best.name;
  result.expectedGap = round(best.score - result.candidates[0].score);
  if (consulted.length < 6) result.warnings.push('The strategy search is incomplete: colleagues you have not consulted have additional prepared experiments. No visit gives a score bonus.');
  if (result.horizonModeled < 4) result.warnings.push('The remaining campaign is shorter than the three-month investment lead time. Future benefits beyond the campaign are not invented.');
  return result;
}

const narrativeKeys = new Set(['title', 'detail', 'explanation', 'summary', 'name', 'segment', 'label', 'cycleSummary', 'regimeLabel', 'ceoJournal']);
function matches(saved, generated, key = '') {
  if (narrativeKeys.has(key)) return true;
  if (typeof generated === 'number') return Number.isFinite(saved) && Math.abs(saved - generated) < 1e-7;
  if (generated === null || typeof generated !== 'object') return saved === generated;
  if (Array.isArray(generated)) return Array.isArray(saved) && saved.length === generated.length && generated.every((item, index) => matches(saved[index], item));
  return saved && typeof saved === 'object' && Object.keys(generated).every(child => matches(saved[child], generated[child], child));
}

/** Recreate the information set first; reveal only that month's shocks afterward. */
export function getHistoricalStrategyReview(state, month = state?.month, options = {}) {
  const unavailable = reason => ({ available: false, month, reason, adviser: null, actual: null, alternatives: [] });
  if (!Number.isInteger(month) || month < 1 || month > state?.month) return unavailable('Choose a completed month to review.');
  const checked = validateState(state);
  if (!checked.valid) return unavailable('This campaign contains invalid or unsupported data.');
  try {
    let opening = createReplayInitialState(state);
    for (let index = 0; index < month - 1; index += 1) {
      const saved = state.history[index];
      if (saved.isForecast || saved.forecast) return unavailable('A planning projection cannot be used as actual history.');
      const replay = advanceMonth(opening, saved.plan);
      if (!matches(saved, replay.report)) return unavailable(`Month ${index + 1} cannot be reproduced from its recorded plan.`);
      opening = replay.state;
    }
    if (Array.isArray(state.ceoJournal)) opening = { ...opening, ceoJournal: copy(state.ceoJournal.filter(entry => entry.month <= month)) };
    const saved = state.history[month - 1];
    if (saved.isForecast || saved.forecast) return unavailable('A planning projection cannot be used as actual history.');
    const adviser = getStrategyAdviser(opening, saved.plan, options);
    const actual = advanceMonth(opening, saved.plan);
    if (!matches(saved, actual.report)) return unavailable(`Month ${month} cannot be reproduced from its recorded plan.`);
    if (month === state.month && !matches(state, actual.state)) return unavailable('The current position differs from the recorded campaign replay.');
    const market = getMarketIntelligence(actual.state).timeline;
    const alternatives = adviser.candidates.map(candidate => {
      const realized = candidate.id === 'chosen' ? actual : advanceMonth(opening, candidate.plan);
      const summary = summarize(opening, [realized], market);
      const failed = ['distressed', 'dismissed'].includes(realized.state.status);
      return { id: candidate.id, name: candidate.name, summary, score: rank(summary, adviser.objective, failed) };
    });
    const hindsight = alternatives.reduce((best, candidate) => candidate.score > best.score ? candidate : best);
    return { available: true, month, adviser, actual: alternatives[0], alternatives,
      expectedBest: { id: adviser.bestId, name: adviser.bestName }, hindsightBest: hindsight,
      explanation: 'The six-month recommendation above was reconstructed using only that month’s opening position, public outlook and recorded consultations. The separate hindsight table replays only the completed decision month with identical shocks. Its one-month winner answers a different question; it does not prove which six-month strategy would have been best.' };
  } catch (error) { return unavailable(`A trustworthy strategy replay is unavailable. ${error.message}`); }
}
