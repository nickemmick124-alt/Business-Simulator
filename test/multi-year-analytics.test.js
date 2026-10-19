import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { PRODUCTS, createInitialState, defaultPlan, advanceMonth, forecast } from '../src/simulation.js';
import { getMarketIntelligence, projectBusiness } from '../src/business-intelligence.js';
import { getInvestmentOptions } from '../src/investments.js';
import { getFactoryDiagnostics, getCostLedger } from '../src/factory-diagnostics.js';
import { getMarketPosition } from '../src/market-position.js';
import { financeDetailHTML, marketDetailHTML, marketPanelHTML } from '../src/strategy-views.js';
import { economicsHTML } from '../src/learning-views.js';
import { factoryDiagnosticsHTML, costLedgerHTML, marketPositionHTML, investmentLabHTML } from '../src/operations-views.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} must equal ${expected}`);
const initial = () => createInitialState(81, { marketRegime: 'flat', campaignMonths: 36 });
const documentFor = html => parseHTML(`<html><body>${html}</body></html>`).document;

// A demand-matched policy keeps a real, replayable company solvent for the
// boundary tests. It uses only the public forecast available before each round.
function operatingPlan(state) {
  const plan = { ...defaultPlan(state), quality: 1.5, training: .6, maintenance: 1.1, rd: .6, marketing: 1.3, partsBuffer: 0 };
  for (const product of PRODUCTS) plan[`${product.id}Price`] = Math.round(product.basePrice * 1.08);
  const expected = forecast(state, plan).report;
  for (const product of expected.products) plan[`${product.id}Production`] = Math.max(0, product.dealerOrders - state.products[product.id].finishedGoods);
  return plan;
}

function through(month) {
  let state = initial();
  while (state.month < month && state.status === 'active') state = advanceMonth(state, operatingPlan(state)).state;
  assert.equal(state.month, month, 'fixture must reach the requested campaign month');
  return state;
}

test('three-year timeline keeps annual TAM scoped to the current or upcoming twelve-month year', () => {
  for (const [month, year, start, end] of [[0, 1, 1, 12], [12, 2, 13, 24], [24, 3, 25, 36], [36, 3, 25, 36]]) {
    const state = through(month);
    const market = getMarketIntelligence(state);
    assert.deepEqual(market.timeline.map(row => row.month), Array.from({ length: 36 }, (_, index) => index + 1));
    assert.deepEqual([market.annual.year, market.annual.startMonth, market.annual.endMonth], [year, start, end]);
    const yearRows = market.timeline.slice(start - 1, end);
    close(market.annual.units, sum(yearRows.map(row => row.units)));
    close(market.annual.value, sum(yearRows.map(row => row.value)));
    assert.ok(market.annual.units < sum(market.timeline.map(row => row.units)) / 2);
    for (const product of market.products) {
      close(product.annualUnits, sum(yearRows.map(row => row.products.find(item => item.id === product.id).units)));
    }
    close(market.annual.units, sum(market.products.map(product => product.annualUnits)));
  }
});

test('crossing a year boundary preserves observed market denominators and actual share history', () => {
  const december = through(12);
  const before = getMarketPosition(december, operatingPlan(december));
  const january = advanceMonth(december, operatingPlan(december)).state;
  const after = getMarketPosition(january, operatingPlan(january));
  assert.equal(before.aggregate.next.month, 13);
  assert.deepEqual(after.aggregate.history.slice(0, 12), before.aggregate.history);
  assert.deepEqual(getMarketIntelligence(january).timeline.slice(0, 12), getMarketIntelligence(december).timeline.slice(0, 12));
  const current = after.aggregate.current;
  const previous = after.aggregate.previous;
  close(current.unitShare, january.history.at(-1).metrics.retailSales / current.marketUnits);
  close(after.aggregate.changePP, current.unitShare - previous.unitShare);
  close(after.aggregate.retailGrowth, current.retailSales / previous.retailSales - 1);
});

test('numeric forecasts span elapsed months while year-end and campaign-end investments use distinct limits', () => {
  const state = through(10), plan = operatingPlan(state);
  const duration = projectBusiness(state, plan, 12);
  assert.equal(duration.horizonRequested, 12);
  assert.equal(duration.horizonAvailable, 26);
  assert.equal(duration.months.at(-1).month, 22);
  const year = getInvestmentOptions(state, plan, 'year-end');
  const campaign = getInvestmentOptions(state, plan, 'campaign-end');
  assert.deepEqual([year.horizonRequested, year.comparisonEndMonth], [2, 12]);
  assert.deepEqual([campaign.horizonRequested, campaign.comparisonEndMonth], [26, 36]);
  assert.ok(campaign.options.every(option => option.stopReason === 'campaign-end'));
  assert.equal(projectBusiness(state, plan, 36).stopReason, 'campaign-end');
  const yearView = documentFor(financeDetailHTML(state, plan, 12));
  const campaignView = documentFor(financeDetailHTML(state, plan, 36));
  assert.equal(yearView.querySelector('[data-projection-table="income"] thead').querySelectorAll('th').length, 4);
  assert.equal(campaignView.querySelector('[data-projection-table="income"] thead').querySelectorAll('th').length, 28);
  assert.ok(campaignView.querySelector('[data-horizon="36"][aria-pressed="true"]'));
});

test('November capacity and engineering can mature in February of year two with committed funding carried forward', () => {
  const state = through(10), plan = operatingPlan(state);
  const short = getInvestmentOptions(state, plan, 'year-end');
  const long = getInvestmentOptions(state, plan, 6);
  for (const id of ['capacity', 'engineering']) {
    const later = long.options.find(option => option.id === id);
    const earlier = short.options.find(option => option.id === id);
    assert.equal(later.timing.firstBenefitMonth, 14);
    assert.equal(later.timing.withinCampaign, true);
    assert.equal(later.timing.observedFirstCapabilityBenefitMonth, 14);
    assert.equal(earlier.timing.benefitWithinComparison, false);
    assert.equal(later.timing.benefitWithinComparison, true);
    assert.ok(later.comparison.monthly.filter(row => row.month < 14).every(row => row.delta[id === 'capacity' ? 'capacityBonus' : 'technology'] === 0));
  }
  const funded = advanceMonth(state, { ...plan, capex: 8 }).state;
  const pipeline = getInvestmentOptions(funded, operatingPlan(funded), 6).pipeline.find(project => project.kind === 'capacity');
  assert.deepEqual([pipeline.firstBenefitMonth, pipeline.withinCampaign], [14, true]);
  const view = investmentLabHTML(funded, operatingPlan(funded), 6);
  assert.match(view, /February · Year 2/);
  assert.doesNotMatch(view, /after this campaign/);
});

test('factory, cost and market tools remain actionable after the first year and reconcile forecast inventory', () => {
  const state = through(12), plan = operatingPlan(state);
  const expected = forecast(state, plan);
  const factory = getFactoryDiagnostics(state, plan);
  const cost = getCostLedger(state, plan);
  const market = getMarketPosition(state, plan);
  assert.equal(factory.forecastMonth, 13);
  assert.equal(cost.forecastMonth, 13);
  close(cost.inventory.forecastM, expected.report.balanceSheet.inventory);
  assert.equal(market.aggregate.next.month, 13);
  close(market.aggregate.next.expectedUnitShare, expected.report.metrics.retailSales / market.aggregate.next.marketUnits);
  for (const view of [factoryDiagnosticsHTML(state, plan), costLedgerHTML(state, plan), marketPositionHTML(state, plan), economicsHTML(state, plan)]) {
    assert.match(view, /January · Year 2/);
    assert.doesNotMatch(view, /undefined|NaN|Campaign ended/);
  }
});

test('extended forecasts remain seed blind and never mutate the live campaign or plan', () => {
  const state = through(10), plan = operatingPlan(state);
  const before = JSON.stringify({ state, plan });
  const anotherSeed = { ...structuredClone(state), seed: 592167 };
  assert.deepEqual(getMarketIntelligence(anotherSeed, plan), getMarketIntelligence(state, plan));
  assert.deepEqual(projectBusiness(anotherSeed, plan, 26), projectBusiness(state, plan, 26));
  assert.deepEqual(getInvestmentOptions(anotherSeed, plan, 6), getInvestmentOptions(state, plan, 6));
  assert.equal(JSON.stringify({ state, plan }), before);
});

test('multi-year share charts keep all history inside the viewport with readable sparse date labels', () => {
  const state = through(35), plan = operatingPlan(state);
  const document = documentFor(marketPositionHTML(state, plan));
  const circles = [...document.querySelectorAll('.share-chart circle')];
  assert.equal(circles.length, 36);
  assert.ok(circles.every(circle => Number(circle.getAttribute('cx')) >= 30 && Number(circle.getAttribute('cx')) <= 610));
  assert.equal(document.querySelectorAll('[data-share-history] tbody tr').length, 36);
  assert.ok(document.querySelectorAll('.share-chart text').length <= 22);
  assert.match(marketPanelHTML(state, plan), /Year 03 addressable market/);
  assert.match(marketDetailHTML(state, plan), /The market through Year 03/);
  assert.equal(documentFor(marketDetailHTML(state, plan)).querySelectorAll('[data-market-timeline] tbody tr').length, 36);
});

test('three-year completion retains final-year context without creating another operating month', () => {
  const state = through(36);
  assert.equal(state.status, 'completed');
  assert.equal(getMarketIntelligence(state).annual.year, 3);
  assert.equal(getMarketIntelligence(state).next, null);
  assert.equal(getMarketPosition(state).aggregate.current.month, 36);
  assert.equal(getMarketPosition(state).aggregate.next, null);
  assert.equal(getFactoryDiagnostics(state).forecastMonth, null);
  assert.equal(getInvestmentOptions(state, null, 'campaign-end').available, false);
  const projection = projectBusiness(state, null, 36);
  assert.deepEqual(projection.months, []);
  assert.equal(projection.stopReason, 'campaign-ended');
});
