import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, defaultPlan, forecast, advanceMonth, validatePlan, PLAN_FIELDS } from '../src/simulation.js';
import { projectBusiness, getMarketIntelligence } from '../src/business-intelligence.js';
import { getInvestmentOptions } from '../src/investments.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const clone = value => JSON.parse(JSON.stringify(value));
const option = (result, id) => result.options.find(item => item.id === id);
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} must equal ${expected}`); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('baseline investment path exactly matches the existing sequential business forecast', () => {
  const state = createInitialState(81, { marketRegime: 'upswing' });
  const plan = { ...defaultPlan(state), capex: 3, debtChange: 8 };
  const expected = projectBusiness(state, plan, 6);
  const result = getInvestmentOptions(state, plan, 6);
  const baseline = option(result, 'baseline');
  assert.deepEqual(baseline.months.map(month => month.report), expected.months.map(month => month.report));
  assert.equal(baseline.summary.endingCash, expected.ending.cash);
  assert.ok(Object.values(baseline.comparison.delta).every(value => value === 0));
  assert.equal(result.comparisonMonths, 6);
  assert.equal(result.truncated, false);
});

test('each applicable investment changes one lever and preserves prices, output and credit limits', () => {
  const state = createInitialState();
  const plan = { ...defaultPlan(state), debtChange: 40 };
  const result = getInvestmentOptions(state, plan);
  assert.equal(result.options.length, 6);
  for (const item of result.options) {
    assert.ok(validatePlan(item.plan, state).valid);
    const changed = Object.keys(plan).filter(key => plan[key] !== item.plan[key]);
    assert.deepEqual(changed, item.lever ? [item.lever] : []);
    assert.equal(item.planChanges.length, item.lever ? 1 : 0);
    assert.equal(item.canApply, Boolean(item.lever));
    assert.ok(item.months.every(month => month.position.corporateDebt === 120));
    assert.equal(item.months[0].report.plan.debtChange, 40);
    assert.ok(item.months.slice(1).every(month => month.report.plan.debtChange === 0));
  }
});

test('capacity spending is one-time and recurring investments repeat without hidden financing', () => {
  const state = createInitialState();
  const plan = defaultPlan(state);
  const result = getInvestmentOptions(state, plan, 6);
  for (const item of result.options.filter(item => item.lever)) {
    const isCapex = item.id === 'capacity';
    assert.equal(item.costCommitment.type, isCapex ? 'one-time' : 'monthly');
    close(item.costCommitment.plannedIncrement, item.costCommitment.increment * (isCapex ? 1 : 6));
    close(item.costCommitment.modeledIncrement, item.costCommitment.plannedIncrement);
    close(item.costCommitment.comparisonIncrement, item.costCommitment.plannedIncrement);
    close(sum(item.months.map(month => month.report.plan[item.lever])), isCapex ? 8 : item.plan[item.lever] * 6);
    assert.ok(item.months.every(month => month.report.plan.debtChange === 0));
  }
  const capacity = option(result, 'capacity');
  assert.equal(capacity.months[0].report.cashFlow.capex, 8);
  assert.ok(capacity.months.slice(1).every(month => month.report.cashFlow.capex === 0));
});

test('new capacity and engineering cost money before their month-four capability benefit', () => {
  const state = createInitialState();
  const result = getInvestmentOptions(state, defaultPlan(state), 6);
  const baseline = option(result, 'baseline');
  for (const id of ['capacity', 'engineering']) {
    const item = option(result, id);
    assert.equal(item.timing.firstBenefitMonth, 4);
    assert.equal(item.timing.lagMonths, 3);
    assert.equal(item.timing.observedFirstCapabilityBenefitMonth, 4);
    const capability = id === 'capacity' ? 'capacityBonus' : 'technology';
    for (let i = 0; i < 3; i += 1) assert.equal(item.months[i].capabilities[capability], baseline.months[i].capabilities[capability]);
    assert.ok(item.months[3].capabilities[capability] > baseline.months[3].capabilities[capability]);
    assert.ok(item.months[0].position.cash < baseline.months[0].position.cash);
  }
  const capacity = option(result, 'capacity');
  close(capacity.months[0].position.fixedAssets - baseline.months[0].position.fixedAssets, 8);
  assert.equal(capacity.months[0].report.income.depreciation, baseline.months[0].report.income.depreciation);
  close(capacity.months[1].report.income.depreciation - baseline.months[1].report.income.depreciation, 8 / 180);
  const short = getInvestmentOptions(state, defaultPlan(state), 3);
  assert.equal(option(short, 'capacity').timing.benefitWithinComparison, false);
  assert.equal(option(short, 'capacity').timing.observedFirstCapabilityBenefitMonth, null);
});

test('training, quality and maintenance improve their capabilities without guaranteeing sales', () => {
  const state = createInitialState();
  const result = getInvestmentOptions(state, defaultPlan(state), 6);
  for (const [id, capability] of [['training', 'skill'], ['quality', 'qualityCapability'], ['maintenance', 'condition']]) {
    const item = option(result, id);
    assert.equal(item.timing.firstBenefitMonth, 1);
    assert.equal(item.timing.observedFirstCapabilityBenefitMonth, 1);
    assert.ok(item.comparison.delta[capability] > 0);
  }
  const upkeep = option(result, 'maintenance');
  assert.ok(upkeep.comparison.delta.capacity > 0);
  assert.equal(upkeep.comparison.delta.retailSales, 0, 'unused additional capacity need not sell more units');
  assert.ok(upkeep.comparison.delta.profit < 0, 'capability is not an automatic financial return');
});

test('early distress truncates every comparison to the same elapsed months', () => {
  const state = createInitialState();
  const plan = { ...defaultPlan(state), marketing: 8, quality: 4.4, training: 2.4, maintenance: 3.5, rd: 5.5, capex: 12 };
  for (const field of PLAN_FIELDS.filter(field => field.key.endsWith('Production'))) plan[field.key] = field.max;
  const result = getInvestmentOptions(state, plan, 12);
  assert.equal(result.truncated, true);
  assert.equal(result.comparisonMonths, 3);
  assert.equal(result.comparisonEndMonth, 3);
  assert.equal(option(result, 'baseline').summary.months, 4);
  assert.equal(option(result, 'capacity').summary.months, 3);
  assert.match(result.comparisonNote, /shortened/);
  const baselineMonths = option(result, 'baseline').months.slice(0, 3);
  for (const item of result.options) {
    assert.equal(item.comparison.selected.months, 3);
    assert.equal(item.comparison.baseline.months, 3);
    assert.deepEqual(item.comparison.monthly.map(month => month.month), [1, 2, 3]);
    close(item.comparison.delta.profit, sum(item.months.slice(0, 3).map(month => month.report.metrics.profit)) - sum(baselineMonths.map(month => month.report.metrics.profit)));
    close(item.comparison.delta.endingCash, item.months[2].position.cash - baselineMonths[2].position.cash);
    assert.equal(item.comparison.selected.minimumCashMonth, 3);
  }
  assert.equal(option(result, 'capacity').timing.benefitWithinComparison, false);
  assert.equal(option(result, 'engineering').costCommitment.plannedIncrement, 18);
  assert.equal(option(result, 'engineering').costCommitment.comparisonIncrement, 4.5);
  assert.ok(result.warnings.some(warning => warning.id === 'financial-distress'));
  const endpoint = getInvestmentOptions(state, plan, 3);
  assert.equal(endpoint.truncated, false);
  assert.ok(endpoint.warnings.some(warning => warning.id === 'financial-distress'), 'failure at the endpoint still needs a warning');
});

test('market share and quality/delivery summaries use the correct units and weighted denominators', () => {
  const state = createInitialState();
  const result = getInvestmentOptions(state, defaultPlan(state), 6);
  const market = getMarketIntelligence(state);
  for (const item of result.options) {
    const summary = item.comparison.selected;
    const products = item.months.flatMap(month => month.report.products);
    close(summary.endingUnitShare, item.months[5].report.metrics.retailSales / market.timeline[5].units);
    close(summary.qualityRate, 1 - sum(products.map(product => product.defects)) / sum(products.map(product => product.assembled)));
    close(summary.serviceLevel, sum(products.map(product => product.deliveries)) / sum(products.map(product => product.dealerOrders)));
    close(summary.endingInventory, item.months[5].position.inventory);
    assert.equal(summary.minimumCash, Math.min(...item.months.map(month => month.position.cash)));
  }
});

test('existing pipeline projects mature from their remaining delay, independently of new spending', () => {
  let state = createInitialState();
  state = forecast(state, { ...defaultPlan(state), capex: 5, rd: 2 }).state;
  state = forecast(state, { ...defaultPlan(state), capex: 0, rd: 0 }).state;
  const result = getInvestmentOptions(state, { ...defaultPlan(state), rd: 0 }, 6);
  assert.equal(state.month, 2);
  assert.equal(result.decisionMonth, 3);
  assert.equal(result.pipeline.length, 2);
  assert.deepEqual(result.pipeline.map(project => project.firstBenefitMonth), [4, 4]);
  assert.deepEqual(result.pipeline.map(project => project.remaining), [2, 2]);
  assert.equal(option(result, 'capacity').timing.firstBenefitMonth, 6);
  assert.equal(option(result, 'engineering').timing.firstBenefitMonth, 6);
});

test('limits clamp increments and disable experiments that cannot change a budget', () => {
  const state = createInitialState();
  const plan = { ...defaultPlan(state), training: 2.8, quality: 5, maintenance: 4, capex: 19, rd: 7 };
  const result = getInvestmentOptions(state, plan, 3);
  close(option(result, 'training').costCommitment.increment, 0.2);
  assert.equal(option(result, 'capacity').costCommitment.increment, 1);
  for (const id of ['quality', 'maintenance', 'engineering']) {
    const item = option(result, id);
    assert.equal(item.enabled, false);
    assert.equal(item.canApply, false);
    assert.match(item.disabledReason, /maximum/);
    assert.equal(item.summary, null);
    assert.equal(item.comparison, null);
    assert.deepEqual(item.planChanges, []);
    assert.deepEqual(item.months, []);
  }
  assert.ok(result.options.every(item => validatePlan(item.plan, state).valid));
});

test('year-end windows and late investments show no campaign benefit beyond month twelve', () => {
  let state = createInitialState();
  for (let i = 0; i < 10; i += 1) state = forecast(state, defaultPlan(state)).state;
  const plan = defaultPlan(state);
  const result = getInvestmentOptions(state, plan, 'year-end');
  assert.equal(result.horizonRequested, 2);
  assert.equal(result.horizonModeled, 2);
  assert.equal(result.comparisonEndMonth, 12);
  assert.equal(option(result, 'capacity').timing.firstBenefitMonth, 14);
  assert.equal(option(result, 'capacity').timing.withinCampaign, false);
  assert.equal(option(result, 'capacity').timing.benefitWithinComparison, false);
  assert.ok(option(result, 'capacity').warnings.some(warning => warning.id === 'benefit-after-window'));
  assert.equal(option(result, 'engineering').timing.observedFirstCapabilityBenefitMonth, null);
  const capped = getInvestmentOptions(state, plan, 6);
  assert.equal(capped.horizonRequested, 6);
  assert.equal(capped.horizonModeled, 2);
  assert.match(capped.comparisonNote, /year-end/);
});

test('forecast experiments do not inspect future seeds and do not mutate live state or plans', () => {
  const state = createInitialState(123, { marketRegime: 'soft' });
  const plan = defaultPlan(state);
  const before = clone({ state, plan });
  const result = getInvestmentOptions(freeze(state), freeze(plan), 6);
  assert.deepEqual({ state, plan }, before);
  const alternateSeed = { ...before.state, seed: 345 };
  assert.deepEqual(getInvestmentOptions(alternateSeed, before.plan, 6), result);
  result.options[1].plan.training = 0;
  assert.equal(plan.training, before.plan.training, 'returned working plans must be independent');
});

test('finished campaigns return no actionable plans and invalid input is rejected clearly', () => {
  let state = createInitialState();
  for (let month = 0; month < 12; month += 1) state = advanceMonth(state, defaultPlan(state)).state;
  const ended = getInvestmentOptions(state, defaultPlan(state), 'year-end');
  assert.equal(ended.available, false);
  assert.deepEqual(ended.options, []);
  assert.equal(ended.decisionMonth, null);
  assert.equal(ended.comparisonEndMonth, null);
  const fresh = createInitialState();
  assert.throws(() => getInvestmentOptions(fresh, { ...defaultPlan(fresh), debtChange: 100 }), /Invalid operating plan/);
  assert.throws(() => getInvestmentOptions(fresh, defaultPlan(fresh), 0), /horizon/);
  assert.throws(() => getInvestmentOptions(fresh, defaultPlan(fresh), 2.5), /horizon/);
  assert.throws(() => getInvestmentOptions({ ...fresh, cash: 999 }, defaultPlan(fresh)), /Invalid simulation state/);
});
