/**
 * Read-only planning analytics for the synthetic campaign.
 * Currency is USD millions unless named referencePrice ($000); ratios are fractions.
 * This layer does not alter simulation mechanics, save data, or the model version.
 */
import { PRODUCTS, CYCLICAL_MODEL_VERSION, balanceSheet, forecast, getMarketOutlook, validatePlan, validateState } from './simulation.js';

const BASELINE_UNIT_SHARES = Object.freeze({ tractor: 0.20, harvester: 0.18, loader: 0.16 });
const CORPORATE_CREDIT_LIMIT = 160;
const CASH_WATCH_LEVEL = 20;
const sum = values => values.reduce((total, value) => total + value, 0);
const money = value => Math.round((value + Number.EPSILON) * 1e9) / 1e9;
const change = (next, prior) => prior > 0 ? (next - prior) / prior : null;
const active = state => state.status === 'active' && state.month < 12;
const reportDemand = report => sum(report.products.map(product => product.demand));
const expectedDemand = report => sum(report.products.map(product => product.expectedDemand));

function checkState(state) {
  const checked = validateState(state);
  if (!checked.valid) throw new Error(`Invalid simulation state: ${checked.errors.join(' ')}`);
}

function checkPlan(state, plan) {
  const checked = validatePlan(plan, state);
  if (!checked.valid) throw new Error(`Invalid operating plan: ${checked.errors.join(' ')}`);
  return checked.plan;
}

/** Public scenario/observed denominator. Player decisions affect the numerator. */
function marketTimeline(state) {
  const timeline = [];
  for (let month = 1; month <= 12; month += 1) {
    const outlook = getMarketOutlook({ ...state, month: month - 1 });
    const products = PRODUCTS.map(product => {
      const season = product.segment === 'Agriculture' ? outlook.agriculture : outlook.construction;
      const units = Math.round(product.baseDemand / BASELINE_UNIT_SHARES[product.id] * season);
      const prior = timeline.at(-1)?.products.find(item => item.id === product.id);
      return {
        id: product.id, name: product.name, segment: product.segment,
        units, value: money(units * product.basePrice / 1000),
        marketChange: prior ? change(units, prior.units) : null,
      };
    });
    const units = sum(products.map(product => product.units));
    timeline.push({
      month, units, value: money(sum(products.map(product => product.value))),
      marketChange: timeline.length ? change(units, timeline.at(-1).units) : null,
      products,
    });
  }
  return timeline;
}

function actualShare(report, market) {
  return {
    month: report.month, marketUnits: market.units, marketValue: market.value,
    retailSales: report.metrics.retailSales, unitShare: report.metrics.retailSales / market.units,
  };
}

function nextShare(report, market, prior) {
  const demand = report ? expectedDemand(report) : null;
  return {
    month: market.month, marketUnits: market.units, marketValue: market.value,
    marketChange: market.marketChange, expectedDemand: demand,
    expectedRetailSales: report?.metrics.retailSales ?? null,
    expectedUnitShare: report ? report.metrics.retailSales / market.units : null,
    retailSalesChange: report && prior ? change(report.metrics.retailSales, prior.metrics.retailSales) : null,
    demandChange: report && prior ? change(demand, reportDemand(prior)) : null,
  };
}

/**
 * Returns a 12-month modeled addressable market and observed/expected unit shares.
 * No observed share is invented before the first committed month. Invalid active
 * plans throw; omitting a plan returns public market context with null company
 * projections. A terminal campaign still returns market context with next=null.
 */
export function getMarketIntelligence(state, plan) {
  checkState(state);
  const timeline = marketTimeline(state);
  const cyclical = state.version === CYCLICAL_MODEL_VERSION;
  const last = state.history.at(-1) ?? null;
  const nextReport = active(state) && plan != null ? forecast(state, checkPlan(state, plan)).report : null;
  const upcomingMarket = active(state) ? timeline[state.month] : null;
  const annual = {
    units: sum(timeline.map(month => month.units)),
    value: money(sum(timeline.map(month => month.value))),
  };
  return {
    scope: 'Modeled addressable market for three equipment families in this campaign; not the global equipment market or reported CNH market share.',
    methodology: `Monthly industry units equal baseline company demand divided by an assumed reference unit share, multiplied by ${cyclical ? 'the observed category conditions for completed months and the latest public outlook for future months' : 'the public category outlook'}. Annual value sums twelve months at fixed reference retail prices. Company share uses customer retail sales, not dealer shipments.`,
    assumptions: [
      'Synthetic reference unit shares: tractors 20%, harvesters 18%, loaders 16%. These scale the market; they are not measured or guaranteed company shares.',
      'Reference retail prices are $145k per tractor, $360k per harvester, and $195k per loader. Market value excludes financing and does not equal company wholesale revenue.',
      cyclical ? 'Industry demand includes observed cycle changes and shocks for completed months. Future months use the latest public outlook without seeing future events. Player decisions do not resize industry demand; the full-year reference updates as conditions become known.' : 'Industry demand follows the public seasonal outlook. Player prices, spending, financing rates, production, and hidden random events do not resize this denominator.',
      'Month-over-month changes compare the next month with the last completed month. No prior-year month is invented for month 1. Future company results are expected scenarios, not guarantees.',
    ],
    annual, timeline,
    current: last ? actualShare(last, timeline[last.month - 1]) : null,
    next: upcomingMarket ? nextShare(nextReport, upcomingMarket, last) : null,
    products: PRODUCTS.map(product => {
      const annualUnits = sum(timeline.map(month => month.products.find(item => item.id === product.id).units));
      const currentProduct = last?.products.find(item => item.id === product.id);
      const currentMarket = last ? timeline[last.month - 1].products.find(item => item.id === product.id) : null;
      const nextProduct = nextReport?.products.find(item => item.id === product.id);
      const nextMarket = upcomingMarket?.products.find(item => item.id === product.id);
      return {
        id: product.id, name: product.name, segment: product.segment,
        referencePrice: product.basePrice, baselineUnitShare: BASELINE_UNIT_SHARES[product.id],
        annualUnits, annualValue: money(annualUnits * product.basePrice / 1000),
        current: currentProduct ? {
          month: last.month, marketUnits: currentMarket.units, marketValue: currentMarket.value,
          retailSales: currentProduct.retailSales, unitShare: currentProduct.retailSales / currentMarket.units,
        } : null,
        next: nextMarket ? {
          month: upcomingMarket.month, marketUnits: nextMarket.units, marketValue: nextMarket.value,
          marketChange: nextMarket.marketChange, expectedDemand: nextProduct?.expectedDemand ?? null,
          expectedRetailSales: nextProduct?.retailSales ?? null, expectedUnitShare: nextProduct ? nextProduct.retailSales / nextMarket.units : null,
          retailSalesChange: nextProduct && currentProduct ? change(nextProduct.retailSales, currentProduct.retailSales) : null,
          demandChange: nextProduct && currentProduct ? change(nextProduct.expectedDemand, currentProduct.demand) : null,
        } : null,
      };
    }),
  };
}

function position(state) {
  const sheet = balanceSheet(state);
  return {
    ...sheet,
    operatingWorkingCapital: money(sheet.receivables + sheet.inventory - sheet.payables),
    corporateCreditHeadroom: money(Math.max(0, CORPORATE_CREDIT_LIMIT - sheet.corporateDebt)),
    netDebt: money(sheet.debt - sheet.cash),
  };
}

/** Book values, working capital, and available corporate borrowing; no maturity assumptions. */
export function getFinancialPosition(state) {
  checkState(state);
  return position(state);
}

function projectionWarnings(current, months) {
  if (!months.length) return [];
  const warnings = [];
  const negativeCash = months.find(month => month.position.cash < 0);
  const lowCash = months.find(month => month.position.cash >= 0 && month.position.cash < CASH_WATCH_LEVEL);
  if (negativeCash) warnings.push({
    id: 'negative-cash', severity: 'danger', month: negativeCash.month,
    title: 'Projected cash falls below zero',
    detail: `Month ${negativeCash.month} ends at $${negativeCash.position.cash.toFixed(1)}m cash under this plan. Two consecutive negative-cash months can end the mandate.`,
    action: 'Reduce inventory purchases or discretionary spending, improve collections through stronger sales, or use available corporate borrowing before committing.',
  });
  else if (lowCash) warnings.push({
    id: 'cash-watch', severity: 'warning', month: lowCash.month,
    title: 'Projected cash cushion is thin',
    detail: `Month ${lowCash.month} ends at $${lowCash.position.cash.toFixed(1)}m, below the illustrative $${CASH_WATCH_LEVEL}m planning watch level. This is a planning alert, not a debt covenant.`,
    action: 'Compare a lower-inventory plan and preserve borrowing headroom for supplier or demand surprises.',
  });
  const ending = months.at(-1);
  const workingCapitalIncrease = ending.position.operatingWorkingCapital - current.operatingWorkingCapital;
  if (workingCapitalIncrease > 5) warnings.push({
    id: 'working-capital', severity: 'warning', month: ending.month,
    title: 'More cash is tied up in operations',
    detail: `Receivables plus inventory less payables rise by $${workingCapitalIncrease.toFixed(1)}m through month ${ending.month}. This reduces cash available for other commitments.`,
    action: 'Match production and component buffers to dealer replenishment, and review unsold finished goods before adding capacity.',
  });
  const unmetDemand = months.find(month => month.report.products.some(product => product.lostSales > 0));
  if (unmetDemand) {
    const lostSales = sum(unmetDemand.report.products.map(product => product.lostSales));
    warnings.push({
      id: 'unserved-demand', severity: 'warning', month: unmetDemand.month,
      title: 'Some expected retail demand cannot be served',
      detail: `Month ${unmetDemand.month} has ${lostSales} expected customer requests beyond available dealer stock. Market opportunity alone does not create sales.`,
      action: 'Inspect constrained product families, controller supply, production targets, and quality before raising demand spending.',
    });
  }
  if (ending.status === 'distressed') warnings.push({
    id: 'projected-distress', severity: 'danger', month: ending.month,
    title: 'This projection ends the mandate early',
    detail: `The expected scenario reaches financial distress in month ${ending.month}; later months are not projected.`,
    action: 'Revise the operating and financing plan before advancing the live campaign.',
  });
  return warnings;
}

/**
 * Sequential mean-outcome planning, stopping at requested horizon, distress, or M12.
 * The current policy repeats, except borrowing/repayment and capex are one-time.
 * This function never advances or modifies the live state or its saved history.
 */
export function projectBusiness(state, plan, horizon = 3) {
  checkState(state);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 12) throw new Error('Projection horizon must be a whole number of months between 1 and 12.');
  const current = position(state);
  const result = {
    horizonRequested: horizon, horizonAvailable: Math.max(0, 12 - state.month),
    assumptions: [
      'Expected scenario using public demand and average operating outcomes; this is not a guarantee or a probability range.',
      'Current prices, production targets, recurring budgets, overtime, component buffer, and customer APR repeat each month.',
      'Corporate borrowing or repayment and capital expenditure apply in the first projected month only, then reset to zero.',
      'Each month carries forward inventory, dealer stock, receivables, payables, loans, capabilities, and investment lead times. Projection stops at financial distress or month 12.',
      'All figures are synthetic USD millions. Operating working capital is receivables plus factory inventory less payables; net debt includes corporate and customer-finance debt, less cash.',
    ],
    current, months: [], ending: { ...current }, stopReason: null, warnings: [],
  };
  if (!active(state)) {
    result.stopReason = 'campaign-ended';
    return result;
  }
  const firstPlan = checkPlan(state, plan);
  const subsequentPlan = { ...firstPlan, debtChange: 0, capex: 0 };
  const timeline = marketTimeline(state);
  let projectedState = state;
  let priorReport = state.history.at(-1) ?? null;
  const count = Math.min(horizon, result.horizonAvailable);
  for (let index = 0; index < count; index += 1) {
    const { state: nextState, report } = forecast(projectedState, index === 0 ? firstPlan : subsequentPlan);
    const monthPosition = position(nextState);
    result.months.push({
      month: report.month, status: nextState.status, report,
      openingBalanceSheet: { ...report.openingBalanceSheet }, balanceSheet: { ...report.balanceSheet },
      position: monthPosition,
      comparison: { kind: priorReport ? (index === 0 ? 'actual' : 'projection') : 'none', month: priorReport?.month ?? null },
      changes: {
        revenue: priorReport ? change(report.metrics.revenue, priorReport.metrics.revenue) : null,
        retailSales: priorReport ? change(report.metrics.retailSales, priorReport.metrics.retailSales) : null,
        demand: priorReport ? change(expectedDemand(report), reportDemand(priorReport)) : null,
        market: timeline[report.month - 1].marketChange,
      },
      cashBridge: report.drivers.map(driver => ({ ...driver })),
    });
    result.ending = { ...monthPosition };
    projectedState = nextState;
    priorReport = report;
    if (nextState.status === 'distressed') { result.stopReason = 'distress'; break; }
    if (nextState.month === 12) { result.stopReason = 'year-end'; break; }
  }
  result.warnings = projectionWarnings(current, result.months);
  return result;
}
