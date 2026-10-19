import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, PLAN_FIELDS, createInitialState, defaultPlan, advanceMonth, forecast, validatePlan, validateState } from '../src/simulation.js';
import { LEGACY_COACHING_METHODOLOGY_VERSION, getMonthlyCoaching, getPlanCoaching } from '../src/coaching.js';

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

test('being the best tested choice cannot turn weak operating standards into an A', () => {
  const opening = createInitialState(4821);
  const coaching = getPlanCoaching(opening, defaultPlan(opening));
  // All nine policies face an initial dealer-stock correction and forecast an
  // operating loss. Relative ranking is useful but cannot erase those losses.
  assert.ok(coaching.alternatives.every(option => option.forecast.operatingProfit < 0));
  assert.ok(coaching.forecastBest.score < 80);
  for (const option of coaching.alternatives) {
    for (const component of option.components) {
      assert.ok(component.score <= component.absoluteScore / 100 * component.maximum + 0.011);
      assert.ok(component.opportunityPenalty >= 0);
      assert.ok(component.opportunityPenalty <= component.absoluteScore / 100 * component.maximum / 4 + 0.011);
    }
    assert.ok(option.components.find(component => component.id === 'economics').score < 12.5,
      'A forecast operating loss cannot earn half of earnings points.');
  }
  const strongComponent = coaching.alternatives.flatMap(option => option.components)
    .find(component => component.absoluteScore === component.benchmarkScore && component.absoluteScore < 80);
  assert.ok(strongComponent, 'Fixture includes a best-in-set dimension with weak absolute standards.');
  assert.ok(strongComponent.score < strongComponent.maximum * 0.8);
});

test('neglect, standing output, demand discipline and profitable improvement earn meaningfully distinct grades', () => {
  const initial = createInitialState(4821);
  const neglected = { ...defaultPlan(initial), marketing: 0, quality: 0, maintenance: 0, training: 0, rd: 0,
    tractorProduction: 0, harvesterProduction: 0, loaderProduction: 0 };
  const failure = getPlanCoaching(initial, neglected);
  const standing = getPlanCoaching(initial, defaultPlan(initial));
  const matchedPlan = standing.alternatives.find(option => option.id === 'match-demand').plan;
  const disciplined = getPlanCoaching(initial, matchedPlan);
  assert.equal(failure.grade, 'F');
  assert.equal(standing.grade, 'D');
  assert.equal(disciplined.grade, 'C');
  assert.ok(disciplined.alternatives[0].forecast.inventoryValue < standing.alternatives[0].forecast.inventoryValue);
  assert.ok(disciplined.score - standing.score >= 8);

  let state = initial;
  const disciplinedCampaign = [];
  while (state.status === 'active') {
    const choices = getPlanCoaching(state, defaultPlan(state));
    const plan = choices.alternatives.find(option => option.id === 'match-demand').plan;
    const review = getPlanCoaching(state, plan);
    disciplinedCampaign.push(review);
    state = advanceMonth(state, plan).state;
  }
  assert.ok(disciplinedCampaign.some(review => review.grade === 'B'));
  assert.ok(disciplinedCampaign.some(review => review.grade === 'A'));
  assert.ok(Math.max(...disciplinedCampaign.map(review => review.score))
    - Math.min(...disciplinedCampaign.map(review => review.score)) >= 15);
  assert.ok(disciplinedCampaign.filter(review => review.grade === 'A')
    .every(review => review.alternatives[0].forecast.operatingProfit > 0));
});

test('historical grades disclose the current rubric without modifying saved financial results', () => {
  const state = completeMonth(createInitialState(17, { marketRegime: 'soft' }));
  const before = JSON.stringify(state);
  const review = getMonthlyCoaching(state);
  assert.equal(review.methodologyVersion, LEGACY_COACHING_METHODOLOGY_VERSION);
  assert.equal(getPlanCoaching(createInitialState(), defaultPlan(createInitialState())).methodologyVersion, LEGACY_COACHING_METHODOLOGY_VERSION);
  assert.match(review.methodology, /Historical decision grades are recalculated/);
  assert.match(review.methodology, /board separately assesses realized performance/);
  assert.equal(JSON.stringify(state), before);
});

test('three-year campaigns replay decisions across year boundaries without changing earlier reviews', () => {
  let state = createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36 });
  let firstYearReview;
  while (state.month < 25) {
    assert.equal(state.status, 'active');
    const choices = getPlanCoaching(state, defaultPlan(state));
    state = completeMonth(state, choices.alternatives.find(option => option.id === 'match-demand').plan);
    if (state.month === 12) firstYearReview = getMonthlyCoaching(state, 12);
  }
  const snapshot = JSON.stringify(state);
  assert.deepEqual(getMonthlyCoaching(state, 12), firstYearReview);
  for (const month of [13, 25]) {
    const review = getMonthlyCoaching(state, month);
    assert.equal(review.available, true, review.reason);
    assert.equal(review.month, month);
    assert.equal(review.alternatives[0].actual.profit, state.history[month - 1].metrics.profit);
    assert.equal(review.alternatives.length, 9);
  }
  assert.equal(JSON.stringify(state), snapshot);
});
