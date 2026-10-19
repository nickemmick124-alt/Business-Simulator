import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS, PLAN_FIELDS, createInitialState, defaultPlan, advanceMonth, forecast,
  getCampaignOutcome, validateState,
} from '../src/simulation.js';
import { getMarketIntelligence } from '../src/business-intelligence.js';
import { getBoardMandate, getBoardReview, getBoardDashboard } from '../src/board-mandate.js';

const clone = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((total, value) => total + value, 0);
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not close to ${expected}`);
const initial = (regime = 'flat', seed = 4821) => createInitialState(seed, { marketRegime: regime });
function matchedPlan(state) {
  const plan = { ...defaultPlan(state), marketing: 1.5, quality: 1.3, maintenance: 1, training: 0.5, rd: 1.5, partsBuffer: 5 };
  for (const product of forecast(state, plan).report.products) {
    const definition = PRODUCTS.find(item => item.id === product.id);
    plan[`${product.id}Production`] = Math.min(Math.ceil(definition.capacity * 1.4), Math.max(0,
      Math.ceil((product.dealerOrders + 0.1 * product.expectedDemand - product.opening.finishedGoods - product.reworkResolved) / Math.max(0.85, product.qualityRate))));
  }
  return plan;
}
function advance(state, months = 1, makePlan = matchedPlan) {
  let result = state;
  for (let index = 0; index < months && result.status === 'active'; index += 1) result = advanceMonth(result, makePlan(result)).state;
  return result;
}

test('opening mandate discloses fixed monthly, quarterly and annual goals without looking at hidden shocks', () => {
  for (const regime of ['soft', 'flat', 'upswing']) {
    const first = getBoardMandate(initial(regime, 12));
    const otherSeed = getBoardMandate(initial(regime, 981));
    assert.deepEqual(first, otherSeed);
    assert.equal(first.monthlyGoals.length, 12);
    assert.deepEqual(first.quarterlyGoals.map(goal => goal.month), [3, 6, 9, 12]);
    assert.deepEqual(first.annualGoals.map(goal => goal.month), [12]);
    assert.equal(sum(first.metrics.map(metric => metric.weight)), 100);
    assert.equal(first.metrics.length, 6);
    assert.ok(first.monthlyGoals.every(goal => Object.keys(goal.targets).length === 6 && Object.keys(goal.thresholds).length === 6));
    assert.match(first.scoringMethodology, /exact target earns 75/);
    const after = getBoardMandate(advance(initial(regime, 12), 5));
    assert.deepEqual(after, first, 'Observed surprises and committed decisions never revise targets.');
  }
  assert.ok(getBoardMandate(initial('soft')).annualGoals[0].targets.liquidity > getBoardMandate(initial('upswing')).annualGoals[0].targets.liquidity);
  assert.ok(getBoardMandate(initial('soft')).annualGoals[0].targets.share < getBoardMandate(initial('upswing')).annualGoals[0].targets.share);
});

test('three-year goals are announced together with explicit year and quarter boundaries', () => {
  const state = createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36 });
  assert.equal(state.version, '1.2.0');
  const mandate = getBoardMandate(state);
  assert.equal(mandate.horizonMonths, 36);
  assert.equal(mandate.retrospective, false);
  assert.equal(mandate.monthlyGoals.length, 36);
  assert.equal(mandate.quarterlyGoals.length, 12);
  assert.deepEqual(mandate.annualGoals.map(goal => [goal.month, goal.year]), [[12, 1], [24, 2], [36, 3]]);
  assert.equal(mandate.monthlyGoals[12].quarter, 1);
  assert.equal(mandate.monthlyGoals[12].campaignQuarter, 5);
  assert.ok(mandate.monthlyGoals[12].targets.value > mandate.monthlyGoals[11].targets.value);
  assert.deepEqual(getBoardMandate(advance(state, 13)), mandate);
});

test('older saved campaigns retain twelve months and label new targets as retrospective benchmarks', () => {
  for (const state of [createInitialState(), initial('soft')]) {
    const mandate = getBoardMandate(state);
    assert.equal(mandate.horizonMonths, 12);
    assert.equal(mandate.retrospective, true);
    assert.match(mandate.targetBasis, /not shown/);
    const completed = advance(state, 12);
    assert.equal(completed.month, 12);
    const review = getBoardReview(completed);
    assert.equal(review.available, true, review.reason);
    assert.match(review.interpretation, /retrospective/);
    assert.equal(getBoardDashboard(completed, defaultPlan(completed)).next, null);
  }
});

test('new one-year campaigns can record that their fixed mandate was shown without changing targets or old saves', () => {
  const old = initial();
  const current = { ...clone(old), boardMandateVersion: '1.0.0' };
  assert.equal(getBoardMandate(old).retrospective, true);
  assert.equal(getBoardMandate(current).retrospective, false);
  assert.deepEqual(getBoardMandate(old).monthlyGoals, getBoardMandate(current).monthlyGoals);
  const played = advance(current);
  assert.equal(played.boardMandateVersion, '1.0.0');
  assert.equal(getBoardReview(played).available, true);
  assert.match(getBoardReview(played).interpretation, /announced at campaign opening/);
  assert.equal(old.boardMandateVersion, undefined);
});

test('opening has no invented actual and a selected plan yields a separate public preview', () => {
  const state = initial();
  const plan = defaultPlan(state);
  const original = JSON.stringify({ state, plan });
  const dashboard = getBoardDashboard(state, plan);
  assert.equal(dashboard.current, null);
  assert.deepEqual(dashboard.history, []);
  assert.equal(dashboard.next.kind, 'forecast');
  assert.equal(dashboard.next.month, 1);
  assert.equal(dashboard.nextQuarter.month, 3);
  assert.equal(getBoardReview(state).available, false);
  assert.equal(JSON.stringify({ state, plan }), original);
  assert.deepEqual(dashboard.next, getBoardDashboard(initial('flat', 99), plan).next, 'The preview cannot use the next random shock.');
});

test('history and goals remain stable after later plans and mutable returned data', () => {
  let state = advance(initial('upswing', 231));
  const original = JSON.stringify(state);
  const first = getBoardReview(state, 1);
  assert.equal(first.available, true, first.reason);
  assert.equal(JSON.stringify(state), original);
  const working = { ...defaultPlan(state), capex: 8, marketing: 2.2 };
  getBoardDashboard(state, working);
  state = advance(state, 3);
  assert.deepEqual(getBoardReview(state, 1), first);
  const returned = getBoardReview(state, 1);
  returned.components[0].target = 987654;
  returned.futureValue.pipeline.length = 0;
  assert.deepEqual(getBoardReview(state, 1), first);
});

test('reviews reconcile risk-adjusted value and observed share to existing accounting and market definitions', () => {
  for (const opening of [createInitialState(), initial('soft'), initial('flat'), initial('upswing')]) {
    const state = advance(opening, 4);
    const review = getBoardReview(state);
    assert.equal(review.available, true, review.reason);
    const component = id => review.components.find(item => item.id === id);
    close(component('value').actual, getCampaignOutcome(state).valueCreated);
    close(component('share').actual, getMarketIntelligence(state).current.unitShare);
    close(component('liquidity').actual, state.cash + 160 - state.corporateDebt);
    close(review.futureValue.adjustedEquity + review.futureValue.realizationDiscount, state.equity);
    assert.equal(Math.round(sum(review.components.map(item => item.score))), review.score);
    assert.equal(sum(review.components.map(item => item.maximum)), 100);
    for (const item of review.components) {
      close(item.gap, item.actual - item.target);
      assert.equal(item.thresholds.target, item.target);
    }
  }
});

test('quarter-end board review uses weighted quarter flows and quarter-end balance-sheet positions', () => {
  const state = advance(initial('upswing'), 6);
  const review = getBoardReview(state);
  assert.equal(review.quarterReview.period, 'quarter');
  assert.equal(review.quarterReview.startMonth, 4);
  const quarter = review.quarterReview;
  const flows = state.history.slice(3).flatMap(report => report.products);
  const component = id => quarter.components.find(item => item.id === id);
  close(component('delivery').actual, sum(flows.map(product => product.deliveries)) / sum(flows.map(product => product.dealerOrders)));
  close(component('quality').actual, (sum(flows.map(product => product.assembled)) - sum(flows.map(product => product.defects))) / sum(flows.map(product => product.assembled)));
  const timeline = getMarketIntelligence(state).timeline.slice(3, 6);
  close(component('share').actual, sum(flows.map(product => product.retailSales)) / sum(timeline.map(month => month.units)));
  close(component('value').actual, review.components.find(item => item.id === 'value').actual);
  assert.deepEqual(quarter.goal, getBoardMandate(state).quarterlyGoals[1]);
  assert.equal(getBoardReview(state, 5).quarterReview, null);
  assert.equal(getBoardDashboard(state, defaultPlan(state)).nextQuarter.month, 9);
  const pending = advance(initial(), 2);
  const preview = getBoardDashboard(pending, matchedPlan(pending)).next;
  assert.equal(preview.quarterReview.kind, 'forecast');
  assert.match(preview.quarterReview.interpretation, /completed actual months with the expected final month/);
});

test('unnecessary corporate borrowing cannot purchase board points or created value', () => {
  const state = initial();
  const plan = matchedPlan(state);
  const normal = getBoardDashboard(state, plan).next;
  const borrowed = getBoardDashboard(state, { ...plan, debtChange: 40 }).next;
  assert.equal(normal.score, borrowed.score);
  assert.deepEqual(normal.components, borrowed.components);
  assert.equal(normal.futureValue.valueCreated, borrowed.futureValue.valueCreated);
});

test('factory investment and engineering budgets create a dated pipeline without an automatic value bonus', () => {
  const state = initial();
  const plan = matchedPlan(state);
  const normal = getBoardDashboard(state, { ...plan, capex: 0, rd: 0 }).next;
  const invested = getBoardDashboard(state, { ...plan, capex: 8, rd: 3 }).next;
  assert.equal(invested.futureValue.fundedCapacityPipeline, 8);
  assert.equal(invested.futureValue.fundedEngineeringPipeline, 3);
  assert.ok(invested.futureValue.pipeline.every(project => project.maturesMonth === 4));
  assert.equal(invested.futureValue.capability.capacityBonus, normal.futureValue.capability.capacityBonus);
  assert.equal(invested.futureValue.capability.technology, normal.futureValue.capability.technology);
  assert.ok(invested.futureValue.valueCreated < normal.futureValue.valueCreated, 'Engineering is an expense now; no fictional project valuation is added.');
  assert.ok(invested.score <= normal.score);
  assert.match(invested.futureValue.explanation, /not a sale price/);
});

test('idle operations cannot earn an A from cash or unmeasured quality', () => {
  const state = initial();
  const plan = { ...defaultPlan(state), marketing: 0, quality: 0, maintenance: 0, training: 0, rd: 0 };
  for (const product of PRODUCTS) plan[`${product.id}Production`] = 0;
  const review = getBoardDashboard(state, plan).next;
  assert.ok(review.score < 60, `Idle forecast received ${review.score}`);
  const quality = review.components.find(component => component.id === 'quality');
  assert.equal(quality.actual, null);
  assert.equal(quality.status, 'Unmeasured');
  assert.equal(quality.score, 0);
});

test('financial distress is explicit and caps the reconciled board score below 40', () => {
  const state = advance(initial('soft'), 12, opening => {
    const plan = Object.fromEntries(PLAN_FIELDS.map(field => [field.key, field.max]));
    plan.debtChange = 0;
    return plan;
  });
  assert.equal(state.status, 'distressed');
  const review = getBoardReview(state);
  assert.equal(review.available, true, review.reason);
  assert.ok(review.score < 40);
  assert.equal(review.guardrail.id, 'distress');
  assert.equal(Math.round(sum(review.components.map(component => component.score))), review.score);
  assert.equal(getBoardDashboard(state, defaultPlan(state)).next, null);
});

test('reasonable operating policies have a useful score range instead of automatic ninety-point grades', () => {
  const all = [];
  for (const regime of ['soft', 'flat', 'upswing']) {
    const state = advance(initial(regime), 12);
    const dashboard = getBoardDashboard(state);
    assert.ok(dashboard.current.available, dashboard.current.reason);
    all.push(...dashboard.history.map(review => review.score));
    assert.ok(dashboard.current.score >= 55 && dashboard.current.score <= 89, `${regime} reference policy: ${dashboard.current.score}`);
  }
  assert.ok(Math.max(...all) - Math.min(...all) >= 15, JSON.stringify(all));
  assert.ok(all.filter(score => score >= 90).length < all.length / 4);
});

test('invalid plans retain actual board context without fabricating a preview', () => {
  const state = advance(initial(), 2);
  const dashboard = getBoardDashboard(state, { ...defaultPlan(state), capex: -1 });
  assert.equal(dashboard.current.available, true);
  assert.equal(dashboard.history.length, 2);
  assert.equal(dashboard.next, null);
  assert.match(dashboard.forecastError, /Factory investment/);
});

test('modified reports, hidden seed and ending positions cannot silently rewrite historical assessments', () => {
  const original = advance(initial(), 2);
  for (const modify of [
    state => { state.history[0].metrics.profit += 1; },
    state => { state.history[0].plan.marketing += 0.1; },
    state => { state.cash += 1; state.equity += 1; },
    state => { state.seed += 1; },
  ]) {
    const changed = clone(original); modify(changed);
    assert.equal(validateState(changed).valid, true);
    const review = getBoardReview(changed, 1);
    assert.equal(review.available, false);
    assert.match(review.reason, /reproduced|replay/);
    assert.deepEqual(getBoardMandate(changed), getBoardMandate(original), 'Even edited state cannot move the fixed benchmark.');
  }
  const projected = forecast(initial(), defaultPlan(initial())).state;
  assert.equal(getBoardReview(projected).available, false);
  assert.match(getBoardReview(projected).reason, /projection/);
});
