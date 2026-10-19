import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createInitialState, defaultPlan, advanceMonth, forecast, validatePlan, getCampaignOutcome, PRODUCTS } from '../src/simulation.js';
import { getMarketIntelligence } from '../src/business-intelligence.js';
import { getStrategyAdviser, getHistoricalStrategyReview, STRATEGY_OBJECTIVES } from '../src/strategy-adviser.js';
import { strategyAdviserHTML } from '../src/strategy-adviser-views.js';
import { visitAdvisor } from '../src/executive-intelligence.js';

const advisors = ['cfo', 'sales', 'strategy', 'operations', 'quality', 'supply'];
const allBriefed = state => ({ ...state, ceoJournal: [{ month: state.month + 1, visited: advisors }] });
const option = (data, id) => data.candidates.find(candidate => candidate.id === id);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);
const copy = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('prepared strategies unlock through current-month consultations, not prior or future visits', () => {
  const fresh = createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36 });
  const plan = defaultPlan(fresh);
  const unbriefed = getStrategyAdviser(fresh, plan);
  assert.deepEqual(unbriefed.candidates.map(candidate => candidate.id), ['chosen', 'steady']);
  assert.equal(unbriefed.lockedFamilies.length, 6);
  const state = { ...fresh, ceoJournal: [{ month: 1, visited: ['operations', 'operations'] }, { month: 2, visited: advisors }] };
  const data = getStrategyAdviser(state, plan);
  assert.deepEqual(data.consulted, ['operations']);
  assert.ok(option(data, 'capacity'));
  assert.equal(option(data, 'technology'), undefined);
  assert.deepEqual(option(data, 'chosen').summary, option(unbriefed, 'chosen').summary, 'consultations cannot award financial benefits');
});

test('each colleague adds a relevant experiment, and a coordinated plan requires three functions', () => {
  const state = allBriefed(createInitialState());
  const data = getStrategyAdviser(state, defaultPlan(state));
  for (const id of ['protect-cash', 'match-demand', 'technology', 'capacity', 'quality-delivery', 'reliable-flow', 'balanced']) assert.ok(option(data, id));
  assert.equal(data.lockedFamilies.length, 0);
  const partial = { ...state, ceoJournal: [{ month: 1, visited: ['cfo', 'sales'] }] };
  assert.equal(option(getStrategyAdviser(partial, defaultPlan(partial)), 'balanced'), undefined);
});

test('candidate plans stay feasible and each declared change matches its first-month plan', () => {
  const state = allBriefed(createInitialState());
  const plan = { ...defaultPlan(state), debtChange: 40, capex: 20, tractorPrice: 191, training: 3, quality: 5, rd: 7 };
  const data = getStrategyAdviser(state, plan);
  for (const candidate of data.candidates) {
    assert.ok(validatePlan(candidate.plan, state).valid);
    assert.equal(candidate.plan.debtChange <= 40, true);
    const changed = Object.keys(plan).filter(key => Math.abs(candidate.plan[key] - plan[key]) > 1e-8).sort();
    assert.deepEqual(candidate.changes.map(change => change.key).sort(), changed);
    assert.deepEqual(candidate.path[0].plan, candidate.plan);
    assert.ok(Number.isFinite(candidate.score));
    assert.ok(Object.values(candidate.summary).every(value => typeof value !== 'number' || Number.isFinite(value)));
  }
});

test('new capital and credit apply once; all recurring policy numbers repeat without hidden rescue', () => {
  const state = allBriefed(createInitialState(12, { marketRegime: 'flat', campaignMonths: 36 }));
  const plan = { ...defaultPlan(state), capex: 5, debtChange: 8 };
  const data = getStrategyAdviser(state, plan);
  assert.equal(data.horizonRequested, 6);
  assert.equal(data.comparisonMonths, 6);
  for (const candidate of data.candidates) {
    assert.equal(candidate.path.length, 6);
    for (const path of candidate.path.slice(1)) {
      assert.equal(path.plan.capex, 0);
      assert.equal(path.plan.debtChange, 0);
      for (const key of Object.keys(candidate.plan).filter(key => !['capex', 'debtChange'].includes(key) && !key.endsWith('Production'))) assert.equal(path.plan[key], candidate.plan[key]);
    }
  }
  assert.ok(option(data, 'match-demand').path.some(path => path.plan.tractorProduction !== option(data, 'match-demand').plan.tractorProduction), 'adaptive strategies reschedule future output using public forecasts');
  assert.ok(option(data, 'chosen').path.every(path => path.plan.tractorProduction === plan.tractorProduction), 'the submitted plan retains its chosen targets');
});

test('comparison metrics reconcile to sequential expected forecasts and the public market denominator', () => {
  const state = allBriefed(createInitialState());
  const plan = defaultPlan(state);
  const data = getStrategyAdviser(state, plan);
  const market = getMarketIntelligence(state);
  const selected = option(data, 'chosen');
  let next = state;
  const results = [];
  for (let i = 0; i < data.comparisonMonths; i += 1) {
    const result = forecast(next, i ? { ...plan, capex: 0, debtChange: 0 } : plan);
    results.push(result);
    next = result.state;
  }
  const flows = results.flatMap(result => result.report.products);
  close(selected.summary.valueCreated, getCampaignOutcome(next).adjustedEquity - getCampaignOutcome(state).adjustedEquity);
  close(selected.summary.minimumLiquidity, Math.min(...[state, ...results.map(result => result.state)].map(position => position.cash + 160 - position.corporateDebt)));
  close(selected.summary.service, flows.reduce((sum, flow) => sum + flow.deliveries, 0) / flows.reduce((sum, flow) => sum + flow.dealerOrders, 0));
  close(selected.summary.quality, 1 - flows.reduce((sum, flow) => sum + flow.defects, 0) / flows.reduce((sum, flow) => sum + flow.assembled, 0));
  close(selected.summary.share, results.at(-1).report.metrics.retailSales / market.timeline[next.month - 1].units);
  close(selected.summary.technology, PRODUCTS.reduce((sum, product) => sum + next.products[product.id].technology, 0) / 3);
});

test('objectives transparently change weights and never manufacture a universal optimum or grade', () => {
  const state = allBriefed(createInitialState(55, { marketRegime: 'upswing', campaignMonths: 36 }));
  const plan = defaultPlan(state);
  const selections = STRATEGY_OBJECTIVES.map(objective => getStrategyAdviser(state, plan, { objective: objective.id }));
  for (const data of selections) {
    assert.equal(data.bestId, [...data.candidates].sort((a, b) => b.score - a.score)[0].id);
    assert.equal(data.title, 'Best tested with current information');
    close(Object.values(data.objective.weights).reduce((sum, value) => sum + value, 0), 1);
    assert.equal(Object.hasOwn(data, 'grade'), false);
    assert.match(data.methodology.join(' '), /not a global optimum/);
  }
  assert.notEqual(option(selections[0], 'technology').score, option(selections[1], 'technology').score);
  assert.deepEqual(selections[0].candidates.map(candidate => candidate.summary), selections[1].candidates.map(candidate => candidate.summary), 'objectives change priorities, not the modeled financial path');
  assert.throws(() => getStrategyAdviser(state, plan, { objective: 'win' }), /objective/);
  const executive = allBriefed(createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36, difficulty: 'medium' }));
  assert.notEqual(getStrategyAdviser(executive, defaultPlan(executive), { objective: 'growth' }).bestId,
    getStrategyAdviser(executive, defaultPlan(executive), { objective: 'resilience' }).bestId,
    'growth and resilience priorities can rationally favor different feasible policies');
});

test('forecast ranking is seed-blind for the same public scenario and immutable', () => {
  const state = allBriefed(createInitialState(123, { marketRegime: 'soft', campaignMonths: 36 }));
  const plan = defaultPlan(state);
  const before = copy({ state, plan });
  const data = getStrategyAdviser(freeze(state), freeze(plan));
  assert.deepEqual({ state, plan }, before);
  assert.deepEqual(getStrategyAdviser({ ...before.state, seed: 9876 }, before.plan), data);
  data.candidates[0].plan.training = 0;
  assert.equal(plan.training, before.plan.training);
});

test('late campaign strategy comparisons expose investment lead time and stop at campaign end', () => {
  let state = createInitialState();
  for (let i = 0; i < 10; i += 1) state = advanceMonth(state, defaultPlan(state)).state;
  state = allBriefed(state);
  const data = getStrategyAdviser(state, defaultPlan(state));
  assert.equal(data.horizonModeled, 2);
  assert.equal(data.comparisonEndMonth, 12);
  assert.ok(option(data, 'capacity').warnings.some(warning => /after this comparison/.test(warning)));
  assert.ok(option(data, 'technology').warnings.some(warning => /no technology effect/.test(warning)));
  assert.ok(data.warnings.some(warning => /shorter than/.test(warning)));
});

test('an early financial failure shortens metrics to common months and cannot win by avoiding later costs', () => {
  const state = allBriefed(createInitialState());
  const plan = { ...defaultPlan(state), tractorProduction: 364, harvesterProduction: 133, loaderProduction: 252, marketing: 8, quality: 5, training: 3, maintenance: 4, rd: 7, capex: 20 };
  const data = getStrategyAdviser(state, plan);
  assert.ok(data.comparisonMonths < 6);
  assert.equal(new Set(data.candidates.map(candidate => candidate.summary.months)).size, 1);
  assert.ok(option(data, 'chosen').failed);
  assert.ok(option(data, 'chosen').score < -900);
  assert.match(data.comparisonNote, /ends early/);
});

test('historical recommendation uses the opening information set; hindsight covers only the completed month', () => {
  let state = createInitialState(83, { marketRegime: 'flat', campaignMonths: 36 });
  const opening = { ...state, ceoJournal: [{ month: 1, visited: ['cfo', 'operations'] }] };
  const plan = defaultPlan(opening);
  const expected = getStrategyAdviser(opening, plan);
  state = advanceMonth(opening, plan).state;
  state = { ...state, ceoJournal: [...state.ceoJournal, { month: 2, visited: advisors }] };
  const reviewed = getHistoricalStrategyReview(state, 1);
  assert.equal(reviewed.available, true, reviewed.reason);
  assert.deepEqual(reviewed.adviser, expected);
  assert.deepEqual(reviewed.adviser.consulted, ['cfo', 'operations']);
  assert.equal(option(reviewed.adviser, 'technology'), undefined);
  assert.equal(reviewed.actual.summary.months, 1);
  close(reviewed.actual.summary.profit, state.history[0].income.profit);
  assert.ok(reviewed.alternatives.every(candidate => candidate.summary.endingMonth === 1));
  assert.equal(reviewed.expectedBest.id, expected.bestId);
  assert.match(reviewed.explanation, /different question/);
});

test('historical review rejects changed actuals and projections instead of inventing a comparison', () => {
  const initial = allBriefed(createInitialState());
  const actual = advanceMonth(initial, defaultPlan(initial)).state;
  const altered = copy(actual);
  altered.history[0].metrics.profit += 1;
  assert.equal(getHistoricalStrategyReview(altered, 1).available, false);
  const projected = forecast(initial, defaultPlan(initial)).state;
  assert.equal(getHistoricalStrategyReview(projected, 1).available, false);
  assert.equal(getHistoricalStrategyReview(actual, 2).available, false);
});

test('terminal campaigns offer historical review, and invalid active plans fail clearly', () => {
  let state = createInitialState();
  for (let i = 0; i < 12; i += 1) state = advanceMonth(state, defaultPlan(state)).state;
  assert.equal(getStrategyAdviser(state, defaultPlan(state)).available, false);
  assert.equal(getHistoricalStrategyReview(state, 12).available, true);
  const fresh = createInitialState();
  assert.throws(() => getStrategyAdviser(fresh, { ...defaultPlan(fresh), financingApr: NaN }), /Invalid operating plan/);
});

test('view renders explicit apply controls and meaningful expected metrics; historical view cannot apply', () => {
  const opening = allBriefed(createInitialState());
  const plan = defaultPlan(opening);
  const { document } = parseHTML(strategyAdviserHTML(opening, plan));
  assert.ok(document.querySelector('[data-strategy-adviser="current"]'));
  assert.ok(document.querySelector('[data-strategy-apply="capacity"]'));
  assert.equal(document.querySelectorAll('[data-strategy-objective]').length, 3);
  assert.match(document.querySelector('[data-strategy-adviser]').textContent, /Best tested with current information/);
  const actual = advanceMonth(opening, plan).state;
  const historical = parseHTML(strategyAdviserHTML(actual, defaultPlan(actual), 'balanced', 1)).document;
  assert.ok(historical.querySelector('[data-strategy-comparison="actual-month"]'));
  assert.equal(historical.querySelector('[data-strategy-apply]'), null);
  assert.ok(historical.querySelector('[data-strategy-history="1"]'));
});

test('executive strategies include both paid operational levers and preserve their recurring expense', () => {
  let state = createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36, difficulty: 'medium' });
  for (const id of advisors) state = visitAdvisor(state, id);
  const plan = defaultPlan(state);
  const data = getStrategyAdviser(state, plan);
  const supply = option(data, 'reliable-flow');
  const dealers = option(data, 'dealer-growth');
  assert.equal(supply.plan.supplierSupport, 1);
  assert.equal(dealers.plan.dealerSupport, 1);
  for (const [candidate, key] of [[supply, 'supplierSupport'], [dealers, 'dealerSupport']]) {
    assert.ok(candidate.changes.some(change => change.key === key && change.to === 1));
    assert.ok(candidate.path.every(row => row.plan[key] === 1));
    const expected = forecast(state, candidate.plan);
    assert.equal(expected.report.income[key], 1);
    assert.ok(validatePlan(candidate.plan, state).valid);
  }
});

test('visited executive campaigns replay employment and past consultations without using later meetings', () => {
  let state = createInitialState(4821, { marketRegime: 'flat', campaignMonths: 36, difficulty: 'medium' });
  state = visitAdvisor(visitAdvisor(state, 'cfo'), 'operations');
  state = advanceMonth(state, defaultPlan(state)).state;
  state = visitAdvisor(state, 'strategy');
  state = advanceMonth(state, defaultPlan(state)).state;
  for (const id of advisors) state = visitAdvisor(state, id);
  const first = getHistoricalStrategyReview(state, 1);
  const second = getHistoricalStrategyReview(state, 2);
  assert.equal(first.available, true, first.reason);
  assert.equal(second.available, true, second.reason);
  assert.deepEqual(first.adviser.consulted, ['cfo', 'operations']);
  assert.deepEqual(second.adviser.consulted, ['strategy']);
  assert.equal(option(first.adviser, 'dealer-growth'), undefined);
  assert.equal(option(second.adviser, 'capacity'), undefined);
  const current = getStrategyAdviser(state, defaultPlan(state));
  assert.equal(current.consulted.length, 6);
});
