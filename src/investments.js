/**
 * Read-only, like-for-like investment experiments using the public forecast.
 * Currency is USD millions; quality, service and market share are fractions.
 * This module never advances the live campaign or reads future random events.
 */
import { PRODUCTS, PLAN_FIELDS, balanceSheet, forecast, validatePlan, validateState } from './simulation.js';
import { getMarketIntelligence } from './business-intelligence.js';
import { campaignLength, campaignYearEnd } from './campaign-calendar.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => sum(values) / values.length;
const money = value => Math.round((value + Number.EPSILON) * 1e9) / 1e9;
const active = state => state.status === 'active' && state.month < campaignLength(state);
const DEFINITIONS = Object.freeze([
  { id: 'baseline', name: 'Keep the working plan', lever: null, increment: 0, lag: 0,
    purpose: 'Reference case with your current prices, production targets and budgets.',
    benefit: 'Existing policies and projects continue. This is the comparison, not a recommendation.' },
  { id: 'training', name: 'Workforce & cross-training', lever: 'training', increment: 0.6, lag: 0,
    purpose: 'Build workforce skill, improve first-pass quality and help recover rework.',
    benefit: 'Skill and quality start changing in the decision month, then accumulate with continued training. Cross-training is represented by aggregate workforce skill, not a detailed staffing model.' },
  { id: 'quality', name: 'Quality & supplier development', lever: 'quality', increment: 0.6, lag: 0,
    purpose: 'Reduce defects, recover rework and improve controller delivery reliability.',
    benefit: 'Quality and supplier effects start in the decision month. Reputation and warranty experience respond over time; integer units and capability limits can delay a visible benefit.' },
  { id: 'maintenance', name: 'Facility upkeep & reliability', lever: 'maintenance', increment: 0.5, lag: 0,
    purpose: 'Improve plant condition and protect effective assembly capacity.',
    benefit: 'Plant condition starts changing in the decision month. Better condition only increases shipments when capacity is a binding constraint.' },
  { id: 'capacity', name: 'Factory capacity upgrade', lever: 'capex', increment: 8, lag: 3,
    purpose: 'Add a one-time factory project, with additional capacity after the construction lead time.',
    benefit: 'Cash leaves and fixed assets increase in the decision month. Depreciation of the addition starts the following month; capacity arrives three months after the decision month. Unit production costs do not automatically fall.' },
  { id: 'engineering', name: 'Product engineering program', lever: 'rd', increment: 1.5, lag: 3,
    purpose: 'Build product technology to support future customer demand against competition.',
    benefit: 'Engineering is expensed each month. Each month’s work improves product technology three months later; demand may rise before output or dealer availability can satisfy it.' },
]);

function capabilities(state, report) {
  return {
    capacity: sum(report.products.map(product => product.capacity)),
    capacityBonus: state.capacityBonus,
    skill: mean(PRODUCTS.map(product => state.products[product.id].skill)),
    condition: mean(PRODUCTS.map(product => state.products[product.id].condition)),
    technology: mean(PRODUCTS.map(product => state.products[product.id].technology)),
    reputation: mean(PRODUCTS.map(product => state.products[product.id].reputation)),
    qualityCapability: mean(PRODUCTS.map(product => state.products[product.id].quality)),
    products: PRODUCTS.map(product => ({
      id: product.id, name: product.name,
      capacity: report.products.find(item => item.id === product.id).capacity,
      ...Object.fromEntries(['skill', 'condition', 'technology', 'reputation', 'quality'].map(key => [key, state.products[product.id][key]])),
    })),
  };
}

function project(state, plan, count, timeline) {
  const months = [];
  let next = state;
  for (let index = 0; index < count && active(next); index += 1) {
    const result = forecast(next, index === 0 ? plan : { ...plan, debtChange: 0, capex: 0 });
    next = result.state;
    const marketUnits = timeline[next.month - 1].units;
    months.push({
      month: next.month, status: next.status, report: result.report,
      position: balanceSheet(next), capabilities: capabilities(next, result.report),
      marketUnits, unitShare: result.report.metrics.retailSales / marketUnits,
    });
  }
  return months;
}

function summarize(months) {
  if (!months.length) return null;
  const last = months.at(-1);
  const products = months.flatMap(month => month.report.products);
  const assembled = sum(products.map(product => product.assembled));
  const orders = sum(products.map(product => product.dealerOrders));
  const minimum = months.reduce((lowest, month) => month.position.cash < lowest.position.cash ? month : lowest, months[0]);
  return {
    months: months.length, fromMonth: months[0].month, toMonth: last.month, status: last.status,
    revenue: money(sum(months.map(month => month.report.metrics.revenue))),
    profit: money(sum(months.map(month => month.report.metrics.profit))),
    deliveries: sum(months.map(month => month.report.metrics.deliveries)),
    retailSales: sum(months.map(month => month.report.metrics.retailSales)),
    production: sum(months.map(month => month.report.metrics.production)),
    endingCash: last.position.cash, endingDebt: last.position.debt,
    endingCorporateDebt: last.position.corporateDebt, endingInventory: last.position.inventory,
    minimumCash: minimum.position.cash, minimumCashMonth: minimum.month,
    endingUnitShare: last.unitShare,
    qualityRate: assembled ? 1 - sum(products.map(product => product.defects)) / assembled : mean(months.map(month => month.report.metrics.qualityRate)),
    serviceLevel: orders ? sum(products.map(product => product.deliveries)) / orders : 1,
    ...Object.fromEntries(['capacity', 'capacityBonus', 'skill', 'condition', 'technology', 'reputation', 'qualityCapability'].map(key => [key, last.capabilities[key]])),
  };
}

const DELTA_FIELDS = ['revenue', 'profit', 'deliveries', 'retailSales', 'production', 'endingCash', 'endingDebt', 'endingCorporateDebt', 'endingInventory', 'minimumCash', 'endingUnitShare', 'qualityRate', 'serviceLevel', 'capacity', 'capacityBonus', 'skill', 'condition', 'technology', 'reputation', 'qualityCapability'];
function difference(selected, baseline) {
  return Object.fromEntries(DELTA_FIELDS.map(key => [key, money(selected[key] - baseline[key])]));
}

/** Existing, already-funded projects. New projects are described in each option. */
function pipeline(state, endMonth) {
  return [
    ...state.capexPipeline.map(project => ({ ...project, kind: 'capacity', name: 'Factory capacity project' })),
    ...state.rdPipeline.map(project => ({ ...project, kind: 'engineering', name: 'Product engineering project' })),
  ].map(project => ({
    ...project,
    firstBenefitMonth: state.month + project.remaining,
    withinCampaign: state.month + project.remaining <= campaignLength(state),
    withinRequestedHorizon: state.month + project.remaining <= endMonth,
  })).sort((a, b) => a.firstBenefitMonth - b.firstBenefitMonth);
}

/**
 * Six explicit experiments: the working plan plus a change to one budget only.
 * All comparison summaries use the same months, even if one case fails early.
 * Full per-option projections remain available, clearly separated from deltas.
 */
export function getInvestmentOptions(state, inputPlan, horizon = 6) {
  const stateCheck = validateState(state);
  if (!stateCheck.valid) throw new Error(`Invalid simulation state: ${stateCheck.errors.join(' ')}`);
  const availableMonths = Math.max(0, campaignLength(state) - state.month);
  const requested = horizon === 'year-end' ? Math.max(1, campaignYearEnd(state) - state.month) : horizon === 'campaign-end' ? Math.max(1, availableMonths) : horizon;
  if (!Number.isInteger(requested) || requested < 1 || requested > campaignLength(state)) throw new Error(`Investment horizon must be a whole number of months from 1 to ${campaignLength(state)}, year-end, or campaign-end.`);
  const count = Math.min(requested, availableMonths);
  const result = {
    available: active(state), reason: active(state) ? null : 'The campaign has ended; investment decisions are closed.',
    decisionMonth: active(state) ? state.month + 1 : null,
    horizonRequested: requested, horizonAvailable: availableMonths, horizonModeled: count,
    comparisonMonths: 0, comparisonEndMonth: null, truncated: false,
    comparisonNote: '', pipeline: pipeline(state, state.month + count), warnings: [], options: [],
    assumptions: [
      'Synthetic expected scenarios use only the public market outlook and average operating outcomes, not future shocks or hidden random draws.',
      'Each experiment changes one investment budget. Prices, production targets, financing, overtime and all other operating policies stay fixed.',
      'Recurring budgets repeat for the selected horizon; factory investment and corporate borrowing or repayment occur only in the first month. No automatic rescue borrowing or extra credit is assumed.',
      'Operating capability can improve without more sales. Production targets, component supply, dealer demand, pricing and competitor pressure can still constrain the result.',
      'First benefit means the earliest possible change in the modeled capability, not a promise of profit, sales, payback or a return on investment. Effects can hit capability limits.',
      'Quality and delivery percentages summarize the compared months, weighted by assembly volume and dealer orders. Capacity and capability indices describe the last compared month; market share uses customer retail sales in that month.',
      'Differences use the same elapsed months across all enabled options. A distressed case shortens the comparison; no later result or long-term investment return is invented.',
    ],
  };
  if (!active(state)) return result;
  const checked = validatePlan(inputPlan, state);
  if (!checked.valid) throw new Error(`Invalid operating plan: ${checked.errors.join(' ')}`);
  const basePlan = checked.plan;
  const timeline = getMarketIntelligence(state).timeline;
  for (const definition of DEFINITIONS) {
    const plan = { ...basePlan };
    const field = definition.lever ? PLAN_FIELDS.find(item => item.key === definition.lever) : null;
    if (field) plan[field.key] = money(Math.min(field.max, plan[field.key] + definition.increment));
    const increment = field ? money(plan[field.key] - basePlan[field.key]) : 0;
    const enabled = !field || increment > 0;
    const months = enabled ? project(state, plan, count, timeline) : [];
    const oneTime = field?.key === 'capex';
    result.options.push({
      id: definition.id, name: definition.name, lever: definition.lever,
      purpose: definition.purpose, benefit: definition.benefit,
      enabled, canApply: enabled && Boolean(field),
      disabledReason: enabled ? null : `${field.label} is already at the allowed maximum.`,
      plan,
      planChanges: field && increment ? [{ key: field.key, label: field.label, from: basePlan[field.key], to: plan[field.key], unit: field.unit }] : [],
      costCommitment: {
        type: !field ? 'none' : oneTime ? 'one-time' : 'monthly',
        increment, monthlyIncrement: field && !oneTime ? increment : 0, oneTimeIncrement: oneTime ? increment : 0,
        baselineBudget: field ? basePlan[field.key] : 0, proposedBudget: field ? plan[field.key] : 0,
        plannedIncrement: money(increment * (oneTime ? Math.min(1, count) : count)),
        modeledIncrement: money(increment * (oneTime ? Math.min(1, months.length) : months.length)),
        comparisonIncrement: 0,
      },
      timing: {
        lagMonths: definition.lag,
        firstBenefitMonth: field && enabled ? state.month + 1 + definition.lag : null,
        observedFirstCapabilityBenefitMonth: null,
        benefitWithinComparison: false,
        withinCampaign: field && enabled ? state.month + 1 + definition.lag <= campaignLength(state) : false,
        detail: definition.benefit,
      },
      months, summary: summarize(months), comparison: null, warnings: [],
      stopReason: !enabled ? 'disabled' : months.at(-1)?.status === 'distressed' ? 'distress'
        : months.at(-1)?.month === campaignLength(state) ? (campaignLength(state) === 12 ? 'year-end' : 'campaign-end') : 'horizon',
    });
  }
  const enabled = result.options.filter(option => option.enabled);
  const common = Math.min(...enabled.map(option => option.months.length));
  const baseline = result.options[0];
  result.comparisonMonths = common;
  result.comparisonEndMonth = common ? state.month + common : null;
  result.truncated = common < count;
  const distressed = enabled.filter(option => option.stopReason === 'distress');
  if (distressed.length) result.warnings.push({
    id: 'financial-distress', severity: 'danger',
    detail: `${distressed.map(option => `${option.name}: month ${option.months.at(-1).month}`).join('; ')}. These projections reach financial distress; a budget within its allowed range is not necessarily affordable.`,
  });
  result.comparisonNote = result.truncated
    ? `All differences compare months ${state.month + 1}–${state.month + common}. ${distressed.map(option => `${option.name} reaches distress in month ${option.months.at(-1).month}`).join('; ')}. The ${count}-month requested comparison is shortened; later results are not comparable.`
    : `All differences compare the same ${common} months, ${state.month + 1}–${state.month + common}${count < requested ? (campaignLength(state) === 12 ? ', stopping at campaign year-end' : ', stopping at campaign end') : ''}.`;
  const baselineSummary = summarize(baseline.months.slice(0, common));
  for (const option of enabled) {
    const selected = summarize(option.months.slice(0, common));
    option.costCommitment.comparisonIncrement = money(option.costCommitment.increment * (option.costCommitment.type === 'one-time' ? Math.min(1, common) : common));
    option.timing.benefitWithinComparison = option.timing.firstBenefitMonth !== null && option.timing.firstBenefitMonth <= result.comparisonEndMonth;
    if (option.timing.firstBenefitMonth !== null && !option.timing.benefitWithinComparison) option.warnings.push({
      id: 'benefit-after-window', severity: 'warning',
      detail: `The first possible capability effect is month ${option.timing.firstBenefitMonth}, after the comparison ends in month ${result.comparisonEndMonth}. The result includes spending without this later operating benefit.`,
    });
    if (option.months.some(month => month.position.cash < 0)) option.warnings.push({
      id: 'negative-cash', severity: 'danger',
      detail: `Projected cash first falls below zero in month ${option.months.find(month => month.position.cash < 0).month}. This option adds no rescue borrowing.`,
    });
    const capabilityKey = { training: 'skill', quality: 'qualityCapability', maintenance: 'condition', capacity: 'capacityBonus', engineering: 'technology' }[option.id];
    if (capabilityKey) {
      const first = option.months.slice(0, common).find((month, index) => month.capabilities[capabilityKey] > baseline.months[index].capabilities[capabilityKey] + 1e-9);
      option.timing.observedFirstCapabilityBenefitMonth = first?.month ?? null;
    }
    option.comparison = {
      months: common, endingMonth: result.comparisonEndMonth,
      baseline: { ...baselineSummary }, selected, delta: difference(selected, baselineSummary),
      monthly: option.months.slice(0, common).map((month, index) => {
        const original = summarize([baseline.months[index]]);
        const revised = summarize([month]);
        return { month: month.month, baseline: original, selected: revised, delta: difference(revised, original) };
      }),
    };
  }
  return result;
}
