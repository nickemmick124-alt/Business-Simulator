/** Read-only teaching views of the simulation's accounts and physical flows.
 * Money uses USD millions (M), unit costs USD thousands (K), and rates fractions.
 * No mechanic, random draw, plan, state or save is changed by this module.
 */
import { PRODUCTS, forecast, validatePlan, validateState } from './simulation.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const rounded = value => Math.round(value * 1e9) / 1e9;
const capability = product => Object.fromEntries(['condition', 'skill', 'quality', 'reputation', 'technology'].map(key => [key, product[key]]));

function context(state, plan) {
  const stateCheck = validateState(state);
  if (!stateCheck.valid) return { status: 'invalid-state', month: null, forecastMonth: null, errors: [...stateCheck.errors], projected: null };
  const base = { month: state.month, forecastMonth: null, errors: [], projected: null };
  if (state.status !== 'active' || state.month >= 12) return { ...base, status: 'current-only' };
  const planCheck = validatePlan(plan, state);
  if (!planCheck.valid) return { ...base, status: 'invalid-plan', errors: [...planCheck.errors] };
  return { ...base, status: 'forecast', forecastMonth: state.month + 1, projected: forecast(state, planCheck.plan) };
}

function metadata(ctx) {
  return { status: ctx.status, month: ctx.month, forecastMonth: ctx.forecastMonth, errors: [...ctx.errors] };
}

function unitCosts(product) {
  return {
    materialK: rounded(product.materialCost * 1000),
    kitK: rounded(product.materialCost * 0.78 * 1000),
    controllerK: rounded(product.materialCost * 0.22 * 1000),
    conversionK: rounded(product.conversionCost * 1000),
    standardCostK: rounded((product.materialCost + product.conversionCost) * 1000),
  };
}

function inventoryStages(product, stock) {
  const cost = unitCosts(product);
  const stages = [
    { key: 'parts', label: 'Unused component kits', units: stock.parts, unitCostK: cost.kitK },
    { key: 'controllers', label: 'Unused controllers', units: stock.controllers, unitCostK: cost.controllerK },
    { key: 'incomplete', label: 'Incomplete machines', units: stock.incomplete, unitCostK: rounded(cost.kitK + cost.conversionK * 0.6) },
    { key: 'rework', label: 'Machines awaiting quality release', units: stock.rework, unitCostK: cost.standardCostK },
    { key: 'finishedGoods', label: 'Finished machines at factory', units: stock.finishedGoods, unitCostK: cost.standardCostK },
  ].map(stage => ({ ...stage, valueM: rounded(stage.units * stage.unitCostK / 1000) }));
  return { stages, totalM: rounded(sum(stages.map(stage => stage.valueM))), dealerStockExcludedUnits: stock.dealerStock };
}

function qualityLedger(report) {
  if (!report) return null;
  const income = report.income;
  const assembled = sum(report.products.map(product => product.assembled));
  const defects = sum(report.products.map(product => product.defects));
  const qualityExpenseM = rounded(income.quality + income.reworkExpense + income.warrantyAccrual + income.warrantyShortfall);
  return {
    month: report.month, isForecast: Boolean(report.isForecast),
    preventionM: income.quality, trainingM: income.training, maintenanceM: income.maintenance, engineeringM: income.rd,
    reworkM: income.reworkExpense, inventoryCarryingM: income.inventoryCarryingExpense,
    warrantyAccrualM: income.warrantyAccrual, warrantyClaimsM: report.cashFlow.warrantyClaims,
    warrantyShortfallM: income.warrantyShortfall,
    openingWarrantyReserveM: report.openingBalanceSheet.warrantyReserve,
    closingWarrantyReserveM: report.balanceSheet.warrantyReserve,
    warrantyReconciliationM: rounded(report.openingBalanceSheet.warrantyReserve + income.warrantyAccrual + income.warrantyShortfall - report.cashFlow.warrantyClaims - report.balanceSheet.warrantyReserve),
    qualityExpenseM,
    qualityCashM: rounded(income.quality + income.reworkExpense + report.cashFlow.warrantyClaims),
    assembled, defects, reworkResolved: sum(report.products.map(product => product.reworkResolved)),
    firstPassYield: assembled > 0 ? (assembled - defects) / assembled : null,
    products: report.products.map(row => ({
      id: row.id, name: row.name, assembled: row.assembled, defects: row.defects,
      reworkResolved: row.reworkResolved, closingRework: row.closing.rework,
      firstPassYield: row.assembled > 0 ? (row.assembled - row.defects) / row.assembled : null,
      warrantyAccrualM: row.warrantyAccrual, warrantyClaimsM: row.warrantyClaims,
    })),
  };
}

/** Standard product cost, inventory assets, and quality P&L/cash separation. */
export function getCostLedger(state, plan) {
  const ctx = context(state, plan);
  const result = { ...metadata(ctx), products: [], inventory: null, currentQuality: null, forecastQuality: null, assumptions: [
    'These are the simulation’s synthetic standard costs, not CNH bills of material. Per-machine values are $000; company amounts are $m.',
    'Materials split into 78% component kit and 22% controller. Normal conversion is a pooled assembly cost; the model does not separately price wages, energy or each tractor component.',
    'Unused kits and controllers are valued separately. Incomplete machines carry a kit plus 60% of normal conversion cost. Rework and finished machines carry full standard material and conversion cost.',
    'Dealer stock belongs to independent dealers and is excluded from manufacturer inventory. Shipping releases standard cost from inventory into cost of goods sold; paying suppliers is a separate cash event.',
    'Quality prevention, training, maintenance, engineering, rework premiums and inventory carrying are current-period expenses. They are not added again to standard inventory values. Depreciation and overtime premiums are also expensed separately by the engine.',
    'A warranty provision reduces profit and builds the warranty reserve. Claims consume cash and the reserve; only a claim exceeding available provision creates extra warranty shortfall expense. Adding all provisions and all claims as current expenses would double-count.',
    'The displayed quality expense subtotal is prevention plus rework premiums plus warranty provisions plus any unreserved claims. Quality cash is prevention plus rework premiums plus claims. Training, maintenance and engineering are separate budgets with broader benefits; no arbitrary share is allocated into this subtotal.',
    'Inventory carrying is an expense equal to 0.4% of opening manufacturer inventory per month. The inventory balance itself is an asset, not this month’s expense.',
    'Higher capability can improve available output and quality but does not lower the model’s fixed standard material or normal conversion cost per machine.',
  ] };
  if (ctx.status === 'invalid-state') return result;
  result.products = PRODUCTS.map(product => ({
    id: product.id, name: product.name, unitCosts: unitCosts(product),
    currentInventory: inventoryStages(product, state.products[product.id]),
    forecastInventory: ctx.projected ? inventoryStages(product, ctx.projected.state.products[product.id]) : null,
  }));
  const currentM = rounded(sum(result.products.map(product => product.currentInventory.totalM)));
  const forecastM = ctx.projected ? rounded(sum(result.products.map(product => product.forecastInventory.totalM))) : null;
  result.inventory = {
    currentM: state.inventoryValue, calculatedCurrentM: currentM,
    currentReconciliationM: rounded(currentM - state.inventoryValue),
    forecastM: ctx.projected?.report.balanceSheet.inventory ?? null,
    calculatedForecastM: forecastM,
    forecastReconciliationM: ctx.projected ? rounded(forecastM - ctx.projected.report.balanceSheet.inventory) : null,
    forecastBridge: ctx.projected ? {
      openingM: state.inventoryValue,
      purchasesM: rounded(sum(ctx.projected.report.products.map(product => product.procurement))),
      conversionM: ctx.projected.report.cashFlow.conversion,
      shippedCostM: ctx.projected.report.income.cogs,
      closingM: ctx.projected.report.balanceSheet.inventory,
      reconciliationM: ctx.projected.report.reconciliation.inventory,
    } : null,
  };
  result.currentQuality = qualityLedger(state.history.at(-1));
  result.forecastQuality = qualityLedger(ctx.projected?.report);
  return result;
}

function flowDetails(row) {
  const controllersAvailable = row.opening.controllers + row.controllerReceipts;
  const kitsAvailable = row.opening.parts + row.kitReceipts;
  const completedFromOpeningWip = Math.min(row.opening.incomplete, controllersAvailable, row.target, row.assemblyCapacity);
  return {
    target: row.target, capacity: row.capacity, assemblyCapacity: row.assemblyCapacity,
    starts: row.starts, assembled: row.assembled, completedFromOpeningWip,
    goodFirstPassUnits: row.assembled - row.defects, production: row.production, defects: row.defects,
    reworkResolved: row.reworkResolved, reworkCapacityUsed: row.capacity - row.assemblyCapacity,
    utilization: row.assemblyCapacity > 0 ? row.assembled / row.assemblyCapacity : null,
    workSlotUtilization: row.assemblyCapacity > 0 ? (row.starts + completedFromOpeningWip) / row.assemblyCapacity : null,
    kitOrder: row.kitOrder, kitReceipts: row.kitReceipts, kitsAvailable,
    controllerOrder: row.controllerOrder, controllerReceipts: row.controllerReceipts, controllersAvailable,
    shortage: row.shortage, dealerOrders: row.dealerOrders, deliveries: row.deliveries,
    missedOrders: row.missedOrders, retailSales: row.retailSales,
    opening: { ...row.opening }, closing: { ...row.closing },
  };
}

function constraintsFor(product, current, projected, flow) {
  const constraints = [];
  const add = (id, severity, title, detail, levers) => constraints.push({ id, severity, title, detail, levers });
  const physicalPotential = Math.min(flow.target, flow.assemblyCapacity, flow.opening.incomplete + flow.kitsAvailable);
  if (flow.assembled < physicalPotential && flow.controllersAvailable <= flow.assembled) {
    add('controllers', 'warning', 'Controller availability constrains completion',
      `${flow.controllersAvailable} controllers are available including opening stock; ${flow.controllerReceipts} arrive against ${flow.controllerOrder} ordered. ${flow.closing.incomplete} unfinished machines remain. Extra assembly capacity alone cannot supply the missing controllers.`, ['partsBuffer', 'quality', 'production']);
  }
  const requiredStarts = Math.min(Math.max(0, flow.target - flow.completedFromOpeningWip), Math.max(0, flow.assemblyCapacity - flow.completedFromOpeningWip));
  if (flow.starts < requiredStarts && flow.kitsAvailable <= flow.starts) {
    add('kits', 'warning', 'Component kits constrain new starts',
      `${flow.kitsAvailable} kits are available for ${requiredStarts} possible starts. ${flow.kitReceipts} kits arrive against ${flow.kitOrder} ordered; supplier receipt ceilings can prevent a larger buffer from filling immediately.`, ['partsBuffer', 'production']);
  }
  if (flow.target > flow.assemblyCapacity) {
    add('capacity', 'warning', 'Requested output exceeds assembly capacity',
      `The target is ${flow.target} units but ${flow.assemblyCapacity} assembly slots remain after rework. ${flow.capacity} slots were available before rework. Maintenance, workforce capability, overtime and matured capital projects affect these slots; materials may also constrain completion.`, ['maintenance', 'training', 'overtime', 'capex', 'production']);
  }
  if (flow.defects > 0) {
    add('quality', 'warning', 'First-pass defects create rework',
      `${flow.defects} of ${flow.assembled} assembled machines require quality release. ${flow.reworkResolved} older rework units are recovered; the closing queue is ${flow.closing.rework}. Rework costs cash and also consumes ${flow.reworkCapacityUsed} assembly slots.`, ['quality', 'training', 'overtime']);
  } else if (flow.reworkResolved > 0 || flow.closing.rework > 0) {
    add('rework', 'info', 'Earlier defects still occupy the factory',
      `${flow.reworkResolved} earlier units are recovered using ${flow.reworkCapacityUsed} assembly slots, with ${flow.closing.rework} remaining. This is separate from new first-pass output.`, ['quality', 'training']);
  }
  if (projected.condition < current.condition - 1e-10) {
    add('maintenance', 'warning', 'Plant condition is declining',
      `Maintenance does not fully offset wear under this overtime plan. The condition index changes from ${current.condition.toFixed(3)} to ${projected.condition.toFixed(3)}, reducing capacity available to subsequent rounds.`, ['maintenance', 'overtime']);
  }
  if (projected.skill < current.skill - 1e-10) {
    add('skills', 'warning', 'Workforce capability is declining',
      `The capability index changes from ${current.skill.toFixed(3)} to ${projected.skill.toFixed(3)}. More training can improve it and first-pass quality. This index is a pooled capability proxy, not a measured cross-training coverage or employee skills matrix.`, ['training']);
  }
  if (flow.closing.finishedGoods > flow.opening.finishedGoods) {
    add('inventory', 'info', 'Production adds finished inventory',
      `${flow.production} good units enter finished stock and ${flow.deliveries} ship, increasing factory finished inventory by ${flow.closing.finishedGoods - flow.opening.finishedGoods} to ${flow.closing.finishedGoods}. Dealers request ${flow.dealerOrders}; increasing capacity alone does not create orders. A deliberate buffer may still be useful.`, ['production', 'price', 'marketing']);
  }
  if (flow.missedOrders > 0) {
    add('delivery', 'warning', 'Dealer orders cannot all ship',
      `${flow.missedOrders} of ${flow.dealerOrders} dealer orders are unfilled after using opening finished stock and current good output. Review the component, capacity and quality constraints together before raising the production target.`, ['production', 'partsBuffer', 'quality', 'maintenance']);
  }
  if (!constraints.length) add('balanced', 'info', 'No immediate flow constraint identified',
    'The forecast fits the current production request within available resources. This is not a guarantee against market or supply surprises.', ['production']);
  return constraints;
}

/** Capability, actual factory bottlenecks, and the existing investment levers. */
export function getFactoryDiagnostics(state, plan) {
  const ctx = context(state, plan);
  const result = { ...metadata(ctx), products: [], pipeline: [], investmentLevers: [
    { key: 'training', label: 'Workforce training', accounting: 'Expense and cash this month', timing: 'Capability and first-pass quality respond this month; skill accumulates.', effect: 'Builds a pooled skill index and improves first-pass quality and rework recovery. It does not represent a measured cross-training matrix or reduce standard wages per machine.' },
    { key: 'quality', label: 'Quality and supplier development', accounting: 'Expense and cash this month', timing: 'First-pass quality, rework recovery and controller fulfillment respond this month.', effect: 'Improves quality controls and rework recovery. Reliability influences warranty provision immediately, installed-base claims gradually, and reputation over time.' },
    { key: 'maintenance', label: 'Preventive maintenance', accounting: 'Expense and cash this month', timing: 'Plant condition and available capacity respond this month.', effect: 'Offsets wear; sustained overtime causes extra wear. A healthier plant still needs components and customer orders.' },
    { key: 'capex', label: 'Factory capacity investment', accounting: 'Cash outflow and fixed asset now; depreciation is expensed over time.', timing: 'A new commitment adds capacity after three further rounds: a month 1 commitment becomes available in month 4.', effect: 'Each $1m completed adds 0.4 percentage points to the shared capacity bonus, capped at 40%. It does not independently lower standard unit costs or improve quality.' },
    { key: 'rd', label: 'Product engineering', accounting: 'Expense and cash this month', timing: 'A new commitment improves technology after three further rounds.', effect: 'Each $1m completed adds 0.007 to the technology index, subject to decay and bounds. Technology supports demand; engineering is not modeled as a factory quality or cost-reduction project.' },
  ], assumptions: [
    'Diagnostics explain the current plan’s mean forecast, using the same physical flows as the game. They are not an optimized prescription and do not reveal future shocks.',
    'Nominal capacity is the product’s base rate. Available capacity includes condition, skill, matured capex and overtime; rework then consumes assembly slots. Utilization is assembled units divided by remaining assembly capacity, so a controller shortage can leave assembly completion below available slots.',
    'Work-slot utilization also counts started units left incomplete. First-pass good output excludes defects; total good production adds recovered rework. Those are different measures.',
    'Capability, condition, reputation and technology are synthetic indices. Skill is not a percentage of cross-trained employees. This version has no separate training matrix or selectable automation, tooling or engineering project catalogue.',
    'If the plan is invalid or the campaign has ended, current capability remains available but there is no invented next-month forecast. Latest actual flow is labeled separately.',
  ] };
  if (ctx.status === 'invalid-state') return result;
  result.pipeline = [
    ...state.capexPipeline.map(project => ({ type: 'capex', label: 'Factory capacity', amountM: project.amount, remainingRounds: project.remaining, availableMonth: state.month + project.remaining })),
    ...state.rdPipeline.map(project => ({ type: 'rd', label: 'Product engineering', amountM: project.amount, remainingRounds: project.remaining, availableMonth: state.month + project.remaining })),
  ];
  const latest = state.history.at(-1);
  result.products = PRODUCTS.map(product => {
    const current = capability(state.products[product.id]);
    const projected = ctx.projected ? capability(ctx.projected.state.products[product.id]) : null;
    const report = ctx.projected?.report.products.find(row => row.id === product.id);
    const flow = report ? flowDetails(report) : null;
    const actual = latest?.products.find(row => row.id === product.id);
    const constraints = flow ? constraintsFor(product, current, projected, flow) : [];
    return {
      id: product.id, name: product.name, current, projected, nominalCapacity: product.capacity,
      flow, latestActual: actual ? { month: latest.month, ...flowDetails(actual) } : null,
      constraints, primaryConstraint: constraints[0] ?? null,
    };
  });
  return result;
}
