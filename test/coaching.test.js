import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, PLAN_FIELDS, createInitialState, defaultPlan, advanceMonth, forecast, validatePlan, validateState } from '../src/simulation.js';
import { getMonthlyCoaching, getPlanCoaching } from '../src/coaching.js';

const clone = value => JSON.parse(JSON.stringify(value));
const completeMonth = (state, plan = defaultPlan(state)) => advanceMonth(state, plan).state;

test('legacy and cyclical months replay exactly, with feasible bounded comparisons', () => {
  for (const options of [{}, { marketRegime: 'soft' }, { marketRegime: 'flat' }, { marketRegime: 'upswing' }]) {
    let state = createInitialState(4821, options);
    for (let index = 0; index < 3; index += 1) {
      const opening = state;
      state = completeMonth(state);
      const coaching = getMonthlyCoaching(state, state.month);
      assert.equal(coaching.available, true, coaching.reason);
      assert.equal(coaching.alternatives.length, 9);
      assert.ok(coaching.score >= 0 && coaching.score <= 100);
      assert.match(coaching.grade, /^[ABCDF]$/);
      for (const option of coaching.alternatives) {
        assert.equal(validatePlan(option.plan, opening).valid, true, option.name);
        const replayed = advanceMonth(opening, option.plan).report;
        assert.deepEqual(option.actual, {
          ...replayed.metrics,
          operatingProfit: replayed.income.operatingProfit,
          operatingWorkingCapital: replayed.balanceSheet.receivables + replayed.balanceSheet.inventory - replayed.balanceSheet.payables,
          inventoryValue: replayed.balanceSheet.inventory,
        });
        assert.deepEqual(replayed.marketContext, state.history.at(-1).marketContext, 'Every candidate faces the same realized market and supply shocks.');
      }
      assert.equal(coaching.forecastBest.score, Math.max(...coaching.alternatives.map(option => option.score)));
      assert.equal(coaching.hindsightBest.actualScore, Math.max(...coaching.alternatives.map(option => option.actualScore)));
    }
  }
});

test('decision grade and forecast alternatives cannot see the next seed-dependent shocks', () => {
  const reviews = [17, 9381].map(seed => {
    const opening = createInitialState(seed, { marketRegime: 'soft' });
    return getMonthlyCoaching(completeMonth(opening), 1);
  });
  assert.equal(reviews[0].score, reviews[1].score);
  assert.equal(reviews[0].grade, reviews[1].grade);
  assert.deepEqual(reviews[0].components, reviews[1].components);
  assert.deepEqual(reviews[0].alternatives.map(({ id, plan, score, forecast }) => ({ id, plan, score, forecast })),
    reviews[1].alternatives.map(({ id, plan, score, forecast }) => ({ id, plan, score, forecast })));
  assert.equal(reviews[0].forecastBest.id, reviews[1].forecastBest.id);
  assert.notDeepEqual(reviews[0].actualVsForecast.actual, reviews[1].actualVsForecast.actual);
  assert.ok(reviews.every(review => review.score >= 60), 'A reasonable opening plan must not fail merely because its realized market is soft.');
});

test('cash from unnecessary corporate borrowing cannot buy a higher decision grade', () => {
  const opening = createInitialState();
  const plan = defaultPlan(opening);
  const normal = getPlanCoaching(opening, plan);
  const borrowed = getPlanCoaching(opening, { ...plan, debtChange: 40 });
  assert.equal(normal.score, borrowed.score);
  assert.deepEqual(normal.components, borrowed.components);
  assert.equal(borrowed.alternatives[0].forecast.cash - normal.alternatives[0].forecast.cash, 40);
  assert.equal(borrowed.alternatives[0].forecast.equity, normal.alternatives[0].forecast.equity);
});

test('borrowing can legitimately protect against an otherwise negative cash balance', () => {
  const opening = createInitialState();
  opening.cash -= 110;
  opening.equity -= 110;
  assert.equal(validateState(opening).valid, true);
  const plan = defaultPlan(opening);
  const normal = getPlanCoaching(opening, plan);
  const borrowed = getPlanCoaching(opening, { ...plan, debtChange: 40 });
  assert.ok(normal.available && borrowed.available);
  assert.ok(normal.alternatives[0].forecast.cash < 0);
  assert.ok(borrowed.alternatives[0].forecast.cash > 0);
  assert.ok(borrowed.score > normal.score);
  assert.ok(borrowed.components.find(component => component.id === 'risk').score > normal.components.find(component => component.id === 'risk').score);
});

test('shutdown and neglected capability do not receive an A from empty production denominators', () => {
  const opening = createInitialState();
  const plan = defaultPlan(opening);
  for (const key of ['marketing', 'quality', 'maintenance', 'training', 'rd', 'capex', 'overtime', 'partsBuffer']) plan[key] = 0;
  for (const product of PRODUCTS) plan[`${product.id}Production`] = 0;
  const coaching = getPlanCoaching(opening, plan);
  assert.equal(coaching.available, true);
  assert.ok(coaching.score < 60, `Neglect score unexpectedly high: ${coaching.score}`);
  assert.ok(coaching.components.find(component => component.id === 'capability').score < 10);
  assert.ok(coaching.components.every(component => Number.isFinite(component.score)));
});

test('historical review is repeatable, immutable and independent of subsequent choices', () => {
  let state = completeMonth(createInitialState(231, { marketRegime: 'upswing' }));
  state.history[0].planningForecast = clone(forecast(createInitialState(231, { marketRegime: 'upswing' }), state.history[0].plan).report.metrics);
  const firstCopy = JSON.stringify(state);
  const first = getMonthlyCoaching(state, 1);
  assert.equal(JSON.stringify(state), firstCopy);
  state = completeMonth(state, { ...defaultPlan(state), marketing: 2.2, partsBuffer: 5 });
  state = completeMonth(state);
  const laterCopy = JSON.stringify(state);
  assert.deepEqual(getMonthlyCoaching(state, 1), first);
  assert.deepEqual(getMonthlyCoaching(state, 1), getMonthlyCoaching(state, 1));
  assert.equal(JSON.stringify(state), laterCopy);
});

test('modified financial reports, plans and ending positions refuse fabricated historical lessons', () => {
  const original = completeMonth(createInitialState());
  for (const modify of [
    state => { state.history[0].metrics.profit += 1; },
    state => { state.history[0].products[0].deliveries += 1; },
    state => { state.history[0].plan.marketing += 0.1; },
    state => { state.cash += 1; state.equity += 1; },
  ]) {
    const altered = clone(original); modify(altered);
    assert.equal(validateState(altered).valid, true, 'The replay check catches edits beyond structural validation.');
    const result = getMonthlyCoaching(altered, 1);
    assert.equal(result.available, false);
    assert.equal(result.score, null);
    assert.match(result.reason, /replay|reproduced/i);
  }
  const invalid = clone(original); invalid.version = 'unsupported';
  assert.equal(getMonthlyCoaching(invalid, 1).available, false);
  assert.equal(getMonthlyCoaching(createInitialState(), 0).available, false);
});

test('a planning projection cannot masquerade as an actual committed month', () => {
  const initial = createInitialState();
  const projected = forecast(initial, defaultPlan(initial)).state;
  const result = getMonthlyCoaching(projected, 1);
  assert.equal(result.available, false);
  assert.match(result.reason, /projection/);
});

test('every alternative respects extreme input ranges and available debt capacity', () => {
  const initial = createInitialState(19, { marketRegime: 'flat' });
  const extreme = Object.fromEntries(PLAN_FIELDS.map(field => [field.key, field.max]));
  let state = advanceMonth(initial, extreme).state;
  const nextPlan = { ...extreme, debtChange: Math.min(40, 160 - state.corporateDebt) };
  const coaching = getPlanCoaching(state, nextPlan);
  assert.equal(coaching.available, true, coaching.reason);
  assert.ok(coaching.alternatives.length >= 6 && coaching.alternatives.length <= 16);
  for (const option of coaching.alternatives) assert.equal(validatePlan(option.plan, state).valid, true, option.name);
});

test('visible grade components reconcile and lessons state the limited comparison', () => {
  const state = completeMonth(createInitialState(412, { marketRegime: 'soft' }));
  const coaching = getMonthlyCoaching(state);
  assert.equal(Math.round(coaching.components.reduce((sum, component) => sum + component.score, 0)), coaching.score);
  assert.equal(coaching.components.reduce((sum, component) => sum + component.maximum, 0), 100);
  assert.ok(coaching.strengths.length > 0 && coaching.improvements.length > 0);
  assert.ok(coaching.improvements.every(item => item.detail && item.action));
  assert.match(coaching.methodology, /not a global optimum/);
  assert.equal(coaching.actualVsForecast.variance.profit, coaching.actualVsForecast.actual.profit - coaching.actualVsForecast.forecast.profit);
  assert.deepEqual(coaching.planChanges, coaching.hindsightBest.planChanges);
});
