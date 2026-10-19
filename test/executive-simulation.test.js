import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, createInitialState, createReplayInitialState, defaultPlan, getPlanFields, validatePlan, validateState, forecast, advanceMonth, getMarketOutlook } from '../src/simulation.js';
import { campaignLength, isCyclicalState } from '../src/campaign-calendar.js';
import { DIFFICULTIES, getDifficulty, createEmployment, evaluateEmployment } from '../src/executive-rules.js';

const makeState = (difficulty = 'medium', seed = 4821, campaignMonths = 36) => createInitialState(seed, { difficulty, campaignMonths, marketRegime: 'flat' });
const clone = value => JSON.parse(JSON.stringify(value));
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);
const valid = state => assert.deepEqual(validateState(state), { valid: true, errors: [] });
function demandPlan(state) {
  const plan = defaultPlan(state);
  const next = forecast(state, plan);
  for (const product of next.report.products) plan[`${product.id}Production`] = Math.max(0, Math.round(product.expectedDemand * 1.1 - state.products[product.id].finishedGoods * 0.6));
  return { ...plan, partsBuffer: 30, marketing: 2.5, quality: 1.5, rd: 1.8, maintenance: 1, training: 0.6 };
}
function idlePlan(state) {
  return { ...defaultPlan(state), tractorProduction: 0, harvesterProduction: 0, loaderProduction: 0, quality: 0, training: 0, maintenance: 0, marketing: 0, rd: 0 };
}

test('executive rules are explicit, support both horizons, and leave existing creation calls on their original rules', () => {
  assert.equal(createInitialState().version, '1.0.0');
  assert.equal(createInitialState(1, { marketRegime: 'flat' }).version, '1.1.0');
  assert.equal(createInitialState(1, { campaignMonths: 36 }).version, '1.2.0');
  for (const difficulty of Object.keys(DIFFICULTIES)) for (const months of [12, 36]) {
    const state = makeState(difficulty, 5, months);
    valid(state);
    assert.equal(state.version, '1.3.0');
    assert.equal(state.difficulty, difficulty);
    assert.equal(campaignLength(state), months);
    assert.equal(isCyclicalState(state), true);
    assert.deepEqual(createReplayInitialState(state), state);
    assert.equal(getDifficulty(state), DIFFICULTIES[difficulty]);
  }
  assert.throws(() => createInitialState(5, { difficulty: 'impossible' }), /Difficulty/);
  assert.equal(getDifficulty(createInitialState()), null);
});

test('new levers are bounded and required only in executive plans', () => {
  const legacy = createInitialState();
  const state = makeState();
  assert.equal(defaultPlan(legacy).supplierSupport, undefined);
  assert.equal(getPlanFields(legacy).some(field => field.key === 'dealerSupport'), false);
  assert.equal(getPlanFields(state).filter(field => ['supplierSupport', 'dealerSupport'].includes(field.key)).length, 2);
  for (const key of ['supplierSupport', 'dealerSupport']) for (const value of [-0.1, 3.1, Infinity, NaN, undefined]) {
    assert.equal(validatePlan({ ...defaultPlan(state), [key]: value }, state).valid, false);
  }
  assert.equal(validatePlan(defaultPlan(state), state).valid, true);
});

test('supplier recovery buys actual controller fulfillment and records the full expense', () => {
  const state = makeState();
  const plan = defaultPlan(state);
  const baseline = forecast(state, plan);
  const funded = forecast(state, { ...plan, supplierSupport: 2 });
  assert.equal(funded.report.income.supplierSupport, 2);
  assert.equal(funded.report.income.dealerSupport, 0);
  for (let index = 0; index < PRODUCTS.length; index += 1) {
    const base = baseline.report.products[index], next = funded.report.products[index];
    near(next.supplyRate - base.supplyRate, 0.08, 'supply recovery');
    assert.ok(next.controllerReceipts >= base.controllerReceipts);
    assert.ok(next.production >= base.production);
    assert.equal(next.capacity, base.capacity, 'supplier support cannot create assembly slots');
  }
  near(funded.report.income.operatingExpense - baseline.report.income.operatingExpense, 2, 'full support expense');
  for (const residual of Object.values(funded.report.reconciliation)) near(residual, 0, 'funded books balance');
  valid(funded.state);
});

test('dealer support changes demand and reputation with a real current-period cost', () => {
  const state = makeState();
  const baseline = forecast(state, defaultPlan(state));
  const funded = forecast(state, { ...defaultPlan(state), dealerSupport: 2 });
  assert.equal(funded.report.income.dealerSupport, 2);
  near(funded.report.income.operatingExpense - baseline.report.income.operatingExpense, 2, 'dealer cost');
  assert.ok(funded.report.products.every((product, index) => product.expectedDemand > baseline.report.products[index].expectedDemand));
  assert.ok(funded.state.products.tractor.reputation > baseline.state.products.tractor.reputation);
  for (const residual of Object.values(funded.report.reconciliation)) near(residual, 0, 'dealer support books balance');
});

test('difficulty changes economics and surprise size rather than secretly changing displayed grades', () => {
  const easy = makeState('easy'), medium = makeState('medium'), difficult = makeState('difficult');
  const easyForecast = forecast(easy, defaultPlan(easy));
  const mediumForecast = forecast(medium, defaultPlan(medium));
  const hardForecast = forecast(difficult, defaultPlan(difficult));
  assert.ok(easyForecast.report.metrics.retailSales > mediumForecast.report.metrics.retailSales);
  assert.ok(mediumForecast.report.metrics.retailSales > hardForecast.report.metrics.retailSales);
  const easyActual = advanceMonth(easy, defaultPlan(easy));
  const hardActual = advanceMonth(difficult, defaultPlan(difficult));
  assert.ok(Math.abs(hardActual.report.marketContext.demandSurprise) > Math.abs(easyActual.report.marketContext.demandSurprise));
  assert.equal(easyActual.report.employment.strikeLimit, 5);
  assert.equal(hardActual.report.employment.strikeLimit, 3);
});

test('forecasts stay seed blind, immutable, and cannot accumulate actual strikes', () => {
  const state = makeState('difficult');
  state.ceoJournal.push({ month: 1, visited: ['cfo', 'sales'] });
  const before = clone(state);
  const plan = idlePlan(state);
  const first = forecast(state, plan);
  const other = forecast({ ...state, seed: 9922 }, plan);
  assert.deepEqual(first.report, other.report);
  assert.deepEqual(state, before);
  assert.equal(state.employment.strikes, 0);
  assert.equal(first.report.employment.isForecast, true);
  assert.deepEqual(first.state.ceoJournal, state.ceoJournal);
  assert.equal(Object.hasOwn(first.report, 'ceoJournal'), false);
  assert.deepEqual(getMarketOutlook(state), getMarketOutlook({ ...state, seed: 145 }));
});

test('repeated poor operating rounds lead to warnings, probation, and dismissal on disclosed schedules', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    let state = makeState(difficulty);
    const profile = getDifficulty(state);
    const statuses = [];
    while (state.status === 'active') {
      const result = advanceMonth(state, idlePlan(state));
      state = result.state;
      valid(state);
      statuses.push(state.employment.status);
      if (state.month <= profile.graceMonths) assert.equal(state.employment.strikes, 0);
    }
    assert.equal(state.status, 'dismissed');
    assert.equal(state.month, profile.graceMonths + profile.strikeLimit);
    assert.ok(state.cash > 0, 'performance dismissal is distinct from insolvency');
    assert.ok(statuses.includes('warning'));
    assert.ok(statuses.includes('probation'));
    assert.equal(state.employment.strikes, profile.strikeLimit);
    assert.throws(() => advanceMonth(state, defaultPlan(state)), /complete/);
    let replay = createReplayInitialState(state);
    for (const report of state.history) replay = advanceMonth(replay, report.plan).state;
    assert.deepEqual(replay, state);
  }
});

test('two clean rounds remove an unresolved strike; a warning is recoverable', () => {
  const state = makeState('medium');
  const result = forecast(state, demandPlan(state));
  const report = clone(result.report);
  report.month = 4;
  report.metrics.serviceLevel = 1;
  report.metrics.qualityRate = 0.98;
  report.income.profit = 5;
  report.income.cogs = 40;
  const sound = { ...result.state, cash: 90, inventoryValue: 45 };
  const prior = { ...createEmployment(), strikes: 2, badMonths: 2, status: 'warning', lastReviewMonth: 3 };
  const first = evaluateEmployment(prior, report, sound);
  assert.equal(first.employment.strikes, 2);
  assert.equal(first.employment.goodMonths, 1);
  const second = evaluateEmployment(first.employment, { ...report, month: 5 }, sound);
  assert.equal(second.employment.strikes, 1);
  assert.match(second.review.message, /removed one strike/);
  assert.equal(prior.strikes, 2);
});

test('demand-led management can complete all three difficulty campaigns with reconciled books', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    let state = makeState(difficulty);
    while (state.status === 'active') {
      const before = state;
      const result = advanceMonth(state, demandPlan(state));
      state = result.state;
      valid(state);
      for (const residual of Object.values(result.report.reconciliation)) near(residual, 0, 'reconciliation');
      near(state.equity - before.equity, result.report.income.profit, 'retained profit');
      near(result.report.cashFlow.operating + result.report.cashFlow.investing + result.report.cashFlow.financing, state.cash - before.cash, 'cash conservation');
      for (const product of result.report.products) {
        assert.equal(product.closing.controllers, product.opening.controllers + product.controllerReceipts - product.assembled);
        assert.equal(product.closing.finishedGoods, product.opening.finishedGoods + product.production - product.deliveries);
      }
    }
    assert.equal(state.status, 'completed', difficulty);
    assert.equal(state.month, 36);
    assert.ok(state.cash > 0);
  }
});

test('malformed executive employment, support expenses, and meeting journals are rejected', () => {
  const initial = makeState();
  const finished = advanceMonth(initial, defaultPlan(initial)).state;
  for (const mutate of [
    state => { state.difficulty = 'extreme'; },
    state => { state.campaignMonths = 24; },
    state => { state.employment.strikes = -1; },
    state => { state.status = 'dismissed'; },
    state => { state.employment.status = 'dismissed'; },
    state => { state.history[0].income.supplierSupport = NaN; },
    state => { state.history[0].plan.dealerSupport = 50; },
    state => { state.ceoJournal = [{ month: 3, visited: ['cfo'] }]; },
    state => { state.ceoJournal = [{ month: 1, visited: ['cfo', 'cfo'] }]; },
    state => { state.ceoJournal = [{ month: 1, visited: ['secret-future'] }]; },
  ]) {
    const state = clone(finished);
    mutate(state);
    assert.equal(validateState(state).valid, false);
  }
});
