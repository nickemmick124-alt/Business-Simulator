import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS,
  PLAN_FIELDS,
  createInitialState,
  defaultPlan,
  validatePlan,
  validateState,
  forecast,
  advanceMonth,
  getCampaignOutcome,
} from '../src/simulation.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function assertFiniteTree(value, path = 'result') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} must be finite; got ${value}`);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertFiniteTree(child, `${path}.${key}`);
    }
  }
}

function assertValidState(state) {
  const validation = validateState(state);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assertFiniteTree(state, 'state');
}

function approximately(actual, expected, message, tolerance = 1e-7) {
  assert.ok(Number.isFinite(actual), `${message}: actual must be finite`);
  assert.ok(Number.isFinite(expected), `${message}: expected must be finite`);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

function assertBooksBalance(state, label) {
  const assets = state.cash + state.receivables + state.inventoryValue + state.fixedAssets + state.loanBook;
  const liabilitiesAndEquity = state.debt + state.payables + state.warrantyReserve + state.equity;
  approximately(assets, liabilitiesAndEquity, `${label}: assets = liabilities + equity`, 1e-6);
  for (const field of ['receivables', 'payables', 'inventoryValue', 'fixedAssets', 'loanBook', 'warrantyReserve', 'debt']) {
    assert.ok(state[field] >= -1e-9, `${label}: ${field} cannot be negative`);
  }
}

function assertUnitStocks(state, label) {
  for (const product of PRODUCTS) {
    for (const field of ['finishedGoods', 'dealerStock', 'incomplete', 'parts', 'controllers', 'rework']) {
      const quantity = state.products[product.id][field];
      assert.ok(Number.isInteger(quantity) && quantity >= 0, `${label}: ${product.id}.${field} must be a nonnegative integer`);
    }
  }
}

function assertMaterialFlows(before, after, report, label) {
  assert.equal(report.products.length, PRODUCTS.length);
  for (const definition of PRODUCTS) {
    const flow = report.products.find((product) => product.id === definition.id);
    assert.ok(flow, `${label}: missing ${definition.id} flow`);
    const opening = before.products[definition.id];
    const closing = after.products[definition.id];
    for (const key of Object.keys(flow.opening)) {
      assert.equal(flow.opening[key], opening[key], `${label}: opening ${definition.id}.${key}`);
      assert.equal(flow.closing[key], closing[key], `${label}: closing ${definition.id}.${key}`);
    }
    assert.equal(closing.parts, opening.parts + flow.kitReceipts - flow.starts, `${label}: kits conserved`);
    assert.equal(closing.controllers, opening.controllers + flow.controllerReceipts - flow.assembled, `${label}: controllers conserved`);
    assert.equal(closing.incomplete, opening.incomplete + flow.starts - flow.assembled, `${label}: incomplete machines conserved`);
    assert.equal(closing.rework, opening.rework + flow.defects - flow.reworkResolved, `${label}: rework conserved`);
    assert.equal(flow.production, flow.assembled - flow.defects + flow.reworkResolved, `${label}: good output reconciles`);
    assert.equal(closing.finishedGoods, opening.finishedGoods + flow.production - flow.deliveries, `${label}: factory units conserved`);
    assert.equal(closing.dealerStock, opening.dealerStock + flow.deliveries - flow.retailSales, `${label}: dealer units conserved`);
    assert.ok(flow.assembled <= flow.assemblyCapacity, `${label}: assembly capacity exceeded`);
    assert.ok(flow.assembled <= flow.target, `${label}: target exceeded`);
    assert.ok(flow.assembled <= opening.controllers + flow.controllerReceipts, `${label}: unavailable controllers consumed`);
    assert.ok(flow.starts <= opening.parts + flow.kitReceipts, `${label}: unavailable kits consumed`);
    assert.ok(flow.deliveries <= flow.dealerOrders, `${label}: forced dealer shipments`);
    assert.ok(flow.retailSales <= flow.demand, `${label}: nonexistent customer demand`);
    const kitUnits = (stock) => stock.parts + stock.incomplete + stock.rework + stock.finishedGoods + stock.dealerStock;
    const controllerUnits = (stock) => stock.controllers + stock.rework + stock.finishedGoods + stock.dealerStock;
    assert.equal(kitUnits(closing) + flow.retailSales, kitUnits(opening) + flow.kitReceipts, `${label}: whole-system kit conservation`);
    assert.equal(controllerUnits(closing) + flow.retailSales, controllerUnits(opening) + flow.controllerReceipts, `${label}: whole-system controller conservation`);
  }
}

function assertFinancialFlows(before, after, report, label) {
  const { income, cashFlow, financing } = report;
  const procurement = report.products.reduce((total, product) => total + product.procurement, 0);
  approximately(cashFlow.operating + cashFlow.investing + cashFlow.financing, after.cash - before.cash, `${label}: cash-flow sections`, 1e-6);
  approximately(report.drivers.reduce((total, driver) => total + driver.value, 0), after.cash - before.cash, `${label}: explain-cash drivers`, 1e-6);
  approximately(after.receivables, before.receivables + income.wholesaleRevenue - cashFlow.customerCollections, `${label}: receivables`, 1e-6);
  approximately(after.payables, before.payables + procurement - cashFlow.supplierPayments, `${label}: payables`, 1e-6);
  approximately(after.inventoryValue, before.inventoryValue + procurement + cashFlow.conversion - income.cogs, `${label}: inventory value`, 1e-6);
  approximately(after.loanBook, before.loanBook + financing.newLending - financing.principalCollections - financing.creditLosses, `${label}: loan principal`, 1e-6);
  approximately(after.debt, before.debt + cashFlow.corporateBorrowing + financing.fundingChange, `${label}: funding obligations`, 1e-6);
  approximately(after.fixedAssets, before.fixedAssets + cashFlow.capex - income.depreciation, `${label}: fixed assets`, 1e-6);
  approximately(after.warrantyReserve, before.warrantyReserve + income.warrantyAccrual + income.warrantyShortfall - cashFlow.warrantyClaims, `${label}: warranty obligations`, 1e-6);
  approximately(income.revenue, income.wholesaleRevenue + financing.interestIncome, `${label}: revenue excludes principal collections`, 1e-6);
  approximately(income.profit, income.revenue - income.cogs - income.operatingExpense - income.depreciation - income.warrantyAccrual - income.warrantyShortfall - income.creditLosses - income.interestExpense - income.tax, `${label}: income statement`, 1e-6);
  for (const [identity, residual] of Object.entries(report.reconciliation)) {
    approximately(residual, 0, `${label}: reported ${identity} reconciliation`, 1e-6);
  }
}

test('a fresh company has a valid, serializable initial state and feasible default plan', () => {
  for (const seed of [0, 1, 4821, 987654321]) {
    const state = createInitialState(seed);
    assert.equal(state.month, 0);
    assertValidState(state);
    assertBooksBalance(state, `seed ${seed} opening`);
    assertUnitStocks(state, `seed ${seed} opening`);
    assert.deepEqual(clone(state), state);
    const validation = validatePlan(defaultPlan(state), state);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  }
});

test('financial books balance and retained profit reconciles through complete or distressed campaigns', () => {
  for (const seed of [1, 4821, 7783, 90421]) {
    for (const strategy of ['default', 'idle', 'full-production']) {
      let state = createInitialState(seed);
      for (let month = 1; month <= 12 && state.status === 'active'; month += 1) {
        const plan = defaultPlan(state);
        if (strategy !== 'default') {
          for (const field of PLAN_FIELDS.filter((entry) => entry.key.endsWith('Production'))) {
            plan[field.key] = strategy === 'idle' ? field.min : field.max;
          }
        }
        const result = advanceMonth(state, plan);
        const label = `seed ${seed}, ${strategy}, month ${month}`;
        assertBooksBalance(result.state, label);
        assertUnitStocks(result.state, label);
        assertMaterialFlows(state, result.state, result.report, label);
        assertFinancialFlows(state, result.state, result.report, label);
        approximately(result.state.equity - state.equity, result.report.metrics.profit, `${label}: profit retained in equity`, 1e-6);
        approximately(result.state.cash - state.cash, result.report.metrics.cashChange, `${label}: reported cash change`, 1e-6);
        assertValidState(result.state);
        assertFiniteTree(result.report, label);
        state = result.state;
      }
      assert.equal(getCampaignOutcome(state).complete, true, 'strategy must reach a campaign ending');
    }
  }
});

test('forecasts and commits do not mutate their state or plan inputs', () => {
  const state = freezeDeep(createInitialState(4821));
  const plan = freezeDeep(defaultPlan(state));
  const beforeState = clone(state);
  const beforePlan = clone(plan);
  const projected = forecast(state, plan);
  const committed = advanceMonth(state, plan);
  assert.deepEqual(state, beforeState);
  assert.deepEqual(plan, beforePlan);
  assert.notEqual(projected.state, state);
  assert.notEqual(committed.state, state);
  assert.equal(committed.state.month, 1);
  assertValidState(projected.state);
  assertValidState(committed.state);
});

test('identical saved state and decisions replay exactly, even after repeated previews', () => {
  let state = createInitialState(8129);
  for (let month = 0; month < 12; month += 1) {
    freezeDeep(state);
    const plan = freezeDeep(defaultPlan(state));
    const savedState = clone(state);
    const savedPlan = clone(plan);
    const first = advanceMonth(state, plan);
    for (let preview = 0; preview < 4; preview += 1) forecast(state, plan);
    const replay = advanceMonth(savedState, savedPlan);
    assert.deepEqual(replay, first, `month ${month + 1} diverged after save/load`);
    assert.deepEqual(advanceMonth(state, plan), first);
    state = first.state;
  }
});

test('the outlook is repeatable but does not reveal every realized monthly shock', () => {
  let differed = false;
  for (const seed of [1, 41, 4821, 7783, 90421]) {
    const state = createInitialState(seed);
    const plan = defaultPlan(state);
    const outlook = forecast(state, plan);
    assert.deepEqual(forecast(state, plan), outlook);
    const actual = advanceMonth(state, plan);
    if (JSON.stringify(outlook.state.products) !== JSON.stringify(actual.state.products)
      || outlook.state.cash !== actual.state.cash) differed = true;
  }
  assert.equal(differed, true, 'forecasts must not be an exact oracle of realized results');
});

test('changing only the hidden scenario seed cannot change the public forecast', () => {
  const state = createInitialState(4821);
  const alternativeSeed = { ...clone(state), seed: 76543 };
  const plan = defaultPlan(state);
  const first = forecast(state, plan);
  const second = forecast(alternativeSeed, plan);
  assert.deepEqual(second.state.products, first.state.products);
  approximately(second.state.cash, first.state.cash, 'forecast cash must not depend on hidden shocks');
  assert.deepEqual(second.report.metrics, first.report.metrics);
});

test('nonfinite and out-of-range production inputs are rejected before advancing', () => {
  const state = createInitialState();
  for (const value of [NaN, Infinity, -Infinity, -1, 1e9]) {
    const plan = { ...defaultPlan(state), tractorProduction: value };
    const before = clone(state);
    assert.equal(validatePlan(plan, state).valid, false, `accepted production ${value}`);
    assert.throws(() => advanceMonth(state, plan));
    assert.throws(() => forecast(state, plan));
    assert.deepEqual(state, before);
  }
});

test('every numerical decision rejects nonfinite values and values outside its displayed bounds', () => {
  const state = createInitialState();
  for (const field of PLAN_FIELDS) {
    for (const value of [NaN, Infinity, -Infinity, field.min - 1, field.max + 1]) {
      const plan = { ...defaultPlan(state), [field.key]: value };
      assert.equal(validatePlan(plan, state).valid, false, `${field.key} accepted ${value}`);
      assert.throws(() => advanceMonth(state, plan), `${field.key} should reject ${value}`);
    }
  }
});

test('save validation rejects nonfinite money, invalid months, and impossible material counts', () => {
  const corruptions = [
    (state) => { state.cash = NaN; },
    (state) => { state.month = 13; },
    (state) => { state.month = -1; },
    (state) => { state.products.tractor.finishedGoods = -1; },
    (state) => { state.products.tractor.parts = 0.5; },
    (state) => { state.products.tractor.dealerStock = Infinity; },
    (state) => { state.loanCohorts = [null]; },
    (state) => { state.capexPipeline = [null]; },
    (state) => { state.rdPipeline = [null]; },
  ];
  for (const corrupt of corruptions) {
    const state = createInitialState();
    corrupt(state);
    const validation = validateState(state);
    assert.equal(validation.valid, false, 'an impossible save must be rejected');
    assert.ok(validation.errors.length > 0);
  }
});

test('zero assembly targets consume no new parts; only existing rework can become good output', () => {
  const state = createInitialState(4821);
  const plan = defaultPlan(state);
  for (const product of PRODUCTS) plan[`${product.id}Production`] = 0;
  const result = advanceMonth(state, plan);
  for (const flow of result.report.products) {
    assert.equal(flow.starts, 0);
    assert.equal(flow.assembled, 0);
    assert.equal(flow.kitReceipts, 0);
    assert.equal(flow.controllerReceipts, 0);
    assert.equal(flow.production, flow.reworkResolved);
    assert.equal(flow.closing.incomplete, flow.opening.incomplete);
    assert.equal(flow.closing.parts, flow.opening.parts);
    assert.equal(flow.closing.controllers, flow.opening.controllers);
  }
  assertMaterialFlows(state, result.state, result.report, 'zero output');
  assertFinancialFlows(state, result.state, result.report, 'zero output');
});

test('the opening supply constraint leaves unfinished machines and limits assembly to received components', () => {
  const state = createInitialState(4821);
  const plan = { ...defaultPlan(state), partsBuffer: 0, quality: 0, overtime: 0 };
  for (const product of PRODUCTS) plan[`${product.id}Production`] = product.capacity;
  const result = advanceMonth(state, plan);
  assert.ok(result.report.products.some((flow) => flow.shortage > 0), 'opening scenario should expose a supply shortage');
  assert.ok(result.report.products.some((flow) => flow.closing.incomplete > flow.opening.incomplete), 'shortage should leave visible incomplete equipment');
  assertMaterialFlows(state, result.state, result.report, 'supplier constraint');
  assertFinancialFlows(state, result.state, result.report, 'supplier constraint');
});

test('customer loan principal is collected as cash without being recognized as revenue', () => {
  const state = createInitialState(4821);
  const { state: next, report } = advanceMonth(state, defaultPlan(state));
  assert.ok(report.financing.principalCollections > 0, 'fixture must exercise real principal repayment');
  approximately(report.cashFlow.loanPrincipalCollections, report.financing.principalCollections, 'principal enters cash flow');
  approximately(report.metrics.revenue, report.income.wholesaleRevenue + report.financing.interestIncome, 'only loan interest enters revenue');
  approximately(next.loanBook, state.loanBook + report.financing.newLending - report.financing.principalCollections - report.financing.creditLosses, 'loan asset amortizes');
});

test('borrowing in the final round cannot manufacture profit or company value', () => {
  let state = createInitialState(4821);
  for (let month = 0; month < 11; month += 1) state = advanceMonth(state, defaultPlan(state)).state;
  const plan = defaultPlan(state);
  const ordinary = advanceMonth(state, plan);
  const borrowed = advanceMonth(state, { ...plan, debtChange: 40 });
  approximately(borrowed.state.cash - ordinary.state.cash, 40, 'borrowed cash received');
  approximately(borrowed.state.debt - ordinary.state.debt, 40, 'borrowed cash offset by debt');
  approximately(borrowed.report.metrics.profit, ordinary.report.metrics.profit, 'borrowing is not profit');
  const ordinaryOutcome = getCampaignOutcome(ordinary.state);
  const borrowedOutcome = getCampaignOutcome(borrowed.state);
  approximately(borrowedOutcome.adjustedEquity, ordinaryOutcome.adjustedEquity, 'borrowing does not create value');
  assert.equal(borrowedOutcome.score, ordinaryOutcome.score, 'borrowed cash should not buy score');
});

test('two negative-cash closes end a distressed campaign and prevent further decisions', () => {
  let state = createInitialState(41);
  const negativeMonths = [];
  while (state.status === 'active' && state.month < 12) {
    const plan = defaultPlan(state);
    for (const field of PLAN_FIELDS) plan[field.key] = field.max;
    plan.debtChange = 0;
    const result = advanceMonth(state, plan);
    if (result.state.cash < 0) negativeMonths.push(result.state.month);
    state = result.state;
  }
  assert.equal(state.status, 'distressed');
  assert.ok(negativeMonths.length >= 2);
  assert.equal(negativeMonths.at(-1) - negativeMonths.at(-2), 1);
  assert.equal(getCampaignOutcome(state).complete, true);
  assert.throws(() => advanceMonth(state, defaultPlan(state)));
});

test('minimum, maximum, and mixed feasible boundary plans produce finite validated campaigns', () => {
  for (const seed of [0, 41, 4821, 987654321]) {
    for (const strategy of ['minimum', 'maximum', 'alternating']) {
      let state = createInitialState(seed);
      for (let month = 0; month < 12 && state.status === 'active'; month += 1) {
        const plan = defaultPlan(state);
        for (const [index, field] of PLAN_FIELDS.entries()) {
          const high = strategy === 'maximum' || (strategy === 'alternating' && (index + month) % 2 === 0);
          plan[field.key] = high ? field.max : field.min;
        }
        // Exercise the most extreme borrowing/repayment feasible at this balance.
        plan.debtChange = Math.min(160 - state.corporateDebt, Math.max(-state.corporateDebt, plan.debtChange));
        const validation = validatePlan(plan, state);
        assert.equal(validation.valid, true, JSON.stringify(validation.errors));
        const projected = forecast(state, plan);
        const committed = advanceMonth(state, plan);
        assertFiniteTree(projected);
        assertFiniteTree(committed);
        assertValidState(projected.state);
        assertValidState(committed.state);
        state = committed.state;
      }
      assert.equal(getCampaignOutcome(state).complete, true);
    }
  }
});

test('a 12-month campaign has an outcome and cannot be advanced past its ending', () => {
  let state = createInitialState(4821);
  for (let month = 1; month <= 12; month += 1) {
    state = advanceMonth(state, defaultPlan(state)).state;
    assert.equal(state.month, month);
    assertValidState(state);
  }
  const ending = getCampaignOutcome(state);
  assert.ok(ending && typeof ending === 'object');
  assertFiniteTree(ending, 'outcome');
  const before = clone(state);
  assert.throws(() => advanceMonth(state, defaultPlan(state)));
  assert.deepEqual(state, before);
});
