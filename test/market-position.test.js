import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, createInitialState, defaultPlan, advanceMonth, forecast } from '../src/simulation.js';
import { getMarketIntelligence } from '../src/business-intelligence.js';
import { getMarketPosition } from '../src/market-position.js';

const clone = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `Expected ${expected}, received ${actual}`);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function after(months, options) {
  let state = createInitialState(4821, options);
  for (let month = 0; month < months; month += 1) state = advanceMonth(state, defaultPlan(state)).state;
  return state;
}

test('new campaign has no observed share, change, or survey but can project selected-plan share', () => {
  const state = createInitialState();
  const position = getMarketPosition(state, defaultPlan(state));
  assert.deepEqual(position.aggregate.history, []);
  for (const series of [position.aggregate, ...position.products]) {
    assert.equal(series.current, null);
    assert.equal(series.previous, null);
    assert.equal(series.changePP, null);
    assert.equal(series.marketGrowth, null);
    assert.equal(series.retailGrowth, null);
    assert.equal(series.next.kind, 'projection');
    assert.equal(series.next.month, 1);
    assert.equal(series.next.changePP, null);
    assert.equal(series.next.retailGrowth, null);
    close(series.next.expectedUnitShare, series.next.expectedRetailSales / series.next.marketUnits);
  }
  for (const product of position.products) {
    assert.equal(product.perception.current.firstPassQuality, null);
    assert.equal(product.perception.current.retailAvailability, null);
    assert.equal(product.perception.current.dealerFulfillment, null);
    assert.match(product.perception.basis, /not customer surveys/);
    assert.equal(product.perception.current.technologyIndex, 1);
    assert.equal(product.perception.current.reputationIndex, 0.94);
  }
});

test('first completed month reports observed share without an invented prior comparison', () => {
  const state = after(1);
  const position = getMarketPosition(state, defaultPlan(state));
  const market = getMarketIntelligence(state);
  assert.equal(position.aggregate.history.length, 1);
  assert.equal(position.aggregate.current.retailSales, state.history[0].metrics.retailSales);
  assert.notEqual(position.aggregate.current.retailSales, state.history[0].metrics.deliveries);
  close(position.aggregate.current.unitShare, market.current.unitShare);
  for (const series of [position.aggregate, ...position.products]) {
    assert.equal(series.current.month, 1);
    assert.equal(series.current.kind, 'actual');
    assert.equal(series.previous, null);
    assert.equal(series.changePP, null);
    assert.equal(series.marketGrowth, null);
    assert.equal(series.retailGrowth, null);
    assert.equal(series.growthGap, null);
    close(series.next.changePP, series.next.expectedUnitShare - series.current.unitShare);
  }
});

test('actual share history and growth use each completed month’s exact industry denominator', () => {
  const state = after(5, { marketRegime: 'upswing' });
  const position = getMarketPosition(state, defaultPlan(state));
  const market = getMarketIntelligence(state);
  assert.deepEqual(position.annual, market.annual);
  for (const [index, row] of position.aggregate.history.entries()) {
    assert.equal(row.marketUnits, market.timeline[index].units);
    assert.equal(row.retailSales, state.history[index].metrics.retailSales);
    close(row.unitShare, row.retailSales / row.marketUnits);
    if (index) {
      const prior = position.aggregate.history[index - 1];
      close(row.changePP, row.unitShare - prior.unitShare);
      close(row.marketGrowth, row.marketUnits / prior.marketUnits - 1);
      close(row.retailGrowth, row.retailSales / prior.retailSales - 1);
      close(row.growthGap, row.retailGrowth - row.marketGrowth);
    }
  }
  for (const product of position.products) {
    const definition = PRODUCTS.find(item => item.id === product.id);
    close(product.annual.value, product.annual.units * definition.basePrice / 1000);
    for (const row of product.history) {
      const marketRow = market.timeline[row.month - 1].products.find(item => item.id === product.id);
      const actual = state.history[row.month - 1].products.find(item => item.id === product.id);
      assert.equal(row.marketUnits, marketRow.units);
      close(row.unitShare, actual.retailSales / marketRow.units);
      assert.equal(row.unmetRequests, actual.lostSales);
      assert.equal(row.dealerOrders, actual.dealerOrders);
      close(row.dealerFulfillment, actual.deliveries / actual.dealerOrders);
      close(row.retailAvailability, actual.retailSales / actual.demand);
    }
    close(product.changePP, product.current.unitShare - product.previous.unitShare);
  }
});

test('share deterioration is negative even when the market grows, and no-sales growth stays finite', () => {
  let state = createInitialState();
  for (let month = 0; month < 5; month += 1) {
    state = advanceMonth(state, { ...defaultPlan(state), tractorProduction: 0, harvesterProduction: 0, loaderProduction: 0 }).state;
  }
  const position = getMarketPosition(state, defaultPlan(state));
  const second = position.aggregate.history[1];
  assert.ok(second.changePP < 0);
  assert.ok(second.marketGrowth > 0);
  assert.ok(second.retailGrowth < 0);
  assert.equal(position.aggregate.current.unitShare, 0);
  assert.equal(position.aggregate.current.retailGrowth, null);
  assert.equal(position.aggregate.current.growthGap, null);
  assert.equal(position.aggregate.next.retailGrowth, null);
  for (const product of position.products) {
    assert.equal(product.perception.current.firstPassQuality, null, 'no assembly cannot create a measured first-pass rate');
    assert.equal(product.perception.current.retailAvailability, 0);
  }
});

test('revising a cyclical public outlook never rewrites an already observed share or market denominator', () => {
  let state = after(2, { marketRegime: 'soft' });
  const previous = getMarketPosition(state, defaultPlan(state));
  for (let month = 0; month < 3; month += 1) state = advanceMonth(state, defaultPlan(state)).state;
  const revised = getMarketPosition(state, defaultPlan(state));
  assert.notEqual(revised.annual.units, previous.annual.units, 'fixture should revise the future public outlook');
  assert.deepEqual(revised.aggregate.history.slice(0, 2), previous.aggregate.history);
  for (const product of previous.products) {
    assert.deepEqual(revised.products.find(item => item.id === product.id).history.slice(0, 2), product.history);
  }
});

test('demand-factor explanation exactly matches forecast and uses opening reputation with commissioned technology', () => {
  let state = createInitialState();
  for (let month = 0; month < 3; month += 1) state = advanceMonth(state, { ...defaultPlan(state), rd: 7 }).state;
  const plan = { ...defaultPlan(state), tractorPrice: 156, marketing: 3.1, financingApr: 5.25, quality: 4.2 };
  const predicted = forecast(state, plan);
  const position = getMarketPosition(state, plan);
  for (const product of position.products) {
    const source = state.products[product.id];
    const expected = predicted.report.products.find(item => item.id === product.id);
    const projected = predicted.state.products[product.id];
    const factors = product.perception.next.demandFactors;
    const definition = PRODUCTS.find(item => item.id === product.id);
    assert.equal(product.perception.current.reputationIndex, source.reputation);
    assert.equal(product.perception.current.technologyIndex, source.technology);
    assert.equal(factors.reputation, source.reputation);
    assert.equal(factors.technology, projected.technology);
    assert.notEqual(factors.technology, source.technology, 'completed engineering changes capability before demand');
    assert.equal(product.perception.next.openingReputationIndex, source.reputation);
    assert.equal(product.perception.next.closingReputationIndex, projected.reputation);
    assert.notEqual(source.reputation, projected.reputation, 'closing reputation is not the same-month demand input');
    assert.equal(factors.price, Math.pow(definition.basePrice / plan[`${product.id}Price`], 1.65));
    assert.equal(factors.expectedDemand, expected.expectedDemand);
    assert.equal(Math.round(factors.unroundedDemand), expected.expectedDemand);
    assert.equal(product.next.expectedDemand, expected.expectedDemand);
    assert.equal(product.next.expectedRetailSales, expected.retailSales);
    assert.equal(product.perception.next.fleetReliabilityIndex, projected.warrantyQuality);
  }
});

test('process quality, fleet reliability, observed first-pass quality, and retail availability remain distinct', () => {
  const state = after(2);
  const position = getMarketPosition(state, defaultPlan(state));
  for (const product of position.products) {
    const capability = state.products[product.id];
    const latest = state.history.at(-1).products.find(item => item.id === product.id);
    const actual = product.perception.current;
    assert.equal(actual.fleetReliabilityIndex, capability.warrantyQuality);
    assert.equal(actual.processQualityIndex, capability.quality);
    assert.equal(actual.firstPassQuality, latest.qualityRate);
    assert.equal(actual.retailAvailability, latest.retailSales / latest.demand);
    assert.equal(actual.price, capability.lastPrice);
    assert.notEqual(actual.fleetReliabilityIndex, actual.firstPassQuality);
    assert.equal(Object.hasOwn(actual, 'customerSatisfaction'), false);
    assert.equal(Object.hasOwn(product, 'competitorShare'), false);
  }
});

test('public competitive pressure is a demand input rather than an invented competitor rating', () => {
  const state = after(6);
  const position = getMarketPosition(state, defaultPlan(state));
  assert.equal(position.publicOutlook.competitorPressure, 0.96);
  for (const product of position.products) {
    assert.equal(product.perception.next.demandFactors.competition, 0.96);
    assert.equal(Object.hasOwn(product.perception, 'competitorSatisfaction'), false);
  }
  assert.match(position.caveats.join(' '), /not a competitor rating/);
});

test('invalid or absent plans preserve actual history, current model indices, and public market data', () => {
  const state = after(2, { marketRegime: 'flat' });
  const plan = defaultPlan(state);
  const ordinary = getMarketPosition(state, plan);
  for (const invalid of [undefined, null, { ...plan, tractorPrice: NaN }, { ...plan, debtChange: 1000 }]) {
    const position = getMarketPosition(state, invalid);
    assert.deepEqual(position.annual, ordinary.annual);
    assert.deepEqual(position.publicOutlook, ordinary.publicOutlook);
    assert.deepEqual(position.aggregate.current, ordinary.aggregate.current);
    assert.deepEqual(position.aggregate.history, ordinary.aggregate.history);
    assert.equal(position.aggregate.next, null);
    assert.equal(typeof position.forecastError, invalid ? 'string' : 'object');
    for (const product of position.products) {
      assert.deepEqual(product.perception.current, ordinary.products.find(item => item.id === product.id).perception.current);
      assert.equal(product.perception.next, null);
    }
  }
});

test('terminal campaigns retain the complete observed record and do not attempt another forecast', () => {
  const state = after(12);
  assert.equal(state.status, 'completed');
  const position = getMarketPosition(state, { impossiblePlan: true });
  assert.equal(position.aggregate.history.length, 12);
  assert.equal(position.aggregate.current.month, 12);
  assert.equal(position.aggregate.previous.month, 11);
  assert.equal(position.aggregate.next, null);
  assert.equal(position.publicOutlook, null);
  assert.equal(position.forecastError, null);
  for (const product of position.products) assert.equal(product.perception.next, null);
});

test('projection reports cannot masquerade as completed actual share history', () => {
  const actual = after(2);
  const projected = forecast(actual, defaultPlan(actual)).state;
  const position = getMarketPosition(projected, defaultPlan(projected));
  assert.equal(position.aggregate.history.length, 2);
  assert.equal(position.aggregate.current.month, 2);
  assert.ok(position.aggregate.history.every(row => row.kind === 'actual'));
});

test('diagnostics do not mutate state or decisions and never read hidden future random outcomes', () => {
  const state = after(3, { marketRegime: 'upswing' });
  const plan = defaultPlan(state);
  const before = clone({ state, plan });
  const alternativeSeed = { ...clone(state), seed: 968271 };
  const result = getMarketPosition(freeze(state), freeze(plan));
  assert.deepEqual(getMarketPosition(alternativeSeed, plan), result);
  assert.deepEqual({ state, plan }, before);
  assert.throws(() => getMarketPosition({ ...clone(state), month: 13 }, plan), /Invalid simulation state/);
});

test('executive demand decomposition includes dealer service, difficulty and rival progress exactly once', () => {
  for (const difficulty of ['easy', 'medium', 'difficult']) {
    let state = createInitialState(4821, { difficulty, marketRegime: 'flat', campaignMonths: 36 });
    for (let month = 0; month < 3; month += 1) state = advanceMonth(state, { ...defaultPlan(state), rd: 6, dealerSupport: 2 }).state;
    const plan = { ...defaultPlan(state), dealerSupport: 2.5, supplierSupport: 1.5, tractorPrice: 152 };
    const before = clone({ state, plan });
    const projected = forecast(state, plan);
    const position = getMarketPosition(state, plan);
    for (const product of position.products) {
      const factors = product.perception.next.demandFactors;
      close(factors.dealerService, 1 + Math.log1p(plan.dealerSupport) * 0.045);
      close(factors.difficulty, { easy: 1.04, medium: 0.97, difficult: 0.90 }[difficulty]);
      assert.ok(factors.rivals < 1 && factors.rivals > 0.82);
      assert.equal(factors.reputation, state.products[product.id].reputation);
      assert.equal(factors.technology, projected.state.products[product.id].technology);
      assert.equal(Math.round(factors.unroundedDemand), projected.report.products.find(row => row.id === product.id).expectedDemand);
      assert.match(product.perception.explanation.join(' '), /technology is counted once/);
    }
    assert.match(position.caveats.join(' '), /not observed rival sales/);
    assert.deepEqual({ state, plan }, before);
    assert.deepEqual(getMarketPosition({ ...state, seed: 1772 }, plan), position, 'no demand explanation can reveal future random draws');
  }
});

test('legacy demand-factor shapes remain exact when executive campaign levers are absent', () => {
  for (const options of [{}, { marketRegime: 'flat' }, { marketRegime: 'flat', campaignMonths: 36 }]) {
    const state = createInitialState(4821, options);
    const position = getMarketPosition(state, defaultPlan(state));
    for (const product of position.products) {
      assert.equal(Object.hasOwn(product.perception.next.demandFactors, 'dealerService'), false);
      assert.equal(Object.hasOwn(product.perception.next.demandFactors, 'difficulty'), false);
      assert.equal(Object.hasOwn(product.perception.next.demandFactors, 'rivals'), false);
      assert.equal(Math.round(product.perception.next.demandFactors.unroundedDemand), product.perception.next.demandFactors.expectedDemand);
    }
  }
});
