import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS, advanceMonth, balanceSheet, createInitialState, defaultPlan, forecast, validateState,
} from '../src/simulation.js';
import { getBoardDashboard, getBoardMandate, getBoardReview } from '../src/board-mandate.js';
import { getMarketIntelligence, projectBusiness } from '../src/business-intelligence.js';
import { getInvestmentOptions } from '../src/investments.js';
import { getMonthlyBalanceSheet } from '../src/financial-learning.js';
import { exportSave, parseSave } from '../src/persistence.js';

const initial = (difficulty = 'medium', campaignMonths = 36) => createInitialState(4821, { marketRegime: 'flat', campaignMonths, difficulty });
const idlePlan = state => ({ ...defaultPlan(state), tractorProduction: 0, harvesterProduction: 0, loaderProduction: 0,
  marketing: 0, quality: 0, maintenance: 0, training: 0, rd: 0 });
function matchedPlan(state) {
  const plan = { ...defaultPlan(state), quality: 1.5, maintenance: 1.2, training: 0.8, partsBuffer: 5 };
  const expected = forecast(state, plan);
  for (const product of PRODUCTS) {
    const flow = expected.report.products.find(candidate => candidate.id === product.id);
    plan[`${product.id}Production`] = Math.min(Math.ceil(product.capacity * 1.4), Math.max(0,
      Math.ceil(flow.dealerOrders + 8 - state.products[product.id].finishedGoods)));
  }
  return plan;
}

test('executive campaigns announce their actual horizon and keep board history reproducible with a consultation journal', () => {
  for (const horizon of [12, 36]) {
    let state = initial('medium', horizon);
    state.ceoJournal = [{ month: 1, visited: ['cfo'] }];
    const mandate = getBoardMandate(state);
    assert.equal(mandate.retrospective, false);
    assert.equal(mandate.monthlyGoals.length, horizon);
    const plan = { ...matchedPlan(state), supplierSupport: 0.5, dealerSupport: 0.4 };
    state = advanceMonth(state, plan).state;
    const review = getBoardReview(state);
    assert.equal(review.available, true, review.reason);
    assert.equal(review.month, 1);
    assert.deepEqual(getBoardMandate(state), mandate, 'consultations and actual events cannot move the announced goals');
    assert.equal(getMonthlyBalanceSheet(state).available, true);
    const saved = parseSave(exportSave({ state, plan: defaultPlan(state), drafts: [], settings: {} }));
    assert.deepEqual(saved.state, state);
    assert.deepEqual(getBoardReview(saved.state), review);
  }
});

test('financial projections stop at projected dismissal without changing actual employment', () => {
  const state = initial('difficult');
  const before = structuredClone(state);
  const projection = projectBusiness(state, idlePlan(state), 12);
  assert.equal(projection.stopReason, 'dismissal');
  assert.ok(projection.months.length < 12);
  assert.equal(projection.months.at(-1).status, 'dismissed');
  assert.ok(projection.months.every((entry, index) => entry.month === index + 1));
  assert.ok(projection.warnings.some(warning => warning.id === 'projected-dismissal'));
  assert.deepEqual(state, before, 'planning cannot add actual performance strikes');
  for (const month of projection.months) {
    assert.ok(Math.abs(month.balanceSheet.assets - month.balanceSheet.liabilities - month.balanceSheet.equity) < 1e-6);
  }
});

test('investment alternatives compare the same elapsed months when CEO dismissal ends a scenario early', () => {
  const state = initial('difficult');
  const before = structuredClone(state);
  const options = getInvestmentOptions(state, idlePlan(state), 12);
  const enabled = options.options.filter(option => option.enabled);
  assert.equal(options.truncated, true);
  assert.ok(options.warnings.some(warning => warning.id === 'projected-dismissal'));
  assert.match(options.comparisonNote, /dismissal/);
  assert.equal(options.comparisonMonths, Math.min(...enabled.map(option => option.months.length)));
  for (const option of enabled) {
    assert.equal(option.comparison.months, options.comparisonMonths);
    assert.equal(option.comparison.endingMonth, options.comparisonEndMonth);
    assert.equal(option.comparison.selected.toMonth, option.comparison.baseline.toMonth);
  }
  assert.deepEqual(state, before);
});

test('dismissal preserves actual statements, board reviews and market history while closing future decisions', () => {
  let state = initial('difficult');
  while (state.status === 'active') state = advanceMonth(state, idlePlan(state)).state;
  assert.equal(state.status, 'dismissed');
  assert.ok(state.cash > 0, 'operational dismissal is distinct from financial insolvency');
  assert.equal(validateState(state).valid, true);
  const dashboard = getBoardDashboard(state, defaultPlan(state));
  assert.equal(dashboard.current.available, true, dashboard.current.reason);
  assert.match(dashboard.current.message, /ended your tenure/);
  assert.equal(dashboard.next, null);
  assert.equal(dashboard.nextQuarter, null);
  assert.equal(dashboard.history.length, state.month);
  assert.ok(dashboard.history.every(review => review.available));
  assert.equal(projectBusiness(state, null, 12).stopReason, 'campaign-ended');
  assert.equal(getInvestmentOptions(state, null, 6).available, false);
  assert.equal(getMarketIntelligence(state).next, null);
  const statement = getMonthlyBalanceSheet(state, state.month);
  assert.equal(statement.available, true);
  assert.ok(Math.abs(statement.reconciliation) < 1e-6);
  assert.equal(statement.rows.find(row => row.key === 'cash').closing, balanceSheet(state).cash);
});

test('a demand-led executive campaign can complete all three years with meaningful grade differences from neglect', () => {
  let state = initial('medium');
  const scores = [];
  while (state.status === 'active') {
    state = advanceMonth(state, matchedPlan(state)).state;
    const review = getBoardReview(state);
    assert.equal(review.available, true, review.reason);
    scores.push(review.score);
  }
  assert.equal(state.status, 'completed');
  assert.equal(state.month, 36);
  assert.equal(state.employment.strikes, 0);
  assert.ok(Math.min(...scores) < 70, 'a sustainable strategy should not automatically receive eighty or more');
  assert.ok(Math.max(...scores) - Math.min(...scores) >= 15, 'changed operating performance should produce a useful grade range');
  let neglected = initial('medium');
  while (neglected.status === 'active') neglected = advanceMonth(neglected, idlePlan(neglected)).state;
  assert.equal(neglected.status, 'dismissed');
  assert.ok(getBoardReview(neglected).score < scores.at(-1));
});
