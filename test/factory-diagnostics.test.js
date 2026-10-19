import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, createInitialState, defaultPlan, forecast, advanceMonth } from '../src/simulation.js';
import { getCostLedger, getFactoryDiagnostics } from '../src/factory-diagnostics.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const sum = values => values.reduce((total, value) => total + value, 0);
const deepFreeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };
const assertFiniteJson = value => {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  if (value && typeof value === 'object') Object.values(value).forEach(assertFiniteJson);
};
function reconcileFixture(state) {
  const previous = state.inventoryValue;
  state.inventoryValue = sum(PRODUCTS.map(product => {
    const stock = state.products[product.id];
    return stock.parts * product.materialCost * 0.78 + stock.controllers * product.materialCost * 0.22
      + stock.incomplete * (product.materialCost * 0.78 + product.conversionCost * 0.6)
      + (stock.rework + stock.finishedGoods) * (product.materialCost + product.conversionCost);
  }));
  state.equity += state.inventoryValue - previous;
  return state;
}

test('tractor bill of cost separates actual modeled components without inventing detailed labor costs', () => {
  const state = createInitialState();
  const result = getCostLedger(state, defaultPlan(state));
  const tractor = result.products[0];
  assert.deepEqual(tractor.unitCosts, { materialK: 75, kitK: 58.5, controllerK: 16.5, conversionK: 13, standardCostK: 88 });
  near(tractor.unitCosts.kitK + tractor.unitCosts.controllerK + tractor.unitCosts.conversionK, tractor.unitCosts.standardCostK);
  const wip = tractor.currentInventory.stages.find(stage => stage.key === 'incomplete');
  assert.equal(wip.units, 26);
  near(wip.unitCostK, 66.3);
  assert.equal(tractor.currentInventory.dealerStockExcludedUnits, 310);
  assert.ok(result.assumptions.some(text => text.includes('does not separately price wages')));
  assert.equal(result.currentQuality, null, 'no historical monthly expense should be fabricated before play');
});

test('inventory stages reconcile to manufacturer balance sheet and physical forecast flow', () => {
  for (const options of [{}, { marketRegime: 'soft' }, { marketRegime: 'upswing' }]) {
    let state = createInitialState(88, options);
    for (let month = 0; month < 5 && state.status === 'active'; month += 1) {
      const plan = { ...defaultPlan(state), partsBuffer: 30, quality: 2, overtime: 10 };
      const ledger = getCostLedger(state, plan);
      near(ledger.inventory.currentM, state.inventoryValue);
      near(sum(ledger.products.map(row => row.currentInventory.totalM)), state.inventoryValue);
      near(ledger.inventory.currentReconciliationM, 0);
      near(ledger.inventory.forecastReconciliationM, 0);
      const bridge = ledger.inventory.forecastBridge;
      near(bridge.openingM + bridge.purchasesM + bridge.conversionM - bridge.shippedCostM, bridge.closingM);
      near(bridge.reconciliationM, 0);
      state = advanceMonth(state, plan).state;
    }
  }
});

test('independent dealer stock never increases manufacturer inventory valuation', () => {
  const state = createInitialState();
  const before = getCostLedger(state, defaultPlan(state));
  state.products.tractor.dealerStock += 1000;
  const after = getCostLedger(state, defaultPlan(state));
  near(after.inventory.currentM, before.inventory.currentM);
  near(after.products[0].currentInventory.totalM, before.products[0].currentInventory.totalM);
  assert.equal(after.products[0].currentInventory.dealerStockExcludedUnits, before.products[0].currentInventory.dealerStockExcludedUnits + 1000);
});

test('quality expense and cash distinguish warranty provisions from claims without double counting', () => {
  const state = createInitialState();
  const plan = { ...defaultPlan(state), quality: 2, training: 1, rd: 3, maintenance: 2 };
  const forecastReport = forecast(state, plan).report;
  const ledger = getCostLedger(state, plan);
  const quality = ledger.forecastQuality;
  assert.equal(quality.preventionM, 2);
  assert.equal(quality.trainingM, 1);
  assert.equal(quality.engineeringM, 3);
  assert.equal(quality.maintenanceM, 2);
  near(quality.inventoryCarryingM, state.inventoryValue * 0.004);
  near(quality.qualityExpenseM, forecastReport.income.quality + forecastReport.income.reworkExpense + forecastReport.income.warrantyAccrual + forecastReport.income.warrantyShortfall);
  near(quality.qualityCashM, forecastReport.income.quality + forecastReport.income.reworkExpense + forecastReport.cashFlow.warrantyClaims);
  near(quality.openingWarrantyReserveM + quality.warrantyAccrualM + quality.warrantyShortfallM - quality.warrantyClaimsM, quality.closingWarrantyReserveM);
  near(quality.warrantyReconciliationM, 0);
  assert.notEqual(quality.qualityCashM, quality.qualityExpenseM);
  const advanced = advanceMonth(state, plan);
  const historical = getCostLedger(advanced.state, defaultPlan(advanced.state)).currentQuality;
  assert.equal(historical.isForecast, false);
  assert.equal(historical.month, 1);
  near(historical.warrantyClaimsM, advanced.report.cashFlow.warrantyClaims);
});

test('unreserved warranty claims reconcile through explicit shortfall expense', () => {
  const state = createInitialState();
  state.equity += state.warrantyReserve;
  state.warrantyReserve = 0;
  for (const product of Object.values(state.products)) product.installedBase *= 100;
  const ledger = getCostLedger(state, defaultPlan(state));
  assert.equal(ledger.status, 'forecast');
  const quality = ledger.forecastQuality;
  assert.ok(quality.warrantyShortfallM > 0);
  assert.equal(quality.closingWarrantyReserveM, 0);
  near(quality.warrantyReconciliationM, 0);
  near(quality.qualityExpenseM, quality.preventionM + quality.reworkM + quality.warrantyAccrualM + quality.warrantyShortfallM);
});

test('controller shortages, defects, maintenance wear and excess stock have different explanations', () => {
  const state = createInitialState();
  const diagnostics = getFactoryDiagnostics(state, defaultPlan(state));
  const tractor = diagnostics.products[0];
  assert.equal(tractor.primaryConstraint.id, 'controllers');
  assert.ok(tractor.constraints.some(item => item.id === 'quality'));
  assert.ok(tractor.constraints.some(item => item.id === 'maintenance'));
  assert.ok(tractor.constraints.some(item => item.id === 'inventory'));
  assert.ok(!tractor.constraints.some(item => item.id === 'capacity'), 'a shortage must not automatically be called insufficient capacity');
  assert.ok(!tractor.constraints.some(item => item.id === 'skills'), 'positive skill growth must not be labeled workforce decline');
  const flow = tractor.flow;
  assert.equal(flow.production, flow.goodFirstPassUnits + flow.reworkResolved);
  near(flow.utilization, flow.assembled / flow.assemblyCapacity);
  near(flow.workSlotUtilization, (flow.starts + flow.completedFromOpeningWip) / flow.assemblyCapacity);
  assert.ok(flow.workSlotUtilization > flow.utilization, 'unfinished starts consume work slots');
});

test('capacity and kit constraints are identified from different physical ceilings', () => {
  const ordinary = createInitialState();
  const highTarget = { ...defaultPlan(ordinary), tractorProduction: 364, partsBuffer: 60 };
  const ordinaryDiagnostics = getFactoryDiagnostics(ordinary, highTarget).products[0];
  assert.ok(ordinaryDiagnostics.constraints.some(item => item.id === 'capacity'));
  const expanded = createInitialState();
  expanded.capacityBonus = 0.4;
  expanded.products.tractor.condition = 1;
  expanded.products.tractor.skill = 1.08;
  expanded.products.tractor.parts = 0;
  expanded.products.tractor.incomplete = 0;
  reconcileFixture(expanded);
  const result = getFactoryDiagnostics(expanded, { ...highTarget, overtime: 40, maintenance: 4, training: 3 });
  assert.equal(result.status, 'forecast');
  const tractor = result.products[0];
  assert.ok(tractor.flow.assemblyCapacity >= tractor.flow.target);
  assert.ok(tractor.constraints.some(item => item.id === 'kits'));
  assert.ok(tractor.constraints.some(item => item.id === 'controllers'));
  assert.ok(!tractor.constraints.some(item => item.id === 'capacity'));
});

test('training proxy is separate from cross-training coverage and standard unit cost', () => {
  const state = createInitialState();
  const low = getFactoryDiagnostics(state, { ...defaultPlan(state), training: 0, maintenance: 0 });
  const high = getFactoryDiagnostics(state, { ...defaultPlan(state), training: 3, maintenance: 4 });
  assert.ok(low.products.every(row => row.constraints.some(item => item.id === 'skills')));
  assert.ok(high.products.every(row => !row.constraints.some(item => item.id === 'skills')));
  assert.ok(high.products.every((row, index) => row.projected.skill > low.products[index].projected.skill));
  assert.ok(high.products.every((row, index) => row.projected.quality > low.products[index].projected.quality));
  assert.ok(high.assumptions.some(text => text.includes('not a percentage of cross-trained')));
  assert.deepEqual(getCostLedger(state, { ...defaultPlan(state), training: 0 }).products.map(row => row.unitCosts), getCostLedger(state, { ...defaultPlan(state), training: 3 }).products.map(row => row.unitCosts));
});

test('zero new assembly has unavailable first-pass yield and keeps recovered rework separate', () => {
  const state = createInitialState();
  const plan = { ...defaultPlan(state), tractorProduction: 0, harvesterProduction: 0, loaderProduction: 0 };
  const ledger = getCostLedger(state, plan);
  assert.equal(ledger.forecastQuality.assembled, 0);
  assert.equal(ledger.forecastQuality.firstPassYield, null);
  assert.ok(ledger.forecastQuality.reworkResolved > 0);
  const diagnostics = getFactoryDiagnostics(state, plan);
  for (const row of diagnostics.products) {
    assert.equal(row.flow.utilization, 0);
    assert.equal(row.flow.goodFirstPassUnits, 0);
    assert.equal(row.flow.production, row.flow.reworkResolved);
    assert.ok(!row.constraints.some(item => ['controllers', 'capacity', 'kits', 'quality'].includes(item.id)));
  }
  assertFiniteJson(ledger);
  assertFiniteJson(diagnostics);
});

test('investment pipeline due dates match the engine and commitments do not mature immediately', () => {
  let state = createInitialState();
  state = advanceMonth(state, { ...defaultPlan(state), capex: 5, rd: 2 }).state;
  const diagnostics = getFactoryDiagnostics(state, defaultPlan(state));
  assert.deepEqual(diagnostics.pipeline.map(item => [item.type, item.amountM, item.remainingRounds, item.availableMonth]), [['capex', 5, 3, 4], ['rd', 2, 3, 4]]);
  for (let month = 2; month <= 4; month += 1) {
    state = advanceMonth(state, { ...defaultPlan(state), capex: 0, rd: 0 }).state;
    near(state.capacityBonus, month < 4 ? 0 : 0.02);
  }
  assert.equal(getFactoryDiagnostics(state, defaultPlan(state)).pipeline.length, 0);
});

test('invalid plans and terminal campaigns preserve current context without fabricated forecasts', () => {
  const state = createInitialState();
  for (const reader of [getCostLedger, getFactoryDiagnostics]) {
    const invalid = reader(state, { ...defaultPlan(state), tractorProduction: NaN });
    assert.equal(invalid.status, 'invalid-plan');
    assert.ok(invalid.errors.length > 0);
    assert.equal(invalid.products.length, 3);
    assert.equal(invalid.forecastMonth, null);
    assertFiniteJson(invalid);
    const terminal = reader({ ...state, status: 'distressed' }, defaultPlan(state));
    assert.equal(terminal.status, 'current-only');
    assert.equal(terminal.forecastMonth, null);
    assert.equal(terminal.products.length, 3);
    assertFiniteJson(terminal);
    const broken = reader(null, null);
    assert.equal(broken.status, 'invalid-state');
    assert.equal(broken.products.length, 0);
    assertFiniteJson(broken);
  }
});

test('terminal diagnostics retain explicitly labeled latest actual flow and quality expense', () => {
  let state = createInitialState(91, { marketRegime: 'flat' });
  while (state.status === 'active') state = advanceMonth(state, defaultPlan(state)).state;
  const diagnostics = getFactoryDiagnostics(state, defaultPlan(state));
  const ledger = getCostLedger(state, defaultPlan(state));
  assert.equal(diagnostics.status, 'current-only');
  assert.equal(ledger.forecastQuality, null);
  assert.equal(ledger.currentQuality.month, state.month);
  for (const row of diagnostics.products) {
    assert.equal(row.flow, null);
    assert.equal(row.projected, null);
    assert.deepEqual(row.constraints, []);
    assert.equal(row.latestActual.month, state.month);
    assert.equal(row.latestActual.deliveries, state.history.at(-1).products.find(product => product.id === row.id).deliveries);
  }
});

test('diagnostics are immutable and stay within utilization bounds across both rulesets', () => {
  for (const options of [{}, { marketRegime: 'upswing' }]) {
    let state = createInitialState(1024, options);
    for (let month = 0; month < 4; month += 1) {
      const plan = { ...defaultPlan(state), tractorProduction: 364, harvesterProduction: 133, loaderProduction: 252, overtime: 40, quality: 3, partsBuffer: 60 };
      deepFreeze(state); deepFreeze(plan);
      const before = JSON.stringify({ state, plan });
      const diagnostics = getFactoryDiagnostics(state, plan);
      const ledger = getCostLedger(state, plan);
      for (const row of diagnostics.products) {
        assert.ok(row.flow.utilization >= 0 && row.flow.utilization <= 1);
        assert.ok(row.flow.workSlotUtilization >= 0 && row.flow.workSlotUtilization <= 1);
      }
      assertFiniteJson(diagnostics); assertFiniteJson(ledger);
      assert.equal(JSON.stringify({ state, plan }), before);
      state = advanceMonth(state, plan).state;
      if (state.status !== 'active') break;
    }
  }
});
