import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createInitialState, defaultPlan, forecast, advanceMonth } from '../src/simulation.js';
import { projectBusiness } from '../src/business-intelligence.js';
import { getFinancingInsights, getMonthlyBalanceSheet, getInvestmentExplanation } from '../src/financial-learning.js';
import { financingInsightsHTML, monthlyBalanceSheetHTML, investmentExplanationHTML } from '../src/financial-learning-views.js';

const sum = values => values.reduce((total, value) => total + value, 0);
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should equal ${expected}`); }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function complete(state, months) { for (let index = 0; index < months; index += 1) state = advanceMonth(state, defaultPlan(state)).state; return state; }

test('7.25% means neutral customer demand and keeps corporate and matched funding rates separate', () => {
  const state = createInitialState(), plan = defaultPlan(state);
  const result = getFinancingInsights(state, plan);
  assert.equal(result.selected.apr, 7.25);
  assert.equal(result.selected.demandMultiplier, 1);
  assert.equal(result.selected.financedRetailShare, .32);
  assert.equal(result.rules.corporateFundingApr, 7.5);
  assert.equal(result.rules.customerFinanceFundingApr, 5.5);
  close(result.current.nextCorporateInterestExpense, 80 * .075 / 12);
  close(result.current.nextFinanceInterestExpense, 96 * .055 / 12);
  close(result.selected.firstInterestOn100k, 604.1666666666666);
  close(result.selected.scheduledPrincipalOn100k, 100000 / 24);
  assert.equal(result.selected.firstNewLoanInterestMonth, 2);
});

test('APR alternatives exactly reconcile to the engine over the same forecast horizon', () => {
  const state = createInitialState(841, { marketRegime: 'upswing' });
  const plan = { ...defaultPlan(state), capex: 4, debtChange: 15 };
  const result = getFinancingInsights(state, plan);
  assert.equal(result.comparisonMonths, 6);
  assert.deepEqual(result.options.map(option => option.apr), [7.25, 6.25, 8.25]);
  for (const option of result.options) {
    const expected = projectBusiness(state, { ...plan, financingApr: option.apr }, 6);
    const first = expected.months[0].report;
    close(option.next.newLending, first.financing.newLending);
    close(option.next.financeFunding, first.financing.fundingChange);
    close(option.next.cash, first.balanceSheet.cash);
    close(option.totalProfit, sum(expected.months.map(month => month.report.income.profit)));
    close(option.totalInterestIncome, sum(expected.months.map(month => month.report.income.loanInterestIncome)));
    close(option.endingLoanBook, expected.ending.loanBook);
    close(option.endingFinanceDebt, expected.ending.financeDebt);
    assert.equal(option.next.retailSales, first.metrics.retailSales);
    assert.equal(option.next.expectedDemand, sum(first.products.map(product => product.expectedDemand)));
  }
  assert.ok(Object.values(result.options[0].delta).every(value => value === 0));
});

test('changing new-loan APR does not reprice existing loans or next-month interest', () => {
  let state = createInitialState();
  state = advanceMonth(state, { ...defaultPlan(state), financingApr: 11 }).state;
  const result = getFinancingInsights(state, { ...defaultPlan(state), financingApr: 5 });
  const nextInterest = sum(state.loanCohorts.map(cohort => cohort.balance * cohort.apr / 1200));
  for (const option of result.options) close(option.next.interestIncome, nextInterest);
  assert.ok(result.current.weightedLoanApr > 7.25);
  assert.ok(result.options.some(option => Math.abs(option.totalInterestIncome - result.options[0].totalInterestIncome) > .001));
  assert.equal(state.loanCohorts.at(-1).apr, 11);
});

test('new lending uses 80% of price and 80% matched funding without treating principal as income', () => {
  const state = createInitialState(), plan = defaultPlan(state);
  const data = getFinancingInsights(state, plan);
  const expected = forecast(state, plan).report;
  const principal = sum(expected.products.map(product => product.retailSales * product.price / 1000 * .32 * .8));
  close(data.options[0].next.newLending, principal);
  close(data.options[0].next.newLoanMatchedFunding, principal * .8);
  close(data.options[0].next.newLoanCompanyFunding, principal * .2);
  close(data.options[0].next.financeFunding, expected.balanceSheet.financeDebt - state.financeDebt);
  assert.notEqual(data.options[0].next.financeFunding, data.options[0].next.newLoanMatchedFunding, 'net funding also amortizes older loans');
  close(expected.income.revenue, expected.income.wholesaleRevenue + data.options[0].next.interestIncome);
});

test('rate comparisons honor bounds without repeated identical choices', () => {
  const state = createInitialState(), plan = defaultPlan(state);
  assert.deepEqual(getFinancingInsights(state, { ...plan, financingApr: 2 }).options.map(option => option.apr), [2, 3]);
  assert.deepEqual(getFinancingInsights(state, { ...plan, financingApr: 14 }).options.map(option => option.apr), [14, 13]);
  close(getFinancingInsights(state, { ...plan, financingApr: 2 }).selected.financedRetailShare, .3935);
  close(getFinancingInsights(state, { ...plan, financingApr: 14 }).selected.demandMultiplier, .919);
});

test('invalid plans and ended campaigns expose current accounts without inventing forecasts', () => {
  const state = createInitialState();
  const invalid = getFinancingInsights(state, { ...defaultPlan(state), financingApr: NaN });
  assert.equal(invalid.status, 'invalid-plan');
  assert.equal(invalid.current.loanBook, state.loanBook);
  assert.equal(invalid.options.length, 0);
  const ended = complete(state, 12);
  assert.equal(getFinancingInsights(ended, defaultPlan(ended)).status, 'current-only');
  assert.equal(getFinancingInsights(ended, defaultPlan(ended)).options.length, 0);
  assert.match(financingInsightsHTML(ended, defaultPlan(ended)), /Current loan book remains visible/);
  assert.equal(getMonthlyBalanceSheet(state).available, false);
  assert.equal(getMonthlyBalanceSheet(ended, 13).available, false);
});

test('each balance-sheet movement uses the selected historical month with explicit context', () => {
  const state = complete(createInitialState(), 3);
  const data = getMonthlyBalanceSheet(state, 1), report = state.history[0];
  assert.equal(data.month, 1);
  for (const row of data.rows) {
    close(row.opening, report.openingBalanceSheet[row.key]);
    close(row.closing, report.balanceSheet[row.key]);
    close(row.delta, row.closing - row.opening);
    assert.ok(row.context.length > 20);
  }
  close(data.reconciliation, 0);
  close(data.equityChange, report.income.profit);
  assert.equal(data.rows.find(row => row.key === 'inventory').tone, 'neutral');
  assert.equal(data.rows.find(row => row.key === 'receivables').tone, 'neutral');
  assert.equal(data.rows.find(row => row.key === 'warrantyReserve').tone, 'neutral');
  assert.equal(data.rows.find(row => row.key === 'fixedAssets').tone, 'neutral');
  assert.equal(data.rows.find(row => row.key === 'liabilities').tone, 'neutral');
});

test('projected histories cannot masquerade as actual monthly financial statements', () => {
  const initial = createInitialState();
  const projected = forecast(initial, defaultPlan(initial)).state;
  assert.equal(getMonthlyBalanceSheet(projected, 1).available, false);
  assert.match(monthlyBalanceSheetHTML(projected, 1), /This month is a projection/);
  assert.doesNotMatch(monthlyBalanceSheetHTML(projected, 1), /Actual closing accounts|data-balance-row=/);
  for (const flag of ['isForecast', 'forecast']) {
    const state = advanceMonth(initial, defaultPlan(initial)).state;
    state.history[0][flag] = true;
    assert.equal(getMonthlyBalanceSheet(state, 1).available, false, `${flag} must prevent an actual statement`);
  }
});

test('borrowing increases cash and debt but does not create profit or equity', () => {
  const opening = createInitialState();
  const base = advanceMonth(opening, defaultPlan(opening)).state;
  const borrowed = advanceMonth(opening, { ...defaultPlan(opening), debtChange: 10 }).state;
  const data = getMonthlyBalanceSheet(borrowed, 1);
  const debt = data.rows.find(row => row.key === 'corporateDebt');
  assert.equal(debt.delta, 10);
  assert.equal(debt.tone, 'negative');
  assert.equal(debt.movement, 'Increased');
  close(borrowed.cash - base.cash, 10);
  close(borrowed.equity - base.equity, 0);
  close(data.equityChange, data.income.profit);
  const cash = data.cashFlow;
  close(cash.opening + cash.operating + cash.loanPrincipalCollections - cash.newLending - cash.capex + cash.corporateBorrowing + cash.financeFunding, cash.closing);
});

test('full balance-sheet HTML includes all accounts, accessible change words and actual income/cash bridge', () => {
  const initial = createInitialState();
  const state = advanceMonth(initial, { ...defaultPlan(initial), debtChange: -10 }).state;
  const html = monthlyBalanceSheetHTML(state, 1);
  const { document } = parseHTML('<html><body>' + html + '</body></html>');
  assert.equal(document.querySelectorAll('[data-balance-row]').length, 13);
  assert.equal(document.querySelector('[data-balance-row="corporateDebt"] [data-balance-change]').className, 'financial-positive');
  assert.match(document.querySelector('[data-balance-row="corporateDebt"] [data-balance-change]').textContent, /Decreased/);
  assert.equal(document.querySelector('[data-balance-row="inventory"] [data-balance-change]').className, 'financial-neutral');
  assert.ok(document.querySelector('[data-monthly-income]'));
  assert.ok(document.querySelector('[data-monthly-cash-bridge]'));
  assert.match(document.querySelector('[data-balance-reconciliation]').textContent, /\$0\.000m/);
  assert.match(html, /borrowing does not/);
});

test('capacity and engineering explanations retain project delay and expense versus asset distinction', () => {
  const state = createInitialState(), plan = { ...defaultPlan(state), capex: 8, rd: 3 };
  const data = getInvestmentExplanation(state, plan);
  assert.equal(data.proposed.decisionMonth, 1);
  assert.equal(data.proposed.benefitMonth, 4);
  close(data.proposed.capacityBonusIncrement, .032);
  close(data.proposed.engineeringIndexIncrementBeforeDecayAndCaps, .021);
  const next = advanceMonth(state, plan).state;
  const pipeline = getInvestmentExplanation(next, defaultPlan(next)).pipeline;
  assert.equal(pipeline.length, 2);
  assert.ok(pipeline.every(project => project.benefitMonth === 4));
  const html = investmentExplanationHTML(state, plan);
  assert.match(html, /January · Year 1 first affects operating capability in April · Year 1/);
  assert.match(html, /Cash falls and fixed assets rise immediately/);
  assert.match(parseHTML('<html><body>' + html + '</body></html>').document.body.textContent, /no separate capitalized R&D asset/);
});

test('capacity explanation respects funded projects, capacity caps and final-month maturity', () => {
  const state = createInitialState();
  state.capacityBonus = .38;
  state.capexPipeline = [{ amount: 4, remaining: 1 }];
  const data = getInvestmentExplanation(state, { ...defaultPlan(state), capex: 8 });
  close(data.proposed.capacityBonusIncrement, .004);
  assert.equal(data.pipeline[0].benefitMonth, 1);
  const late = complete(createInitialState(), 10);
  const afterEnd = getInvestmentExplanation(late, { ...defaultPlan(late), capex: 5 });
  assert.equal(afterEnd.proposed.benefitMonth, 14);
  assert.equal(afterEnd.proposed.benefitsWithinCampaign, false);
  assert.match(investmentExplanationHTML(late, { ...defaultPlan(late), capex: 5 }), /Completion falls after this campaign/);
});

test('learning views and forecast comparisons never mutate live plans, saves or history', () => {
  const state = freeze(complete(createInitialState(100, { marketRegime: 'soft' }), 2));
  const plan = freeze(defaultPlan(state));
  const before = JSON.stringify({ state, plan });
  assert.match(financingInsightsHTML(state, plan), /data-financing-projection/);
  assert.match(monthlyBalanceSheetHTML(state, 1), /data-monthly-balance-sheet="1"/);
  assert.match(investmentExplanationHTML(state, plan), /data-investment-guide/);
  assert.equal(JSON.stringify({ state, plan }), before);
});

test('financing comparisons stop at the same month if a policy leads to early distress', () => {
  const state = createInitialState();
  const plan = { ...defaultPlan(state), marketing: 8, quality: 5, training: 3, maintenance: 4, rd: 7, capex: 20, tractorProduction: 364, harvesterProduction: 133, loaderProduction: 252 };
  const data = getFinancingInsights(state, plan);
  assert.ok(data.options.some(option => option.stopReason === 'distress'));
  assert.ok(data.comparisonMonths < 6);
  assert.ok(data.options.every(option => option.months === data.comparisonMonths && option.endMonth === data.comparisonEndMonth));
});

test('three-year financing views and project timing continue over the first annual boundary', () => {
  const state = complete(createInitialState(77, { campaignMonths: 36, marketRegime: 'upswing' }), 12);
  assert.equal(state.status, 'active');
  const data = getFinancingInsights(state, defaultPlan(state));
  assert.equal(data.forecastMonth, 13);
  assert.ok(data.comparisonMonths > 0 && data.comparisonMonths <= 6);
  assert.equal(data.comparisonEndMonth, 12 + data.comparisonMonths);
  const investment = getInvestmentExplanation(state, { ...defaultPlan(state), capex: 5 });
  assert.equal(investment.proposed.benefitMonth, 16);
  assert.equal(investment.proposed.benefitsWithinCampaign, true);
  assert.match(financingInsightsHTML(state, defaultPlan(state)), /January · Year 2/);
  assert.match(investmentExplanationHTML(state, { ...defaultPlan(state), capex: 5 }), /April · Year 2/);
});
