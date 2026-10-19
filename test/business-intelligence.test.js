import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS, PLAN_FIELDS, createInitialState, defaultPlan, advanceMonth,
  forecast, balanceSheet, validateState,
} from '../src/simulation.js';
import { exportSave, parseSave } from '../src/persistence.js';
import {
  getMarketIntelligence, getFinancialPosition, projectBusiness,
} from '../src/business-intelligence.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const clone = value => JSON.parse(JSON.stringify(value));

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function close(actual, expected, label, tolerance = 1e-7) {
  assert.ok(Number.isFinite(actual), `${label}: ${actual} must be finite`);
  assert.ok(Number.isFinite(expected), `${label}: ${expected} must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

function growth(current, previous) {
  return previous === 0 ? null : (current - previous) / previous;
}

function stateAfter(months, seed = 4821) {
  let state = createInitialState(seed);
  for (let month = 0; month < months; month += 1) {
    state = advanceMonth(state, defaultPlan(state)).state;
  }
  return state;
}

test('addressable market is a twelve-month unit market valued at fixed product reference prices', () => {
  const state = createInitialState();
  const market = getMarketIntelligence(state, defaultPlan(state));
  assert.equal(market.timeline.length, 12);
  assert.equal(market.products.length, PRODUCTS.length);
  assert.deepEqual(market.timeline.map(row => row.month), Array.from({ length: 12 }, (_, i) => i + 1));
  close(market.annual.units, sum(market.timeline.map(row => row.units)), 'annual units sum all months');
  close(market.annual.value, sum(market.timeline.map(row => row.value)), 'annual value sums all months');
  close(market.annual.units, sum(market.products.map(row => row.annualUnits)), 'annual units sum products');
  close(market.annual.value, sum(market.products.map(row => row.annualValue)), 'annual value sums products');
  assert.ok(new Set(market.timeline.map(row => row.units)).size > 1, 'seasonal months must not be a flat annualized run rate');
  for (const month of market.timeline) {
    close(month.units, sum(month.products.map(product => product.units)), 'monthly units sum products');
    close(month.value, sum(month.products.map(product => product.value)), 'monthly market value sums products');
    for (const product of month.products) {
      const definition = PRODUCTS.find(item => item.id === product.id);
      assert.ok(definition, 'market contains a known playable product');
      assert.ok(Number.isInteger(product.units) && product.units > definition.baseDemand, 'market includes demand served by competitors');
      close(product.value, product.units * definition.basePrice / 1000, `${product.id}: units times reference list price in millions`);
    }
  }
});

test('changing company price, output, and spending changes demand without resizing the market denominator', () => {
  const state = createInitialState();
  const original = defaultPlan(state);
  const aggressive = { ...original, marketing: 8, financingApr: 2, quality: 5 };
  for (const field of PLAN_FIELDS.filter(field => /Price$|Production$/.test(field.key))) aggressive[field.key] = field.min;
  const ordinary = getMarketIntelligence(state, original);
  const alternative = getMarketIntelligence(state, aggressive);
  assert.deepEqual(alternative.annual, ordinary.annual);
  assert.deepEqual(alternative.timeline, ordinary.timeline);
  assert.notEqual(alternative.next.expectedDemand, ordinary.next.expectedDemand, 'commercial choices should still affect customer demand');
  for (const product of alternative.products) {
    const before = ordinary.products.find(item => item.id === product.id);
    assert.equal(product.annualUnits, before.annualUnits);
    assert.equal(product.annualValue, before.annualValue);
  }
});

test('a new campaign presents projected share but does not invent prior actual sales or growth', () => {
  const state = createInitialState();
  const market = getMarketIntelligence(state, defaultPlan(state));
  assert.equal(market.current, null);
  assert.equal(market.next.month, 1);
  assert.equal(market.next.marketChange, null);
  assert.equal(market.next.retailSalesChange, null);
  assert.equal(market.next.demandChange, null);
  assert.equal(market.timeline[0].marketChange, null);
  for (const product of market.products) {
    assert.equal(product.current, null);
    assert.equal(product.next.marketChange, null);
    assert.equal(product.next.retailSalesChange, null);
    assert.equal(product.next.demandChange, null);
  }
  close(market.next.expectedUnitShare, market.next.expectedRetailSales / market.next.marketUnits, 'projected share uses expected customer sales');
});

test('market context stays available without a decision plan while company forecast fields remain unavailable', () => {
  const state = stateAfter(2);
  const planned = getMarketIntelligence(state, defaultPlan(state));
  for (const plan of [null, undefined]) {
    const context = getMarketIntelligence(state, plan);
    assert.deepEqual(context.annual, planned.annual);
    assert.deepEqual(context.timeline, planned.timeline);
    assert.deepEqual(context.current, planned.current);
    for (const field of ['month', 'marketUnits', 'marketValue', 'marketChange']) assert.equal(context.next[field], planned.next[field]);
    for (const field of ['expectedDemand', 'expectedRetailSales', 'expectedUnitShare', 'retailSalesChange', 'demandChange']) {
      assert.equal(context.next[field], null, `${field}: missing plan must not imply a default forecast`);
    }
    for (const product of context.products) {
      const withPlan = planned.products.find(item => item.id === product.id);
      assert.deepEqual(product.current, withPlan.current);
      for (const field of ['month', 'marketUnits', 'marketValue', 'marketChange']) assert.equal(product.next[field], withPlan.next[field]);
      for (const field of ['expectedDemand', 'expectedRetailSales', 'expectedUnitShare', 'retailSalesChange', 'demandChange']) assert.equal(product.next[field], null);
    }
  }
});

test('actual and forecast share use retail sales rather than dealer shipments or booked revenue', () => {
  const state = stateAfter(1);
  const latest = state.history.at(-1);
  const plan = defaultPlan(state);
  const predicted = forecast(state, plan).report;
  const market = getMarketIntelligence(state, plan);
  assert.notEqual(latest.metrics.retailSales, latest.metrics.deliveries, 'fixture must distinguish retail from wholesale');
  assert.equal(market.current.month, state.month);
  assert.equal(market.current.retailSales, latest.metrics.retailSales);
  close(market.current.unitShare, latest.metrics.retailSales / market.current.marketUnits, 'actual retail share');
  assert.notEqual(market.current.unitShare, latest.metrics.deliveries / market.current.marketUnits, 'dealer shipments must not be used as market share');
  assert.equal(market.next.expectedRetailSales, predicted.metrics.retailSales);
  close(market.next.expectedUnitShare, predicted.metrics.retailSales / market.next.marketUnits, 'next-month retail share');
  for (const product of market.products) {
    const actual = latest.products.find(item => item.id === product.id);
    const expected = predicted.products.find(item => item.id === product.id);
    assert.equal(product.current.retailSales, actual.retailSales);
    close(product.current.unitShare, actual.retailSales / product.current.marketUnits, `${product.id}: actual retail share`);
    close(product.next.expectedUnitShare, expected.retailSales / product.next.marketUnits, `${product.id}: expected retail share`);
  }
});

test('next-month market, retail, and demand growth each use their own immediately preceding baseline', () => {
  const state = stateAfter(2);
  const latest = state.history.at(-1);
  const market = getMarketIntelligence(state, defaultPlan(state));
  const previousMarket = market.timeline.find(row => row.month === state.month);
  const nextMarket = market.timeline.find(row => row.month === state.month + 1);
  close(market.next.marketChange, growth(nextMarket.units, previousMarket.units), 'market month-on-month growth');
  close(market.next.retailSalesChange, growth(market.next.expectedRetailSales, latest.metrics.retailSales), 'retail month-on-month growth');
  close(market.next.demandChange, growth(market.next.expectedDemand, sum(latest.products.map(product => product.demand))), 'demand growth compares observed customer requests');
  for (const product of market.products) {
    const actual = latest.products.find(row => row.id === product.id);
    close(product.next.marketChange, growth(product.next.marketUnits, product.current.marketUnits), `${product.id}: market growth`);
    close(product.next.retailSalesChange, growth(product.next.expectedRetailSales, actual.retailSales), `${product.id}: retail growth`);
    close(product.next.demandChange, growth(product.next.expectedDemand, actual.demand), `${product.id}: demand growth`);
  }
});

test('zero retail sales produce zero market share and an unavailable growth rate rather than infinity', () => {
  let state = createInitialState();
  for (let month = 0; month < 4; month += 1) {
    const plan = defaultPlan(state);
    for (const product of PRODUCTS) plan[`${product.id}Production`] = 0;
    state = advanceMonth(state, plan).state;
  }
  assert.equal(state.history.at(-1).metrics.retailSales, 0, 'fixture must have exhausted dealer stock');
  const market = getMarketIntelligence(state, defaultPlan(state));
  assert.equal(market.current.unitShare, 0);
  assert.equal(market.next.retailSalesChange, null);
  for (const product of market.products) {
    assert.equal(product.current.unitShare, 0);
    assert.equal(product.next.retailSalesChange, null);
  }
});

test('intelligence and projections do not mutate saves or disclose future hidden scenario draws', () => {
  const state = stateAfter(2);
  const plan = defaultPlan(state);
  const alternativeSeed = { ...clone(state), seed: 729184 };
  const before = clone({ state, plan });
  freezeDeep(state);
  freezeDeep(plan);
  const market = getMarketIntelligence(state, plan);
  const projected = projectBusiness(state, plan, 3);
  assert.deepEqual(getMarketIntelligence(alternativeSeed, plan), market);
  assert.deepEqual(projectBusiness(alternativeSeed, plan, 3), projected);
  assert.deepEqual({ state, plan }, before);
});

test('financial position separates operating working capital and corporate headroom from customer finance', () => {
  const state = stateAfter(1);
  const position = getFinancialPosition(state);
  for (const [field, value] of Object.entries(balanceSheet(state))) close(position[field], value, `position ${field}`);
  close(position.operatingWorkingCapital, state.receivables + state.inventoryValue - state.payables, 'operating working capital');
  close(position.corporateCreditHeadroom, 160 - state.corporateDebt, 'corporate borrowing headroom');
  close(position.netDebt, state.debt - state.cash, 'net debt includes finance funding');
  assert.notEqual(position.corporateCreditHeadroom, 160 - state.debt, 'customer finance debt does not consume the corporate credit line');
});

test('first projection month is exactly the existing planning forecast and uses the actual opening balance sheet', () => {
  const state = stateAfter(2);
  const plan = { ...defaultPlan(state), capex: 3.5, debtChange: 10, marketing: 2.6 };
  const expected = forecast(state, plan);
  const projection = projectBusiness(state, plan);
  assert.equal(projection.horizonRequested, 3);
  assert.equal(projection.horizonAvailable, 10);
  assert.equal(projection.months.length, 3);
  assert.deepEqual(projection.current, getFinancialPosition(state));
  assert.deepEqual(projection.months[0].report, expected.report);
  assert.deepEqual(projection.months[0].openingBalanceSheet, balanceSheet(state));
  assert.deepEqual(projection.months[0].balanceSheet, balanceSheet(expected.state));
  assert.deepEqual(projection.ending, projection.months.at(-1).position);
});

test('every projection month reconciles financial statements, cash bridge, retained earnings, and opening balances', () => {
  const state = stateAfter(2);
  const plan = { ...defaultPlan(state), capex: 4, debtChange: 12 };
  const projection = projectBusiness(state, plan, 6);
  let previous = balanceSheet(state);
  let previousRevenue = state.history.at(-1).metrics.revenue;
  for (const month of projection.months) {
    const { report, balanceSheet: current, cashBridge } = month;
    assert.deepEqual(month.openingBalanceSheet, previous, `month ${month.month} opens at previous close`);
    close(current.assets, current.liabilities + current.equity, 'assets equal liabilities plus equity');
    close(current.cash - previous.cash, report.cashFlow.operating + report.cashFlow.investing + report.cashFlow.financing, 'cash-flow sections explain cash change');
    close(sum(cashBridge.map(driver => driver.value)), current.cash - previous.cash, 'cash bridge explains cash change');
    close(current.equity - previous.equity, report.income.profit, 'profit retained in equity');
    close(report.cashFlow.opening, previous.cash, 'cash-flow opening cash');
    close(report.cashFlow.closing, current.cash, 'cash-flow ending cash');
    close(month.changes.revenue, growth(report.metrics.revenue, previousRevenue), 'revenue month-on-month growth');
    for (const [identity, residual] of Object.entries(report.reconciliation)) close(residual, 0, `${identity} reconciliation`);
    previous = current;
    previousRevenue = report.metrics.revenue;
  }
});

test('projection carries recurring operating policy but does not repeat one-time borrowing or factory investment', () => {
  const state = createInitialState();
  const plan = { ...defaultPlan(state), capex: 7, debtChange: 25, marketing: 2.8, rd: 2.3, partsBuffer: 5, tractorProduction: 140 };
  const projection = projectBusiness(state, plan, 4);
  assert.equal(projection.months.length, 4);
  let expectedState = state;
  for (const [index, month] of projection.months.entries()) {
    const expectedPlan = { ...plan, ...(index ? { capex: 0, debtChange: 0 } : {}) };
    assert.deepEqual(month.report.plan, expectedPlan);
    assert.equal(month.report.cashFlow.capex, index ? 0 : 7);
    assert.equal(month.report.cashFlow.corporateBorrowing, index ? 0 : 25);
    const expected = forecast(expectedState, expectedPlan);
    assert.deepEqual(month.report, expected.report, 'later forecasts must advance the projected business, not repeatedly forecast the original state');
    expectedState = expected.state;
  }
});

test('projection rejects invalid horizons and active decisions before doing any work', () => {
  const state = createInitialState();
  const plan = defaultPlan(state);
  for (const invalid of [0, -1, 1.5, 13, NaN, Infinity, '3', null]) {
    assert.throws(() => projectBusiness(state, plan, invalid), undefined, `horizon ${String(invalid)} must be rejected`);
  }
  assert.equal(projectBusiness(state, plan, 1).months.length, 1);
  assert.equal(projectBusiness(state, plan, 12).horizonRequested, 12);
  assert.throws(() => projectBusiness(state, { ...plan, tractorPrice: NaN }));
  assert.throws(() => getMarketIntelligence(state, { ...plan, debtChange: 1000 }));
  assert.throws(() => projectBusiness({ ...state, cash: NaN }, plan));
  assert.throws(() => getMarketIntelligence({ ...state, month: 13 }, plan));
});

test('projections stop at the campaign year end instead of creating a thirteenth month', () => {
  const state = stateAfter(10);
  const projection = projectBusiness(state, defaultPlan(state), 6);
  assert.equal(projection.horizonRequested, 6);
  assert.equal(projection.horizonAvailable, 2);
  assert.deepEqual(projection.months.map(row => row.month), [11, 12]);
  assert.equal(projection.stopReason, 'year-end');
});

test('a projected liquidity failure stops the forward view at the actual distress rule', () => {
  const state = createInitialState();
  const plan = defaultPlan(state);
  for (const field of PLAN_FIELDS) plan[field.key] = field.max;
  plan.debtChange = 0;
  const projection = projectBusiness(state, plan, 12);
  assert.equal(projection.stopReason, 'distress');
  assert.ok(projection.months.length > 1 && projection.months.length < 12);
  const final = projection.months.at(-1);
  const previous = projection.months.at(-2);
  assert.ok(final.balanceSheet.equity <= 0 || (final.balanceSheet.cash < 0 && previous.balanceSheet.cash < 0), 'projection ends only when the engine mandate ends');
  let expected = state;
  for (let i = 0; i < projection.months.length; i += 1) {
    expected = forecast(expected, { ...plan, capex: i ? 0 : plan.capex, debtChange: i ? 0 : plan.debtChange }).state;
  }
  assert.equal(expected.status, 'distressed');
  assert.equal(final.month, expected.month);
});

test('an ended campaign has actual market share and balances without a fabricated next month or required new plan', () => {
  const completed = stateAfter(12);
  assert.equal(completed.status, 'completed');
  const market = getMarketIntelligence(completed, null);
  const projection = projectBusiness(completed, null, 3);
  assert.equal(market.current.month, 12);
  assert.equal(market.next, null);
  for (const product of market.products) assert.equal(product.next, null);
  assert.deepEqual(projection.months, []);
  assert.equal(projection.horizonAvailable, 0);
  assert.equal(projection.stopReason, 'campaign-ended');
  assert.deepEqual(projection.current, getFinancialPosition(completed));
  assert.deepEqual(projection.ending, projection.current);
});

test('existing version-one saves need no market or projection fields and remain unchanged after analysis', () => {
  const state = stateAfter(2);
  const game = { state, plan: defaultPlan(state), drafts: [], settings: { reducedMotion: true, viewMode: 'orbit' } };
  const original = exportSave(game);
  const loaded = parseSave(original);
  const before = clone(loaded);
  assert.equal(loaded.state.version, '1.0.0');
  assert.equal(Object.hasOwn(loaded.state, 'market'), false);
  assert.equal(Object.hasOwn(loaded.state, 'projections'), false);
  getMarketIntelligence(loaded.state, loaded.plan);
  projectBusiness(loaded.state, loaded.plan, 3);
  assert.deepEqual(loaded, before);
  assert.equal(validateState(loaded.state).valid, true);
  assert.deepEqual(advanceMonth(loaded.state, loaded.plan), advanceMonth(state, game.plan), 'using intelligence must not change subsequent campaign outcomes');
});
