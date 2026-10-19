import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  PLAN_FIELDS, createInitialState, createReplayInitialState, defaultPlan, getMarketOutlook,
  forecast, advanceMonth, validateState, validatePlan, balanceSheet, getCampaignOutcome,
} from '../src/simulation.js';
import { campaignLength, calendarMonth, campaignYear, monthLabel, campaignYearEnd, isCyclicalState } from '../src/campaign-calendar.js';
import { exportSave, parseSave } from '../src/persistence.js';

const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);

function demandLedPlan(state) {
  const plan = { ...defaultPlan(state), partsBuffer: 5 };
  for (const flow of forecast(state, plan).report.products) {
    const key = `${flow.id}Production`;
    plan[key] = Math.min(PLAN_FIELDS.find(field => field.key === key).max, Math.max(0, Math.ceil((flow.dealerOrders + 0.15 * flow.expectedDemand - flow.opening.finishedGoods - Math.min(flow.opening.rework, 5)) / 0.96)));
  }
  return plan;
}

function throughMonth(state, end, makePlan = demandLedPlan) {
  while (state.month < end) state = advanceMonth(state, makePlan(state)).state;
  return state;
}

test('released 1.1 initial state, public outlook, forecast, actual, and year are byte-for-byte unchanged', () => {
  let state = createInitialState(4821, { marketRegime: 'flat' });
  assert.equal(digest(state), '3103dd8e11f548e8e8862a93bf6f1f7161433423c342964c2b3247af6423d34c');
  assert.equal(digest(getMarketOutlook(state)), '8c475277408c7af693a364eda8439ac36417f5231d0b3697e51a08d99414df87');
  assert.equal(digest(forecast(state, defaultPlan(state))), '165b22801573731c5e29bdcf118079de14a5f1cd5da78cfc33110ce3d31e56e7');
  assert.equal(digest(advanceMonth(state, defaultPlan(state))), 'e0f9432b79c3cd38d96611ddd7abd579ff9b6bbc6aecee34ca4f59eeddfa0c47');
  state = throughMonth(state, 12, defaultPlan);
  assert.equal(digest(state), '2031f57f713d53a2c43a72e1639317feb9b69cdeb61660270feb3cc03e13c6e3');
});

test('three-year campaigns are explicit, retain their length on replay, and reject unsupported lengths', () => {
  const state = createInitialState(12, { campaignMonths: 36 });
  assert.equal(state.version, '1.2.0');
  assert.equal(state.campaignMonths, 36);
  assert.deepEqual(state, createInitialState(12, { campaignMonths: 36, marketRegime: 'random' }));
  assert.deepEqual(state, createReplayInitialState(state));
  assert.equal(validateState(state).valid, true);
  assert.equal(campaignLength(state), 36);
  assert.equal(isCyclicalState(state), true);
  for (const options of [{}, { campaignMonths: 12 }, { marketRegime: 'flat' }]) {
    assert.equal(campaignLength(createInitialState(12, options)), 12);
  }
  for (const length of [0, 1, 24, 35, 37, -36, '36', null, Infinity]) {
    assert.throws(() => createInitialState(12, { campaignMonths: length }), /Campaign length/);
  }
});

test('the shared calendar distinguishes all three years and upcoming year-end boundaries', () => {
  const state = createInitialState(1, { campaignMonths: 36 });
  assert.equal(calendarMonth(0), 1);
  assert.equal(campaignYear(0), 1);
  assert.equal(calendarMonth(12), 12);
  assert.equal(calendarMonth(13), 1);
  assert.equal(campaignYear(24), 2);
  assert.equal(campaignYear(25), 3);
  assert.equal(monthLabel(13), 'January · Year 2');
  assert.equal(monthLabel(36, { short: true }), 'Dec · Year 3');
  assert.equal(monthLabel(25, { includeYear: false }), 'January');
  assert.equal(monthLabel(0), 'Opening');
  for (const invalid of [null, undefined, NaN, Infinity, -1]) assert.equal(monthLabel(invalid), '—');
  for (const [month, expected] of [[0, 12], [11, 12], [12, 24], [23, 24], [24, 36], [36, 36]]) {
    assert.equal(campaignYearEnd({ ...state, month }), expected);
  }
  assert.equal(campaignYearEnd({ ...createInitialState(), month: 12 }), 12);
});

test('all three years retain continuous financial books, operating stocks, and customer loan cohorts', () => {
  for (const marketRegime of ['soft', 'flat', 'upswing']) {
    let state = createInitialState(4821, { marketRegime, campaignMonths: 36 });
    for (let month = 1; month <= 36; month++) {
      const opening = clone(state);
      const { state: next, report } = advanceMonth(state, demandLedPlan(state));
      assert.equal(validateState(next).valid, true);
      assert.deepEqual(report.openingBalanceSheet, balanceSheet(opening));
      for (const amount of Object.values(report.reconciliation)) near(amount, 0);
      near(next.equity, opening.equity + report.income.profit);
      near(next.loanBook, opening.loanBook + report.financing.newLending - report.financing.principalCollections - report.financing.creditLosses);
      assert.equal(report.outlook.month, month);
      for (const flow of report.products) {
        for (const key of Object.keys(flow.opening)) assert.equal(flow.opening[key], opening.products[flow.id][key]);
      }
      assert.equal(next.status, month === 36 ? 'completed' : 'active');
      assert.equal(getCampaignOutcome(next).complete, month === 36);
      state = next;
    }
    assert.equal(state.history.length, 36);
    assert.ok(state.cash > 0);
    assert.equal(validatePlan(defaultPlan(state), state).valid, false);
    assert.throws(() => advanceMonth(state, defaultPlan(state)), /campaign is complete/);
  }
});

test('capacity and engineering committed in November mature in February of the following year', () => {
  let state = throughMonth(createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36 }), 10, current => ({ ...demandLedPlan(current), rd: 0 }));
  state = advanceMonth(state, { ...demandLedPlan(state), capex: 8, rd: 2 }).state;
  assert.deepEqual(state.capexPipeline, [{ amount: 8, remaining: 3 }]);
  for (let month = 12; month <= 13; month++) {
    state = advanceMonth(state, { ...demandLedPlan(state), capex: 0, rd: 0 }).state;
    assert.equal(state.capacityBonus, 0);
    assert.equal(state.capexPipeline[0].remaining, 14 - month);
    assert.equal(state.rdPipeline[0].remaining, 14 - month);
    assert.equal(state.status, 'active');
  }
  const technologyBefore = state.products.tractor.technology;
  state = advanceMonth(state, { ...demandLedPlan(state), capex: 0, rd: 0 }).state;
  assert.equal(state.month, 14);
  near(state.capacityBonus, 8 * 0.004);
  near(state.products.tractor.technology, technologyBefore + 2 * 0.007 - 0.0025);
  assert.deepEqual(state.capexPipeline, []);
  assert.deepEqual(state.rdPipeline, []);
});

test('year-two and year-three forecasts use observations but cannot see a hidden future seed', () => {
  let state = createInitialState(94, { marketRegime: 'soft', campaignMonths: 36 });
  for (const month of [12, 25]) {
    state = throughMonth(state, month);
    const before = clone(state);
    const alternate = { ...clone(state), seed: 202419 };
    const plan = demandLedPlan(state);
    assert.deepEqual(getMarketOutlook(alternate), getMarketOutlook(state));
    assert.deepEqual(forecast(alternate, plan).report, forecast(state, plan).report);
    assert.deepEqual(state, before);
    assert.equal(forecast(state, plan).report.marketContext.demandSurprise, 0);
  }
});

test('seasons recur without resetting supply recovery or replaying first-year random shocks', () => {
  const initial = createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36 });
  const first = advanceMonth(initial, demandLedPlan(initial));
  const yearEnd = throughMonth(first.state, 12);
  const january = advanceMonth(yearEnd, demandLedPlan(yearEnd));
  assert.equal(january.report.outlook.month, 13);
  assert.notDeepEqual(january.report.marketContext.realized, first.report.marketContext.realized);
  // A flat, unobserved public reference repeats seasonality, with startup supply
  // restrictions applied only in the opening months of the whole campaign.
  const base = getMarketOutlook(initial);
  const future = getMarketOutlook({ ...initial, month: 12 });
  assert.equal(base.agriculture, future.agriculture);
  assert.equal(base.construction, future.construction);
  assert.equal(base.controllerSupply, 0.79);
  assert.equal(future.controllerSupply, 0.98);
  assert.equal(future.competitorPressure, 0.96);
});

test('annual industry outlook changes to the upcoming calendar year and retains historical actual factors', () => {
  let state = throughMonth(createInitialState(37, { marketRegime: 'upswing', campaignMonths: 36 }), 12);
  const industryUnits = factors => Math.round(158 / 0.20 * factors.agriculture) + Math.round(57 / 0.18 * factors.agriculture) + Math.round(149 / 0.16 * factors.construction);
  const reference = createInitialState(37, { marketRegime: 'flat', campaignMonths: 36 });
  let annual = 0, flat = 0;
  for (let month = 13; month <= 24; month++) {
    annual += industryUnits(getMarketOutlook({ ...state, month: month - 1 }));
    flat += industryUnits(getMarketOutlook({ ...reference, month: month - 1 }));
  }
  near(getMarketOutlook(state).expectedAnnualChange, annual / flat - 1);
  const firstActual = clone(state.history[0].marketContext.realized);
  state = throughMonth(state, 25);
  const oldOutlook = getMarketOutlook({ ...state, month: 0 });
  for (const key of ['agriculture', 'construction', 'controllerSupply']) assert.equal(oldOutlook[key], firstActual[key]);
});

test('multi-year plans face the same exogenous shocks and replay reconstructs exact state after a year boundary', () => {
  let first = createInitialState(123, { marketRegime: 'upswing', campaignMonths: 36 });
  let second = clone(first);
  for (let month = 1; month <= 25; month++) {
    const a = advanceMonth(first, demandLedPlan(first));
    const b = advanceMonth(second, { ...demandLedPlan(second), marketing: 2.8, quality: 1.8, tractorPrice: 150 });
    assert.deepEqual(a.report.marketContext, b.report.marketContext);
    assert.deepEqual(a.state.marketCycle, b.state.marketCycle);
    first = a.state;
    second = b.state;
  }
  let replayed = createReplayInitialState(first);
  for (const report of first.history) replayed = advanceMonth(replayed, report.plan).state;
  assert.deepEqual(replayed, first);
});

test('multi-year saves round-trip at year boundaries and malformed lengths/statuses cannot extend legacy saves', () => {
  const original = throughMonth(createInitialState(4821, { campaignMonths: 36, marketRegime: 'flat' }), 12);
  const saved = parseSave(exportSave({ state: original, plan: defaultPlan(original) }));
  assert.deepEqual(saved.state, original);
  assert.equal(saved.state.status, 'active');
  for (const change of [
    state => { state.campaignMonths = 12; },
    state => { delete state.campaignMonths; },
    state => { state.status = 'completed'; },
    state => { state.month = 37; },
  ]) {
    const state = clone(original); change(state);
    assert.equal(validateState(state).valid, false);
    assert.throws(() => exportSave({ state, plan: defaultPlan(state) }));
  }
  const legacy = throughMonth(createInitialState(4821), 12);
  assert.equal(legacy.status, 'completed');
  assert.equal(validateState({ ...legacy, campaignMonths: 36 }).valid, false);
  assert.equal(validateState({ ...legacy, status: 'active' }).valid, false);
  assert.throws(() => advanceMonth(legacy, defaultPlan(legacy)), /campaign is complete/);
});

test('declared long-run scenarios normalize without unbounded growth or negative demand factors', () => {
  for (const marketRegime of ['soft', 'flat', 'upswing']) {
    const initial = createInitialState(1, { marketRegime, campaignMonths: 36 });
    for (let month = 1; month <= 36; month++) {
      const outlook = getMarketOutlook({ ...initial, month: month - 1 });
      assert.equal(outlook.month, month);
      for (const key of ['agriculture', 'construction', 'controllerSupply']) assert.ok(outlook[key] > 0.5 && outlook[key] < 1.5);
    }
    const yearTwo = getMarketOutlook({ ...initial, month: 12 });
    const yearThree = getMarketOutlook({ ...initial, month: 24 });
    assert.ok(Math.abs(yearThree.expectedAnnualChange) <= Math.abs(yearTwo.expectedAnnualChange));
  }
});

test('the multi-year mandate still ends when two negative-cash closes occur after the first year', () => {
  let state = throughMonth(createInitialState(41, { campaignMonths: 36, marketRegime: 'flat' }), 12);
  const negativeMonths = [];
  while (state.status === 'active') {
    const plan = Object.fromEntries(PLAN_FIELDS.map(field => [field.key, field.max]));
    plan.debtChange = 0;
    state = advanceMonth(state, plan).state;
    if (state.cash < 0) negativeMonths.push(state.month);
  }
  assert.equal(state.status, 'distressed');
  assert.ok(state.month > 12 && state.month < 36);
  assert.equal(negativeMonths.at(-1) - negativeMonths.at(-2), 1);
  assert.equal(validateState(state).valid, true);
  assert.equal(getCampaignOutcome(state).complete, true);
  assert.throws(() => advanceMonth(state, defaultPlan(state)), /campaign is complete/);
});
