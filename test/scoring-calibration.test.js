import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS, createInitialState, defaultPlan, advanceMonth, getPlanFields, validatePlan,
} from '../src/simulation.js';
import { getPlanCoaching, getMonthlyCoaching, COACHING_METHODOLOGY_VERSION } from '../src/coaching.js';
import { ADVISORS, visitAdvisor } from '../src/executive-intelligence.js';

const initial = (seed = 4821, marketRegime = 'flat', difficulty = 'medium') => createInitialState(seed, {
  marketRegime, difficulty, campaignMonths: 36,
});
const sum = values => values.reduce((a, b) => a + b, 0);
const average = values => sum(values) / values.length;
const policyPlan = (state, policy) => {
  let plan = defaultPlan(state);
  if (policy === 'matched') plan = getPlanCoaching(state, plan).alternatives.find(option => option.id === 'match-demand').plan;
  if (policy === 'neglect') Object.assign(plan, { quality: 0, training: 0, maintenance: 0, rd: 0 });
  if (policy === 'idle') Object.assign(plan, { marketing: 0, quality: 0, training: 0, maintenance: 0, rd: 0,
    tractorProduction: 0, harvesterProduction: 0, loaderProduction: 0 });
  if (policy === 'reckless') {
    plan = Object.fromEntries(getPlanFields(state).map(field => [field.key, field.max]));
    plan.debtChange = Math.min(plan.debtChange, 160 - state.corporateDebt);
  }
  return plan;
};

function campaign(seed, regime, policy, months = 12) {
  let state = initial(seed, regime);
  const scores = [];
  while (state.status === 'active' && state.month < months) {
    const plan = policyPlan(state, policy);
    const review = getPlanCoaching(state, plan);
    assert.equal(review.available, true, review.reason);
    assert.equal(review.methodologyVersion, COACHING_METHODOLOGY_VERSION);
    assert.equal(Math.round(sum(review.components.map(component => component.score))), review.score);
    assert.equal(sum(review.components.map(component => component.maximum)), 100);
    assert.ok(review.score >= 0 && review.score <= 100);
    scores.push(review.score);
    state = advanceMonth(state, plan).state;
  }
  return { state, scores };
}

test('same-seed operating policies separate disciplined choices from neglect, shutdown and reckless spending in all regimes', () => {
  for (const seed of [17, 4821, 9381]) {
    for (const regime of ['soft', 'flat', 'upswing']) {
      const policies = Object.fromEntries(['default', 'matched', 'neglect', 'idle', 'reckless'].map(policy => [policy, campaign(seed, regime, policy)]));
      const label = `${seed}/${regime}`;
      assert.ok(average(policies.matched.scores) > average(policies.default.scores) + 8, `${label}: demand discipline should improve decisions`);
      assert.ok(average(policies.matched.scores) > average(policies.neglect.scores) + 8, `${label}: preserving capability should beat sustained neglect`);
      assert.ok(policies.idle.scores.every(score => score < 60), `${label}: selling nothing must not pass`);
      assert.ok(policies.reckless.scores.every(score => score < 60), `${label}: max spending must not buy a grade`);
      assert.ok(Math.min(...policies.matched.scores) < 70, `${label}: a weak opening opportunity should remain visible`);
      assert.ok(Math.max(...policies.matched.scores) > Math.min(...policies.matched.scores) + 15, `${label}: improving business conditions should matter`);
      assert.equal(policies.idle.state.status, 'dismissed', label);
      assert.equal(policies.reckless.state.status, 'distressed', label);
    }
  }
});

test('funded improvements can earn an A through stronger capabilities and profitable service over a full tenure', () => {
  let state = initial();
  const reviews = [];
  while (state.status === 'active') {
    const base = { ...defaultPlan(state), quality: 1.7, training: 1, maintenance: 1.1, rd: 1.5 };
    for (const product of PRODUCTS) base[`${product.id}Price`] = Math.round(product.basePrice * 1.04);
    const plan = getPlanCoaching(state, base).alternatives.find(option => option.id === 'match-demand').plan;
    const review = getPlanCoaching(state, plan);
    reviews.push(review);
    state = advanceMonth(state, plan).state;
  }
  assert.equal(state.status, 'completed');
  const excellent = reviews.filter(review => review.grade === 'A');
  assert.ok(excellent.length > 0, 'The rubric must allow earned A grades, rather than impose a ceiling.');
  assert.ok(excellent.every(review => review.alternatives[0].forecast.operatingProfit > 0));
  assert.ok(average(reviews.slice(24).map(review => review.score)) > average(reviews.slice(0, 12).map(review => review.score)) + 5);
});

test('forecast grades are seed-blind, visits earn no points, and new decision fields survive every alternative', () => {
  const one = initial(17);
  const two = initial(9381);
  const plan = { ...defaultPlan(one), supplierSupport: 1.2, dealerSupport: 0.8 };
  const preview = getPlanCoaching(one, plan);
  assert.deepEqual(preview, getPlanCoaching(two, plan));
  let visited = one;
  for (const advisor of ADVISORS) visited = visitAdvisor(visited, advisor.id);
  assert.deepEqual(getPlanCoaching(visited, plan), preview, 'Information helps choices, not attendance points.');
  for (const option of preview.alternatives) {
    assert.equal(validatePlan(option.plan, one).valid, true);
    assert.ok(Number.isFinite(option.plan.supplierSupport));
    assert.ok(Number.isFinite(option.plan.dealerSupport));
  }
  const ending = advanceMonth(visited, plan).state;
  const historical = getMonthlyCoaching(ending);
  assert.equal(historical.available, true, historical.reason);
  assert.equal(historical.score, preview.score);
  assert.match(historical.methodology, /Spending, new capacity, borrowed cash and advisor attendance earn no points/);
});

test('idle borrowed cash and unused factory capacity cannot purchase decision points', () => {
  const opening = initial();
  const plan = defaultPlan(opening);
  const base = getPlanCoaching(opening, plan);
  assert.deepEqual(getPlanCoaching(opening, { ...plan, debtChange: 40 }).components, base.components);
  const expansion = getPlanCoaching(opening, { ...plan, capex: 20 });
  assert.ok(expansion.score <= base.score);
  assert.equal(expansion.components.find(component => component.id === 'capability').absoluteScore,
    base.components.find(component => component.id === 'capability').absoluteScore,
    'Unused nameplate capacity is not evidence of improved operating capability.');
  const excessive = getPlanCoaching(opening, { ...plan, quality: 5, training: 3, maintenance: 4, rd: 7 });
  assert.ok(excessive.score < base.score, 'Up-front expense still has to be justified by its outcomes.');
});

test('cash deficits and insolvency impose disclosed guardrails with reconciling component totals', () => {
  const opening = initial();
  opening.cash -= 120;
  opening.equity -= 120;
  const preview = getPlanCoaching(opening, defaultPlan(opening));
  assert.equal(preview.available, true, preview.reason);
  assert.ok(preview.alternatives[0].forecast.cash < 0);
  assert.ok(preview.score <= 59);
  assert.equal(preview.alternatives[0].guardrail.maximum, 59);
  assert.equal(Math.round(sum(preview.components.map(component => component.score))), preview.score);
  const repair = getPlanCoaching(opening, { ...defaultPlan(opening), debtChange: 40 });
  assert.ok(repair.alternatives[0].forecast.cash > 0);
  assert.ok(repair.score > preview.score, 'A draw that prevents an actual cash emergency can legitimately help.');
});
