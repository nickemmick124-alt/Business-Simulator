import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  PRODUCTS, PLAN_FIELDS, createInitialState, createReplayInitialState, defaultPlan,
  getMarketOutlook, forecast, advanceMonth, validateState,
} from '../src/simulation.js';
import { getMarketIntelligence, projectBusiness } from '../src/business-intelligence.js';

const clone = value => JSON.parse(JSON.stringify(value));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} vs ${expected}`);

function demandLedPlan(state) {
  const plan = { ...defaultPlan(state), partsBuffer: 5 };
  const report = forecast(state, plan).report;
  for (const flow of report.products) {
    const key = `${flow.id}Production`;
    plan[key] = Math.min(PLAN_FIELDS.find(field => field.key === key).max, Math.max(0, Math.ceil((flow.dealerOrders + 0.15 * flow.expectedDemand - flow.opening.finishedGoods - Math.min(flow.opening.rework, 5)) / 0.96)));
  }
  return plan;
}

test('the original version-one state, forecasts, commits, and complete campaign are byte-for-byte unchanged', () => {
  // Captured from the released 1.0 engine before adding optional cycles.
  let state = createInitialState(4821);
  assert.equal(digest(state), '98f2a3eaa5188005001ae7612e8c5c4e78b5e9587701e093685d2c049b64fe48');
  assert.equal(digest(getMarketOutlook(state)), '3645e9f5bc80de8355254c2e34925c5faf51be8ecf29a863441373f5c0ddf3ad');
  assert.equal(digest(forecast(state, defaultPlan(state))), '494b9b998e0c0b74b5ce039003f93f533d57926e247a16d0244d7a64dc64a00f');
  assert.equal(digest(advanceMonth(state, defaultPlan(state))), 'ae4a8c1d2f8b9b0183002d87192b2104796ff1c965f3a44ce7d08e38f42eb848');
  for (let month = 0; month < 12; month++) state = advanceMonth(state, defaultPlan(state)).state;
  assert.equal(digest(state), 'fabf8c4c26d66a3750882ae737be70896ee458f6f1f280a0f966870ebef9035e');
});

test('cycles are opt-in and a random initial backdrop is resolved once from the chosen seed', () => {
  assert.equal(createInitialState().version, '1.0.0');
  const resolved = new Set();
  for (let seed = 0; seed < 24; seed++) {
    const state = createInitialState(seed, { marketRegime: 'random' });
    assert.equal(state.version, '1.1.0');
    assert.deepEqual(state, createInitialState(seed, { marketRegime: 'random' }));
    assert.deepEqual(state, createInitialState(seed, { marketRegime: state.marketCycle.initialRegime }));
    assert.equal(validateState(state).valid, true);
    resolved.add(state.marketCycle.initialRegime);
  }
  assert.deepEqual(resolved, new Set(['soft', 'flat', 'upswing']));
  for (const options of [null, [], { marketRegime: 'guaranteed-boom' }]) assert.throws(() => createInitialState(1, options));
});

test('soft, flat, and upswing are explicit public annual scenarios rather than prior-year growth claims', () => {
  const outlooks = ['soft', 'flat', 'upswing'].map(marketRegime => getMarketOutlook(createInitialState(7, { marketRegime })));
  assert.ok(outlooks[0].expectedAnnualChange < -0.08);
  assert.equal(outlooks[1].expectedAnnualChange, 0);
  assert.ok(outlooks[2].expectedAnnualChange > 0.08);
  assert.deepEqual(outlooks.map(outlook => outlook.regime), ['soft', 'flat', 'upswing']);
  for (const outlook of outlooks) {
    assert.equal(outlook.expectedMonthChange, null);
    assert.match(outlook.cycleSummary, /flat-scenario reference/);
  }
});

test('public forecasts and market projections never inspect a changed hidden seed, including after observed shocks', () => {
  let state = createInitialState(94, { marketRegime: 'flat' });
  for (let month = 0; month < 4; month++) state = advanceMonth(state, demandLedPlan(state)).state;
  const alternate = { ...clone(state), seed: 202419 };
  const before = clone(state);
  const plan = demandLedPlan(state);
  assert.deepEqual(getMarketOutlook(alternate), getMarketOutlook(state));
  assert.deepEqual(forecast(alternate, plan).report, forecast(state, plan).report);
  assert.deepEqual(getMarketIntelligence(alternate, plan), getMarketIntelligence(state, plan));
  assert.deepEqual(projectBusiness(alternate, plan, 6), projectBusiness(state, plan, 6));
  assert.deepEqual(state, before);
});

test('repeated previews cannot reroll a realized month and exact replay reconstructs legacy and cyclical campaigns', () => {
  for (const options of [{}, { marketRegime: 'soft' }, { marketRegime: 'flat' }, { marketRegime: 'upswing' }]) {
    let state = createInitialState(37, options);
    const initial = clone(state);
    for (let month = 0; month < 5; month++) {
      const plan = demandLedPlan(state);
      const actual = advanceMonth(state, plan);
      for (let preview = 0; preview < 3; preview++) forecast(state, plan);
      assert.deepEqual(advanceMonth(state, plan), actual);
      state = actual.state;
    }
    let replayed = createReplayInitialState(clone(state));
    assert.deepEqual(replayed, initial);
    for (const report of state.history) replayed = advanceMonth(replayed, report.plan).state;
    assert.deepEqual(replayed, state);
  }
});

test('different management decisions face the same exogenous cycle and supplier surprises', () => {
  let first = createInitialState(123, { marketRegime: 'upswing' });
  let second = clone(first);
  for (let month = 0; month < 8; month++) {
    const firstPlan = demandLedPlan(first);
    const secondPlan = { ...demandLedPlan(second), marketing: 2.8, quality: 1.8, tractorPrice: 150 };
    const a = advanceMonth(first, firstPlan);
    const b = advanceMonth(second, secondPlan);
    assert.deepEqual(a.report.marketContext, b.report.marketContext);
    assert.deepEqual(a.state.marketCycle, b.state.marketCycle);
    assert.notDeepEqual(a.report.metrics, b.report.metrics);
    first = a.state;
    second = b.state;
  }
});

test('seeded campaigns have persistent multi-month conditions and both demand and supply surprises', () => {
  const pairs = [];
  const events = new Set();
  const endingPaths = new Set();
  for (let seed = 0; seed < 32; seed++) {
    let state = createInitialState(seed, { marketRegime: 'flat' });
    let prior = null;
    for (let month = 0; month < 12; month++) {
      const result = advanceMonth(state, demandLedPlan(state));
      const deviation = result.state.marketCycle.agricultureIndex - 1;
      if (prior !== null) pairs.push([prior, deviation]);
      prior = deviation;
      for (const event of result.report.marketContext.events) events.add(event.title);
      assert.equal(validateState(result.state).valid, true);
      state = result.state;
    }
    endingPaths.add(state.marketCycle.agricultureIndex);
  }
  const meanX = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  const covariance = pairs.reduce((sum, pair) => sum + (pair[0] - meanX) * (pair[1] - meanY), 0);
  const varianceX = pairs.reduce((sum, pair) => sum + (pair[0] - meanX) ** 2, 0);
  const varianceY = pairs.reduce((sum, pair) => sum + (pair[1] - meanY) ** 2, 0);
  assert.ok(covariance / Math.sqrt(varianceX * varianceY) > 0.6, 'conditions should carry across months rather than flip independently');
  assert.ok(endingPaths.size > 20);
  assert.ok(events.has('Equipment buyers defer replacement'));
  assert.ok(events.has('Replacement demand accelerates'));
  assert.ok(events.has('Controller supplier disruption'));
});

test('realized market conditions revise the next public outlook without presenting surprises in previews', () => {
  let foundDownturn = false;
  for (let seed = 0; seed < 80 && !foundDownturn; seed++) {
    const initial = createInitialState(seed, { marketRegime: 'flat' });
    const projected = forecast(initial, defaultPlan(initial));
    assert.equal(projected.report.marketContext.demandSurprise, 0);
    assert.equal(projected.report.marketContext.supplySurprise, 0);
    assert.deepEqual(projected.report.marketContext.events, []);
    const actual = advanceMonth(initial, defaultPlan(initial));
    if (actual.report.marketContext.demandSurprise < -0.1) {
      const revised = getMarketOutlook(actual.state);
      const unobserved = getMarketOutlook({ ...initial, month: 1 });
      assert.ok(revised.agriculture < unobserved.agriculture);
      assert.ok(revised.expectedAnnualChange < unobserved.expectedAnnualChange);
      foundDownturn = true;
    }
  }
  assert.ok(foundDownturn);
});

test('actual share uses the observed industry denominator and future market totals remain seed-independent', () => {
  const initial = createInitialState(2, { marketRegime: 'soft' });
  const actual = advanceMonth(initial, defaultPlan(initial));
  const intelligence = getMarketIntelligence(actual.state, demandLedPlan(actual.state));
  const factors = actual.report.marketContext.realized;
  const expectedIndustryUnits = Math.round(158 / 0.20 * factors.agriculture) + Math.round(57 / 0.18 * factors.agriculture) + Math.round(149 / 0.16 * factors.construction);
  assert.equal(intelligence.current.marketUnits, expectedIndustryUnits);
  near(intelligence.current.unitShare, actual.report.metrics.retailSales / expectedIndustryUnits, 'observed unit share');
  assert.equal(intelligence.timeline[0].units, expectedIndustryUnits);
  const changedDecision = { ...demandLedPlan(actual.state), marketing: 7, tractorPrice: 180 };
  assert.deepEqual(getMarketIntelligence(actual.state, changedDecision).timeline, intelligence.timeline);
  assert.deepEqual(getMarketIntelligence({ ...actual.state, seed: 9922 }).timeline, intelligence.timeline);
  const oldMonth = intelligence.timeline[0];
  const next = advanceMonth(actual.state, demandLedPlan(actual.state));
  assert.deepEqual(getMarketIntelligence(next.state).timeline[0], oldMonth, 'later observations must not rewrite past industry totals');
});

test('cycle-aware projections carry public expectations and keep all three statements reconciled', () => {
  let state = createInitialState(5, { marketRegime: 'upswing' });
  state = advanceMonth(state, demandLedPlan(state)).state;
  const before = clone(state);
  const projection = projectBusiness(state, demandLedPlan(state), 5);
  const market = getMarketIntelligence(state);
  for (const month of projection.months) {
    near(month.balanceSheet.assets, month.balanceSheet.liabilitiesAndEquity, 'projected balance sheet');
    near(month.report.cashFlow.opening + month.report.cashFlow.cashChange, month.report.cashFlow.closing, 'projected cash');
    near(month.report.marketContext.demandSurprise, 0, 'no secret projected demand shock');
    near(month.changes.market, market.timeline[month.month - 1].marketChange, 'consistent public industry path');
  }
  assert.deepEqual(state, before);
});

test('invalid cycle metadata and malformed realized market reports are rejected before rendering', () => {
  const fresh = createInitialState(2, { marketRegime: 'flat' });
  const actual = advanceMonth(fresh, defaultPlan(fresh)).state;
  const invalidInitial = [
    state => { delete state.marketCycle; },
    state => { state.marketCycle.initialRegime = 'random'; },
    state => { state.marketCycle.observedMonth = 1; },
    state => { state.marketCycle.agricultureIndex = Infinity; },
    state => { state.marketCycle.agricultureIndex = 1.1; },
  ];
  for (const corrupt of invalidInitial) { const state = clone(fresh); corrupt(state); assert.equal(validateState(state).valid, false); }
  const invalidReport = [
    state => { delete state.history[0].marketContext; },
    state => { state.history[0].marketContext.realized.agriculture = -1; },
    state => { state.history[0].marketContext.realized = null; },
    state => { state.history[0].marketContext.events = [null]; },
    state => { state.history[0].marketContext.initialRegime = 'upswing'; },
    state => { state.marketCycle.supplyIndex = 1.8; },
  ];
  for (const corrupt of invalidReport) { const state = clone(actual); corrupt(state); assert.equal(validateState(state).valid, false); assert.throws(() => createReplayInitialState(state)); }
});

test('demand-led decisions keep soft, flat, and upswing test campaigns playable through twelve months', () => {
  for (const marketRegime of ['soft', 'flat', 'upswing']) {
    for (const seed of [0, 1, 7, 37, 4821]) {
      let state = createInitialState(seed, { marketRegime });
      for (let month = 0; month < 12; month++) {
        const result = advanceMonth(state, demandLedPlan(state));
        assert.equal(validateState(result.state).valid, true);
        for (const product of PRODUCTS) assert.ok(result.state.products[product.id].finishedGoods >= 0);
        near(result.report.reconciliation.balanceSheet, 0, 'actual balance sheet');
        near(result.report.reconciliation.inventory, 0, 'actual inventory');
        state = result.state;
      }
      assert.equal(state.status, 'completed');
      assert.ok(state.cash > 0);
    }
  }
});
