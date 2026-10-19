import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, defaultPlan, forecast, advanceMonth, PRODUCTS } from '../src/simulation.js';
import { getUnitEconomics, getReportEconomics } from '../src/unit-economics.js';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const total = values => values.reduce((a, b) => a + b, 0);
const openingReport = () => {
  const state = createInitialState();
  return forecast(state, defaultPlan(state)).report;
};

// A report fixture with a controlled mix keeps all accounting identities intact.
function controlledReport(specification) {
  const report = openingReport();
  report.products.forEach((row, index) => {
    const { shipments, price } = specification[index];
    row.deliveries = shipments;
    row.price = price;
    row.revenue = shipments * price * 0.86 / 1000;
    row.cogs = shipments * (PRODUCTS[index].materialCost + PRODUCTS[index].conversionCost);
    row.warrantyAccrual = row.revenue * 0.02;
  });
  const income = report.income;
  income.wholesaleRevenue = total(report.products.map(row => row.revenue));
  income.cogs = total(report.products.map(row => row.cogs));
  income.warrantyAccrual = total(report.products.map(row => row.warrantyAccrual));
  income.revenue = income.wholesaleRevenue + income.loanInterestIncome;
  income.operatingProfit = income.revenue - income.cogs - income.warrantyAccrual
    - income.operatingExpense - income.depreciation - income.warrantyShortfall - income.creditLosses;
  income.pretaxProfit = income.operatingProfit - income.interestExpense;
  return report;
}

test('unit economics distinguishes customer price, dealer receipt, standard cost and warranty contribution', () => {
  const state = createInitialState();
  const plan = defaultPlan(state);
  const economics = getUnitEconomics(state, plan);
  const tractor = economics.products.find(row => row.id === 'tractor');
  assert.equal(tractor.listPriceK, 145);
  near(tractor.manufacturerPriceK, 124.7);
  assert.equal(tractor.materialCostK, 75);
  assert.equal(tractor.conversionCostK, 13);
  assert.equal(tractor.standardCostK, 88);
  near(tractor.grossMarginPerUnitK, 36.7);
  near(tractor.variableCostFloorListPriceK, 88 / 0.86);
  near(tractor.warrantyAdjustedFloorListPriceK * 0.86 * (1 - tractor.warrantyRate), 88);
  near(tractor.contributionPerUnitK, 124.7 - 88 - tractor.warrantyPerUnitK);
  assert.ok(tractor.warrantyAdjustedFloorListPriceK > tractor.variableCostFloorListPriceK);
  assert.ok(tractor.indicativeBreakEvenListPriceK > tractor.warrantyAdjustedFloorListPriceK);
});

test('contribution bridge and common cost breakdown reconcile exactly to the simulation accounts', () => {
  let state = createInitialState(817);
  for (let month = 0; month < 6 && state.status === 'active'; month += 1) {
    const result = advanceMonth(state, { ...defaultPlan(state), overtime: 15, quality: 2, capex: month === 0 ? 4 : 0 });
    const { company, products } = getReportEconomics(result.report);
    near(total(products.map(row => row.contributionM)), company.contributionM);
    near(total(products.map(row => row.allocatedCommonCostsM)), company.commonCostsM);
    near(total(company.costBreakdown.map(row => row.valueM)), company.commonCostsM);
    near(company.contributionM - company.commonCostsM + company.loanInterestIncomeM, result.report.income.operatingProfit);
    near(company.contributionM - company.commonCostsM + company.loanInterestIncomeM - company.interestExpenseM, result.report.income.pretaxProfit);
    near(company.reconciliationM, 0);
    assert.equal(company.endingCashM, result.report.balanceSheet.cash);
    assert.equal(company.cashChangeM, result.report.cashFlow.cashChange);
    state = result.state;
  }
});

test('break-even uses wholesale revenue, shipment-weighted contribution and explicit USD conversions', () => {
  const report = openingReport();
  const { company } = getReportEconomics(report);
  near(company.contributionPerUnitK, company.contributionM * 1000 / company.shipments);
  near(company.operatingBreakEvenRevenueM * company.contributionMarginRatio - company.commonCostsM + company.loanInterestIncomeM, 0);
  near(company.pretaxBreakEvenRevenueM * company.contributionMarginRatio - company.commonCostsM + company.loanInterestIncomeM - company.interestExpenseM, 0);
  near(company.pretaxBreakEvenUnits * company.contributionPerUnitK / 1000, company.commonCostsM - company.loanInterestIncomeM + company.interestExpenseM);
  near(company.marginOfSafetyM, company.wholesaleRevenueM - company.pretaxBreakEvenRevenueM);
  near(company.marginOfSafetyRatio, company.marginOfSafetyM / company.wholesaleRevenueM);
  assert.ok(company.pretaxBreakEvenRevenueM > company.operatingBreakEvenRevenueM);
  assert.ok(company.marginOfSafetyRatio < 0, 'a loss-making opening month should have a negative safety margin');
});

test('product indicative break-even freezes the disclosed revenue allocation and warranty rate', () => {
  const { company, products } = getReportEconomics(openingReport());
  for (const row of products) {
    near(row.allocatedCommonCostsM, company.commonCostsM * row.wholesaleRevenueM / company.wholesaleRevenueM);
    const allocatedPerUnitK = row.allocatedCommonCostsM * 1000 / row.shipments;
    near(row.fullyLoadedCostPerUnitK, row.standardCostK + row.warrantyPerUnitK + allocatedPerUnitK);
    near(row.indicativeBreakEvenListPriceK * 0.86 * (1 - row.warrantyRate), row.standardCostK + allocatedPerUnitK);
  }
});

test('zero shipments have no meaningful volume mix or historical warranty-per-unit denominator', () => {
  const report = controlledReport(PRODUCTS.map(product => ({ shipments: 0, price: product.basePrice })));
  const { company, products } = getReportEconomics(report);
  assert.equal(company.shipments, 0);
  for (const field of ['contributionMarginRatio', 'contributionPerUnitK', 'operatingBreakEvenRevenueM', 'pretaxBreakEvenRevenueM', 'operatingBreakEvenUnits', 'pretaxBreakEvenUnits', 'marginOfSafetyM', 'marginOfSafetyRatio']) assert.equal(company[field], null, field);
  for (const row of products) {
    assert.equal(row.warrantyRate, null);
    assert.equal(row.contributionPerUnitK, null);
    assert.equal(row.allocatedCommonCostsM, null);
    assert.equal(row.fullyLoadedCostPerUnitK, null);
    assert.equal(row.indicativeBreakEvenListPriceK, null);
    assert.ok(row.variableCostFloorListPriceK > 0);
  }
  near(company.reconciliationM, 0);
});

test('no shipments in a planning forecast still has a known modeled warranty rate', () => {
  const state = createInitialState();
  for (const row of Object.values(state.products)) row.dealerStock = 100000;
  const economics = getUnitEconomics(state, defaultPlan(state));
  assert.equal(economics.company.shipments, 0);
  for (const row of economics.products) {
    assert.ok(row.warrantyRate > 0);
    assert.ok(row.contributionPerUnitK > 0);
    assert.ok(row.warrantyAdjustedFloorListPriceK > row.variableCostFloorListPriceK);
    assert.equal(row.indicativeBreakEvenListPriceK, null);
  }
});

test('one unshipped product has unavailable allocated unit cost without hiding other products', () => {
  const economics = getReportEconomics(controlledReport([
    { shipments: 0, price: 145 }, { shipments: 20, price: 360 }, { shipments: 100, price: 195 },
  ]));
  assert.equal(economics.products[0].allocatedCommonCostsM, 0);
  assert.equal(economics.products[0].fullyLoadedCostPerUnitK, null);
  assert.ok(economics.company.pretaxBreakEvenRevenueM > 0);
  near(total(economics.products.map(row => row.allocatedCommonCostsM)), economics.company.commonCostsM);
});

test('mixed negative and positive unit contribution uses the actual weighted mix', () => {
  const economics = getReportEconomics(controlledReport([
    { shipments: 100, price: 90 }, { shipments: 100, price: 360 }, { shipments: 100, price: 195 },
  ]));
  assert.ok(economics.products[0].contributionPerUnitK < 0);
  assert.ok(economics.company.contributionM > 0);
  assert.ok(economics.company.pretaxBreakEvenRevenueM > 0);
  near(economics.company.contributionM, total(economics.products.map(row => row.contributionM)));
  near(economics.company.contributionPerUnitK, total(economics.products.map(row => row.shipments * row.contributionPerUnitK)) / 300);
  near(economics.company.reconciliationM, 0);
});

test('nonpositive contribution cannot produce a plausible positive break-even threshold', () => {
  const economics = getReportEconomics(controlledReport(PRODUCTS.map(product => ({ shipments: 100, price: product.basePrice / 2 }))));
  assert.ok(economics.company.contributionM < 0);
  assert.ok(economics.company.contributionMarginRatio < 0);
  for (const field of ['operatingBreakEvenRevenueM', 'pretaxBreakEvenRevenueM', 'operatingBreakEvenUnits', 'pretaxBreakEvenUnits', 'marginOfSafetyM', 'marginOfSafetyRatio']) assert.equal(economics.company[field], null, field);
  near(economics.company.reconciliationM, 0);
});

test('capex and corporate principal change cash but are not charged again to current break-even', () => {
  const state = createInitialState();
  const plan = defaultPlan(state);
  const base = getUnitEconomics(state, plan);
  const investment = getUnitEconomics(state, { ...plan, capex: 10, debtChange: -5 });
  near(investment.company.pretaxProfitM, base.company.pretaxProfitM);
  near(investment.company.pretaxBreakEvenRevenueM, base.company.pretaxBreakEvenRevenueM);
  near(investment.company.cashChangeM, base.company.cashChangeM - 15);
});

test('unit economics is immutable and rejects incomplete reports instead of inventing costs', () => {
  const state = createInitialState();
  const plan = defaultPlan(state);
  const report = openingReport();
  const snapshot = JSON.stringify({ state, plan, report });
  getUnitEconomics(state, plan);
  getReportEconomics(report);
  assert.equal(JSON.stringify({ state, plan, report }), snapshot);
  assert.throws(() => getReportEconomics({ products: [] }), /complete simulation report/);
  const invalid = structuredClone(report);
  invalid.income.cogs = NaN;
  assert.throws(() => getReportEconomics(invalid), /complete simulation report/);
});
